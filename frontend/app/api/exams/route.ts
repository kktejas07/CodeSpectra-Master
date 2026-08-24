import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getGeneralSettings } from '@/lib/platform-general-settings-server'
import { backendComplete } from '@/lib/ai/backend'
import { platformModelOverrides } from '@/lib/ai/platform-model-overrides'
import { sampleFromBank, bankToExamQuestion } from '@/lib/question-bank'

export const runtime = 'nodejs'

type QuestionType = 'mcq' | 'multiple_response' | 'true_false' | 'coding' | 'descriptive' | 'fill_blanks'

interface QuestionDoc {
  id: string
  type: QuestionType
  title: string
  prompt: string
  options?: string[]
  answer?: string
  score: number
}

const CODE_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)```/

function tryParseJsonArray(s: string): unknown[] | null {
  const trimmed = s.trim()
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object') {
      for (const key of ['questions', 'data', 'items', 'results']) {
        if (Array.isArray(parsed[key])) return parsed[key]
      }
    }
  } catch { /* ignore */ }
  const match = trimmed.match(CODE_BLOCK_RE)
  if (match) {
    try {
      const inner = JSON.parse(match[1].trim())
      if (Array.isArray(inner)) return inner
    } catch { /* ignore */ }
  }
  const arrMatch = trimmed.match(/\[[\s\S]*?\]/)
  if (arrMatch) {
    try {
      const inner = JSON.parse(arrMatch[0])
      if (Array.isArray(inner)) return inner
    } catch { /* ignore */ }
  }
  return null
}

const VALID_TYPES: QuestionType[] = ['mcq', 'multiple_response', 'true_false', 'coding', 'descriptive', 'fill_blanks']

function normalizeQuestion(raw: Record<string, unknown>): QuestionDoc {
  const type = VALID_TYPES.includes(raw.type as QuestionType) ? (raw.type as QuestionType) : 'mcq'
  const options = Array.isArray(raw.options) ? raw.options.map(String).filter(Boolean) : undefined
  const answer = raw.answer ? String(raw.answer) : undefined
  return {
    id: crypto.randomUUID(),
    type,
    title: String(raw.title || 'Question'),
    prompt: String(raw.prompt || ''),
    options: ['mcq', 'multiple_response', 'true_false', 'fill_blanks'].includes(type) ? options : undefined,
    answer: type === 'coding' || type === 'descriptive' ? answer : answer,
    score: Number(raw.score) || 10,
  }
}

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()

    const tenantFilter: Record<string, unknown> = {}
    if (gate.user.role === 'tenant_admin' && gate.user.tenantId) {
      tenantFilter.tenant_id = gate.user.tenantId
    }

    // Non-admin users see open exams + exams they were invited to or have submitted
    let filter: Record<string, unknown> = {}
    if (gate.user.role === 'superadmin') {
      filter = {}
    } else if (gate.user.role === 'tenant_admin') {
      // Tenant admins only see exams created within their organization
      filter = gate.user.tenantId ? { tenant_id: gate.user.tenantId } : { _id: null }
    } else {
      const userId = gate.user.id
      const [submissions, invites] = await Promise.all([
        db.collection('exam_submissions').find({ user_id: userId }).project({ exam_id: 1 }).toArray(),
        db.collection('candidate_invites').find({
          $or: [
            { user_id: userId },
            { email: gate.user.email },
            { email: { $regex: new RegExp(`^${String(gate.user.email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
          ],
        }).project({ target_url: 1, assigned_assessments: 1, email: 1 }).toArray(),
      ])
      const userExamIds = new Set<string>()
      submissions.forEach((s: any) => { if (s.exam_id) userExamIds.add(s.exam_id) })
      invites.forEach((inv: any) => {
        const fromUrl = inv.target_url?.match(/\/assessment\/([^/?]+)/)?.[1]
        if (fromUrl) userExamIds.add(fromUrl)
        inv.assigned_assessments?.forEach((a: any) => { if (a.id) userExamIds.add(a.id) })
      })
      if (userExamIds.size > 0) {
        filter = { $or: [{ access_type: 'open' }, { id: { $in: [...userExamIds] } }] }
      } else {
        filter = { access_type: 'open' }
      }
    }
    const data = await db.collection('exams').find(filter).toArray()
    
    // Aggregate attempts, released scores, and average scores from submissions
    const stats = await db.collection('exam_submissions').aggregate([
      {
        $group: {
          _id: '$exam_id',
          attempts: { $sum: 1 },
          released: { $sum: { $cond: [ { $gt: ["$released_at", null] }, 1, 0 ] } },
          totalScore: { $sum: '$score' },
          totalMaxScore: { $sum: '$max_score' },
        }
      }
    ]).toArray()
    const statsMap = new Map(stats.map(s => [s._id, s]))

    const allInvites = await db.collection('candidate_invites').find({}, { projection: { target_url: 1, assigned_assessments: 1 } }).toArray()
    const invitesMap = new Map<string, number>()
    for (const inv of allInvites) {
      const urls = [inv.target_url, ...(inv.assigned_assessments || []).map((a: any) => a.target_url)].filter(Boolean)
      const examIds = urls.map(url => url.match(/\/assessment\/([a-zA-Z0-9-]+)/)?.[1]).filter(Boolean)
      for (const eid of examIds) {
        invitesMap.set(eid, (invitesMap.get(eid) || 0) + 1)
      }
    }

    // Get current user's submissions to set completed/pending status
    const userSubmissions = await db.collection('exam_submissions').find({ user_id: gate.user.id }).toArray()
    const submissionMap = new Map(userSubmissions.map(s => [s.exam_id, s]))

    const examsList = data.map(exam => {
      const examStats = statsMap.get(exam.id) || { attempts: 0, totalScore: 0, totalMaxScore: 0 }
      const userSub = submissionMap.get(exam.id)
      const avgPercent = examStats.totalMaxScore > 0 
        ? Math.round((examStats.totalScore / examStats.totalMaxScore) * 100)
        : 0

      const isReleased = userSub?.score_released === true
      const isAdmin = gate.user.role === 'superadmin' || gate.user.role === 'tenant_admin'
      // Non-admins must never receive answer keys via the list endpoint.
      const { questionList: _q, ...safeExam } = isAdmin ? exam : { ...exam, questionList: [] }
      void _q
      return {
        ...safeExam,
        attempts: examStats.attempts,
        released: examStats.released || 0,
        invites: invitesMap.get(exam.id) || 0,
        avgScore: avgPercent,
        status: userSub ? (isReleased ? 'completed' : 'submitted') : 'pending',
        ...(isReleased && { score: Math.round((userSub.score / (userSub.max_score || 1)) * 100) }),
      }
    })

    return NextResponse.json({ data: examsList })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch exams'
    console.error('[CodeSpectra] GET /api/exams error:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const user = gate.user
  if (user.role !== 'superadmin' && user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await request.json()
    const db = await getMongoDb()
    const now = new Date().toISOString()
    const numQuestions = body.questions || 5
    const stacks = body.techStack || ['General']
    const degreeType = String(body.degree_type || '').toLowerCase() || undefined
    const branch = String(body.branch || '').toLowerCase() || undefined
    const screeningType = ['aptitude', 'technical', 'coding', 'mixed'].includes(String(body.screening_type))
      ? String(body.screening_type)
      : 'mixed'
    const typePoolByScreening: Record<string, QuestionType[]> = {
      aptitude: ['mcq', 'true_false'],
      technical: ['mcq', 'multiple_response', 'fill_blanks', 'true_false'],
      coding: ['coding', 'mcq'],
      mixed: ['mcq', 'multiple_response', 'true_false', 'coding', 'descriptive', 'fill_blanks'],
    }
    const allowedTypes = typePoolByScreening[screeningType]
    let questionList: QuestionDoc[] = []

    // 1) Prefer auto-picking from the question bank (branch/degree aware).
    if (numQuestions > 0 && body.auto_pick !== false) {
      try {
        const picked = await sampleFromBank({
          branch,
          degree_type: degreeType,
          types: allowedTypes,
          count: numQuestions,
        })
        questionList = picked.map((b) => bankToExamQuestion(b) as unknown as QuestionDoc)
      } catch (e) {
        console.error('[exams] bank auto-pick failed:', e)
      }
    }

    // 2) Top up any shortfall with AI generation.
    const remaining = numQuestions - questionList.length
    if (remaining > 0) {
      try {
        const typesStr = allowedTypes.join('|')
        const topicsList = stacks.join(', ')
        const aiPrompt = 'Generate a ' + body.level + ' level assessment for: ' + (body.subject || 'General') + '.\n' +
          'Topics/skills to assess: ' + topicsList + '.\n' +
          'Duration: ' + (body.duration || 60) + ' minutes.\n' +
          'Number of questions: ' + remaining + '.\n\n' +
          'REQUIREMENTS:\n' +
          '- Each question must test a DIFFERENT specific concept or skill\n' +
          '- Questions must be realistic, practical, and job-relevant — like a real screening test\n' +
          '- Write clear, specific questions with well-crafted wrong options that seem plausible (good distractors)\n' +
          '- Include a mix of conceptual, practical, scenario-based, and coding questions\n' +
          '- Coding questions should describe a real task with expected output or behavior\n' +
          '- For mcq: exactly 4 distinct options, one clearly correct, others realistic but wrong\n' +
          '- For multiple_response: 4-5 options, mark ALL correct answers in answer field (comma separated)\n' +
          '- For true_false: options=["True","False"], answer="True" or "False"\n' +
          '- For coding: omit options and answer, prompt must describe a specific coding task\n' +
          '- For descriptive: omit options, answer should be key points or a model answer\n' +
          '- For fill_blanks: use ___ in prompt for blanks, answer is the missing word(s)\n\n' +
          'Return ONLY a JSON array. Each object must match: { type:"' + typesStr + '", title:string, prompt:string, options?:string[], answer?:string, score:number }.\n' +
          'Never repeat content. Return exactly ' + remaining + ' items.'
        const aiRes = await backendComplete({
          systemMessage: 'You are a senior technical assessor who creates realistic job screening questions. Each question must test a distinct skill with realistic distractors. Return ONLY valid JSON.',
          userMessage: aiPrompt,
          responseFormat: 'json',
          ...(await platformModelOverrides()),
        })
        const rawJson = aiRes.ok ? (aiRes.json || (aiRes.text ? tryParseJsonArray(aiRes.text) : null)) : null
        if (rawJson && Array.isArray(rawJson) && rawJson.length > 0) {
          const aiQuestions = (rawJson as Array<Record<string, unknown>>).map((q: Record<string, unknown>) => normalizeQuestion(q as Record<string, unknown>))
          questionList = [...questionList, ...aiQuestions].slice(0, numQuestions)
        }
      } catch {
        // AI fallback
      }
    }

    if (questionList.length === 0 && numQuestions > 0) {
      const typesPool: QuestionType[] = allowedTypes
      for (let i = 0; i < numQuestions; i++) {
        const stack = stacks[i % stacks.length]
        const type = typesPool[i % typesPool.length]
        const sub = ['Fundamentals', 'Best Practices', 'Problem Solving', 'Debugging', 'Architecture', 'Performance'][i % 6]
        const q: QuestionDoc = {
          id: crypto.randomUUID(),
          type,
          title: `${stack} ${sub}: Question ${i + 1}`,
          prompt: '',
          score: 10,
        }
        if (type === 'coding') {
          q.prompt = `Write a ${stack} function that demonstrates ${sub.toLowerCase()} at a ${body.level || 'Beginner'} level. Include input validation, edge cases, and follow best practices.`
        } else if (type === 'true_false') {
          q.prompt = `In ${stack}, ${sub.toLowerCase()} is an important concept that every ${body.level || 'Beginner'} should know. Determine if the following statement is true or false.`
          q.options = ['True', 'False']
          q.answer = 'True'
        } else if (type === 'multiple_response') {
          q.prompt = `Which of the following are valid approaches for ${sub.toLowerCase()} in ${stack}? (Select all that apply)`
          q.options = [`Standard ${stack} approach`, `Alternative valid method`, `Common best practice`, `This is incorrect for ${stack}`, `Outdated technique`]
          q.answer = `Standard ${stack} approach, Alternative valid method, Common best practice`
        } else if (type === 'descriptive') {
          q.prompt = `Explain the concept of ${sub.toLowerCase()} in the context of ${stack}. Describe best practices, common pitfalls, and provide a real-world example.`
        } else if (type === 'fill_blanks') {
          q.prompt = `In ${stack}, the process of ${sub.toLowerCase()} involves using ___ to ensure quality and ___ for maintainability.`
          q.options = [`testing`, `standards`, `automation`, `documentation`, `reviews`]
          q.answer = 'testing, documentation'
        } else {
          q.prompt = `Which of the following best describes ${sub.toLowerCase()} in ${stack}?`
          q.options = [
            `The standard approach for ${sub.toLowerCase()} in ${stack}`,
            `An outdated pattern no longer recommended`,
            `A technique used only in legacy systems`,
            `A concept unrelated to ${stack}`,
          ]
          q.answer = `The standard approach for ${sub.toLowerCase()} in ${stack}`
        }
        questionList.push(q)
      }
    }

    const doc = {
      id: crypto.randomUUID(),
      title: body.title,
      subject: body.subject || '',
      level: body.level || 'Beginner',
      degree_type: degreeType,
      branch,
      screening_type: screeningType,
      techStack: stacks,
      duration: body.duration || 60,
      questions: numQuestions,
      questionList,
      access_type: body.access_type || 'invite_only',
      published: body.published ?? false,
      cert_template: body.cert_template || (await getGeneralSettings()).certificate_template,
      attempts: 0,
      avgScore: 0,
      created_by: user.id,
      tenant_id: user.tenantId || null,
      createdAt: now,
      updatedAt: now,
    }
    await db.collection('exams').insertOne(doc)
    return NextResponse.json(doc, { status: 201 })
  } catch (e) {
    console.error('[exams] POST error:', e)
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const user = gate.user
  if (user.role !== 'superadmin' && user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const body = await request.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const db = await getMongoDb()
    if (user.role === 'tenant_admin' && user.tenantId) {
      const exam = await db.collection('exams').findOne({ id })
      if (!exam) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (exam.tenant_id !== user.tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await db.collection('exams').updateOne({ id }, { $set: { ...updates, updatedAt: new Date().toISOString() } })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function DELETE(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const user = gate.user
  if (user.role !== 'superadmin' && user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const db = await getMongoDb()
    if (user.role === 'tenant_admin' && user.tenantId) {
      const exam = await db.collection('exams').findOne({ id })
      if (!exam) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (exam.tenant_id !== user.tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await db.collection('exams').deleteOne({ id })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
