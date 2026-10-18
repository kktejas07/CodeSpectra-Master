/**
 * Platform library sources: coding problems, question bank, courses.
 *
 * Problems: statement, formats, constraints, topics, difficulty and SAMPLE
 * tests only (hidden tests are the grading key). Question bank: prompt,
 * options, topics; the answer/explanation go to `metadata.staff` only and
 * never into searchable text. Courses: lesson text.
 */
import type { Db } from 'mongodb'
import type { ExtractedSource } from '../types'
import { arr, fields, str, strList, tenantOf, type Doc } from './util'

// ─── Problems ────────────────────────────────────────────────────────────────

export function problemSource(p: Doc): ExtractedSource | null {
  const slug = str(p.slug, 200)
  const id = str(p.id, 200) || slug
  if (!id || p.is_published === false) return null
  const tenant = tenantOf(p)
  const hackathonOnly = p.visibility === 'hackathon_only'
  const samples = arr(p.test_cases)
    .filter((t) => t.is_sample === true && t.hidden !== true && t.is_hidden !== true)
    .slice(0, 3)
    .map((t, i) => `Sample ${i + 1}\nInput:\n${str(t.stdin ?? t.input, 1000)}\nOutput:\n${str(t.expected_stdout ?? t.output, 1000)}`)
  const text = [
    fields([['Difficulty', p.difficulty], ['Topics', p.topics]]),
    '## Statement',
    str(p.statement_md, 12_000),
    p.input_format ? `## Input format\n${str(p.input_format, 3000)}` : '',
    p.output_format ? `## Output format\n${str(p.output_format, 3000)}` : '',
    p.constraints ? `## Constraints\n${str(p.constraints, 3000)}` : '',
    p.example_explanation ? `## Example explanation\n${str(p.example_explanation, 3000)}` : '',
    samples.length ? `## Sample tests\n${samples.join('\n\n')}` : '',
  ].filter(Boolean).join('\n\n')
  return {
    type: 'problem',
    source_id: id,
    tenant_id: tenant,
    // Event-only problems stay out of reach of other organisations before the event.
    visibility: tenant ? 'tenant' : hackathonOnly ? 'platform_admin' : 'public',
    title: str(p.title, 200) || slug,
    url: slug ? `/dashboard/problems/${encodeURIComponent(slug)}` : null,
    text,
    metadata: { slug, difficulty: str(p.difficulty, 20), topics: strList(p.topics) },
  }
}

export async function loadProblem(db: Db, id: string): Promise<ExtractedSource | null> {
  const p = await db.collection('problems').findOne({ $or: [{ id }, { slug: id }] })
  return p ? problemSource(p as Doc) : null
}

export async function listProblemIds(db: Db, limit: number): Promise<string[]> {
  const rows = await db.collection('problems')
    .find({ is_published: { $ne: false } }, { projection: { _id: 0, id: 1, slug: 1 } })
    .limit(limit).toArray()
  return rows.map((r) => str(r.id, 200) || str(r.slug, 200)).filter(Boolean)
}

// ─── Question bank ───────────────────────────────────────────────────────────

export function questionSource(q: Doc): ExtractedSource | null {
  const id = str(q.id, 200)
  if (!id || q.is_active === false || q.review_status === 'draft') return null
  const options = strList(q.options, 12, 400)
  const text = [
    fields([
      ['Type', q.type], ['Difficulty', q.difficulty], ['Marks', q.marks], ['Subject', q.subject],
      ['Tech stack', q.tech_stack], ['Tags', q.tags], ['Branch', q.branch], ['Level', q.level],
      ['Industry', q.industry], ['Category', q.assessment_category],
    ]),
    '## Question',
    str(q.question, 6000),
    options.length ? `## Options\n${options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  return {
    type: 'question',
    source_id: id,
    tenant_id: tenantOf(q),
    visibility: 'platform_admin',
    title: str(q.title, 200) || 'Question',
    url: '/dashboard/admin/question-bank',
    text,
    // Staff-only: never chunked, never returned by search.
    metadata: { staff: { answer: str(q.answer, 2000), explanation: str(q.explanation, 4000) } },
  }
}

export async function loadQuestion(db: Db, id: string): Promise<ExtractedSource | null> {
  const q = await db.collection('question_bank').findOne({ id })
  return q ? questionSource(q as Doc) : null
}

export async function listQuestionIds(db: Db, limit: number): Promise<string[]> {
  const rows = await db.collection('question_bank')
    .find({ is_active: { $ne: false }, review_status: { $ne: 'draft' } }, { projection: { _id: 0, id: 1 } })
    .limit(limit).toArray()
  return rows.map((r) => str(r.id, 200)).filter(Boolean)
}

// ─── Courses ─────────────────────────────────────────────────────────────────

export function courseSource(c: Doc): ExtractedSource | null {
  const id = str(c.id, 200)
  if (!id || c.status === 'draft' || c.published === false) return null
  const parts: string[] = [
    fields([['Level', c.level], ['Category', c.category], ['Tags', c.tags], ['Duration', c.duration], ['Instructor', c.instructor]]),
    str(c.description, 4000),
  ]
  const learn = strList(c.whatYoullLearn, 20, 300)
  if (learn.length) parts.push(`## What you'll learn\n${learn.map((l) => `- ${l}`).join('\n')}`)
  let budget = 200_000
  for (const s of arr(c.sections)) {
    if (budget <= 0) break
    parts.push(`## ${str(s.title, 200) || 'Module'}`)
    if (s.description) parts.push(str(s.description, 2000))
    for (const l of arr(s.lessons)) {
      if (budget <= 0) break
      const body = [str(l.description, 2000), str(l.content, 20_000)].filter(Boolean).join('\n\n')
      const block = `### ${str(l.title, 200) || 'Lesson'}\n\n${body}`
      budget -= block.length
      parts.push(block)
    }
  }
  return {
    type: 'course',
    source_id: id,
    tenant_id: tenantOf(c),
    visibility: tenantOf(c) ? 'tenant' : 'public',
    title: str(c.title, 200) || 'Course',
    url: `/dashboard/courses/${encodeURIComponent(id)}`,
    text: parts.filter(Boolean).join('\n\n'),
  }
}

export async function loadCourse(db: Db, id: string): Promise<ExtractedSource | null> {
  const c = await db.collection('courses').findOne({ id })
  return c ? courseSource(c as Doc) : null
}

export async function listCourseIds(db: Db, limit: number): Promise<string[]> {
  const rows = await db.collection('courses').find({}, { projection: { _id: 0, id: 1 } }).limit(limit).toArray()
  return rows.map((r) => str(r.id, 200)).filter(Boolean)
}
