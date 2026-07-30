import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { backendComplete } from '@/lib/ai/backend'

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

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'Multiple Choice',
  multiple_response: 'Multiple Response',
  true_false: 'True / False',
  coding: 'Coding Challenge',
  descriptive: 'Descriptive',
  fill_blanks: 'Fill in the Blanks',
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
    const isAdmin = gate.user.role === 'superadmin' || gate.user.role === 'tenant_admin'
    const filter = isAdmin ? {} : { access_type: 'open' }
    const data = await db.collection('exams').find(filter).toArray()
    
    // Aggregate attempts and average scores from submissions
    const stats = await db.collection('exam_submissions').aggregate([
      {
        $group: {
          _id: '$exam_id',
          attempts: { $sum: 1 },
          totalScore: { $sum: '$score' },
          totalMaxScore: { $sum: '$max_score' },
        }
      }
    ]).toArray()
    const statsMap = new Map(stats.map(s => [s._id, s]))

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
      return {
        ...exam,
        attempts: examStats.attempts,
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
  try {
    const body = await request.json()
    const db = await getMongoDb()
    const now = new Date().toISOString()
    const numQuestions = body.questions || 5
    const stacks = body.techStack || ['General']
    let questionList: QuestionDoc[] = []

    if (numQuestions > 0) {
      try {
        const typesStr = Object.keys(QUESTION_TYPE_LABELS).join('|')
        const topicsList = stacks.join(', ')
        const aiPrompt = 'Generate a ' + body.level + ' level assessment for: ' + (body.subject || 'General') + '.\n' +
          'Topics/skills to assess: ' + topicsList + '.\n' +
          'Duration: ' + (body.duration || 60) + ' minutes.\n' +
          'Number of questions: ' + numQuestions + '.\n\n' +
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
          'Never repeat content. Return exactly ' + numQuestions + ' items.'
        const aiRes = await backendComplete({
          systemMessage: 'You are a senior technical assessor who creates realistic job screening questions. Each question must test a distinct skill with realistic distractors. Return ONLY valid JSON.',
          userMessage: aiPrompt,
          responseFormat: 'json',
        })
        const rawJson = aiRes.ok ? (aiRes.json || (aiRes.text ? tryParseJsonArray(aiRes.text) : null)) : null
        if (rawJson && Array.isArray(rawJson) && rawJson.length > 0) {
          questionList = (rawJson as Array<Record<string, unknown>>).map((q: Record<string, unknown>) => normalizeQuestion(q as Record<string, unknown>))
        }
      } catch {
        // AI fallback
      }
    }

    if (questionList.length === 0 && numQuestions > 0) {
      const typesPool: QuestionType[] = ['mcq', 'multiple_response', 'true_false', 'coding', 'descriptive', 'fill_blanks']
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
      techStack: stacks,
      duration: body.duration || 60,
      questions: numQuestions,
      questionList,
      access_type: body.access_type || 'invite_only',
      published: body.published ?? false,
      attempts: 0,
      avgScore: 0,
      createdAt: now,
      updatedAt: now,
    }
    await db.collection('exams').insertOne(doc)
    return NextResponse.json(doc, { status: 201 })
  } catch { return NextResponse.json({ error: 'Failed to create' }, { status: 500 }) }
}

export async function PATCH(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const body = await request.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const db = await getMongoDb()
    await db.collection('exams').updateOne({ id }, { $set: { ...updates, updatedAt: new Date().toISOString() } })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function DELETE(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const db = await getMongoDb()
    await db.collection('exams').deleteOne({ id })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
