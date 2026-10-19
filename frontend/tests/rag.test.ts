/**
 * Knowledge layer (lib/rag): chunking, rank fusion, the ACL filter, and the
 * source extractors on sample input (no DB).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { chunkText, contentHash, markdownBlocks, CHARS_PER_TOKEN } from '@/lib/rag/chunk'
import { cosine, dedupeBySource, highlightSnippet, queryTerms, reciprocalRankFusion } from '@/lib/rag/fusion'
import { canSeeChunk, effectiveVisibility, knowledgeAclFilter, MATCH_NOTHING } from '@/lib/rag/acl'
import type { AgentCaller } from '@/lib/agent/contract'
import { problemSource, questionSource, courseSource } from '@/lib/rag/sources/library'
import { testSource, resultStats, resultSummarySource, attemptSource } from '@/lib/rag/sources/assessments'
import { hackathonSource, codeathonSource } from '@/lib/rag/sources/events'
import { faqSourceToMarkdown, helpSourceToMarkdown, jsxPageToMarkdown } from '@/lib/rag/sources/docs'
import { detectUploadType, docxXmlToText, extractDocx, parseTags, readZipEntry, uploadSource } from '@/lib/rag/sources/uploads'
import { resumeText } from '@/lib/rag/sources/resumes'

const SUPER: AgentCaller = { userId: 'u-super', role: 'superadmin', tenantId: null }
const TA: AgentCaller = { userId: 'u-ta', role: 'tenant_admin', tenantId: 'acme' }

// ─── Chunking ────────────────────────────────────────────────────────────────

describe('chunkText', () => {
  it('keeps the title and section path in every chunk', () => {
    const md = '# Intro\n\nHello world.\n\n## Setup\n\nInstall things.\n\n### Linux\n\nUse apt.'
    const chunks = chunkText('Guide', md)
    expect(chunks.length).toBe(1)
    expect(chunks[0].text.startsWith('Guide\n')).toBe(true)
    expect(chunks[0].text).toContain('Use apt.')
  })

  it('tracks heading paths per block', () => {
    const blocks = markdownBlocks('# A\n\npara a\n\n## B\n\npara b\n\n# C\n\npara c')
    expect(blocks.map((b) => b.section)).toEqual([['A'], ['A', 'B'], ['C']])
  })

  it('splits long text into ~800-token chunks with overlap', () => {
    const para = (i: number) => `Paragraph ${i}. ` + 'lorem ipsum dolor sit amet '.repeat(30)
    const md = Array.from({ length: 40 }, (_, i) => para(i)).join('\n\n')
    const chunks = chunkText('Long', md, { maxTokens: 800, overlapTokens: 100 })
    expect(chunks.length).toBeGreaterThan(5)
    for (const c of chunks) expect(c.body.length).toBeLessThanOrEqual(800 * CHARS_PER_TOKEN + 50)
    // Overlap: the start of chunk 2 repeats the end of chunk 1.
    const tail = chunks[0].body.slice(-60).trim().split(' ').slice(-4).join(' ')
    expect(chunks[1].body).toContain(tail)
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i))
  })

  it('never splits inside a fenced code block that fits', () => {
    const code = '```ts\n' + 'const x = 1\n'.repeat(20) + '```'
    const chunks = chunkText('Code', `# Example\n\nIntro text.\n\n${code}\n\nAfter.`)
    const withFence = chunks.filter((c) => c.body.includes('```ts'))
    expect(withFence.length).toBe(1)
    expect(withFence[0].body).toContain(code)
  })

  it('hard-splits a single oversized block', () => {
    const chunks = chunkText('Big', 'word '.repeat(5000), { maxTokens: 200, overlapTokens: 20 })
    expect(chunks.length).toBeGreaterThan(5)
    for (const c of chunks) expect(c.body.length).toBeLessThanOrEqual(200 * CHARS_PER_TOKEN + 10)
  })

  it('content hash changes with ACL fields, not just text', () => {
    expect(contentHash(['t', 'x', 'acme', 'tenant'])).not.toBe(contentHash(['t', 'x', null, 'public']))
    expect(contentHash(['t', 'x'])).toBe(contentHash(['t', 'x']))
  })
})

// ─── Fusion + snippets ───────────────────────────────────────────────────────

describe('reciprocal rank fusion', () => {
  it('rewards ids that rank well in both lists', () => {
    const fused = reciprocalRankFusion([['a', 'b', 'c'], ['c', 'a', 'd']])
    expect(fused[0].id).toBe('a') // 1/61 + 1/62
    expect(fused.map((f) => f.id)).toEqual(['a', 'c', 'b', 'd'])
    expect(fused[0].score).toBeCloseTo(1 / 61 + 1 / 62, 10)
  })

  it('counts an id once per list and handles empty lists', () => {
    expect(reciprocalRankFusion([['a', 'a'], []])).toEqual([{ id: 'a', score: 1 / 61 }])
    expect(reciprocalRankFusion([[], []])).toEqual([])
  })

  it('cosine + dedupe', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosine([1, 0], [1, 0, 0])).toBe(0) // never compare mixed dims
    const d = dedupeBySource([
      { source_type: 'doc', source_id: '1', n: 1 }, { source_type: 'doc', source_id: '1', n: 2 }, { source_type: 'test', source_id: '1', n: 3 },
    ])
    expect(d.map((x) => x.n)).toEqual([1, 3])
  })

  it('highlights query terms in the snippet', () => {
    const s = highlightSnippet('Intro. '.repeat(80) + 'The rubric weights code quality at 30 percent.', 'rubric code quality')
    expect(s).toContain('**rubric**')
    expect(s).toContain('**quality**')
    expect(s.startsWith('…')).toBe(true)
    expect(queryTerms('What is the C++ rubric?')).toEqual(['c++', 'rubric'])
  })
})

// ─── ACL ─────────────────────────────────────────────────────────────────────

describe('knowledge ACL filter', () => {
  it('superadmin sees everything, or one tenant + platform', () => {
    expect(knowledgeAclFilter(SUPER)).toEqual({})
    expect(knowledgeAclFilter(SUPER, { tenantId: 'acme', types: ['test'] })).toEqual({
      source_type: { $in: ['test'] }, tenant_key: { $in: ['_platform', 'acme'] },
    })
    expect(knowledgeAclFilter(SUPER, { tenantId: 'bad id!' })).toBe(MATCH_NOTHING)
  })

  it('tenant admin: own tenant + public platform rows, never staff-only platform types', () => {
    const f = knowledgeAclFilter(TA) as { $or: Array<Record<string, unknown>> }
    expect(f.$or[0]).toEqual({ tenant_key: 'acme', visibility: { $in: ['tenant', 'public'] } })
    expect(f.$or[1].tenant_key).toBe('_platform')
    expect(f.$or[1].visibility).toBe('public')
    const platformTypes = (f.$or[1].source_type as { $in: string[] }).$in
    expect(platformTypes).not.toContain('resume')
    expect(platformTypes).not.toContain('attempt_summary')
    expect(platformTypes).not.toContain('question')
    expect(platformTypes).toContain('doc')
  })

  it('tenant admin cannot widen scope with tenantId, and types narrow both branches', () => {
    const f = knowledgeAclFilter(TA, { tenantId: 'other', types: ['resume', 'doc'] }) as { $or: Array<Record<string, unknown>> }
    expect(JSON.stringify(f)).not.toContain('other')
    expect(f.$or[0].source_type).toEqual({ $in: ['resume', 'doc'] })
    expect(f.$or[1].source_type).toEqual({ $in: ['doc'] })
  })

  it('denies by default', () => {
    expect(knowledgeAclFilter(null)).toBe(MATCH_NOTHING)
    expect(knowledgeAclFilter({ userId: 'x', role: 'tenant_admin', tenantId: null })).toBe(MATCH_NOTHING)
    expect(knowledgeAclFilter({ userId: 'x', role: 'user' as never, tenantId: 'acme' })).toBe(MATCH_NOTHING)
    expect(knowledgeAclFilter({ userId: '', role: 'superadmin', tenantId: null })).toBe(MATCH_NOTHING)
  })

  it('row check matches the filter', () => {
    expect(canSeeChunk(TA, { tenant_key: 'acme', visibility: 'tenant', source_type: 'resume' })).toBe(true)
    expect(canSeeChunk(TA, { tenant_key: 'other', visibility: 'tenant', source_type: 'test' })).toBe(false)
    expect(canSeeChunk(TA, { tenant_key: '_platform', visibility: 'platform_admin', source_type: 'doc' })).toBe(false)
    expect(canSeeChunk(TA, { tenant_key: '_platform', visibility: 'public', source_type: 'doc' })).toBe(true)
    expect(canSeeChunk(TA, { tenant_key: '_platform', visibility: 'public', source_type: 'attempt_summary' })).toBe(false)
    expect(canSeeChunk(SUPER, { tenant_key: 'other', visibility: 'tenant' }, 'acme')).toBe(false)
    expect(canSeeChunk(SUPER, { tenant_key: 'other', visibility: 'tenant' })).toBe(true)
  })

  it('staff-only types are never stored public', () => {
    expect(effectiveVisibility('resume', 'acme', 'public')).toBe('tenant')
    expect(effectiveVisibility('attempt_summary', null, 'public')).toBe('platform_admin')
    expect(effectiveVisibility('test', null, 'tenant')).toBe('platform_admin')
    expect(effectiveVisibility('doc', null, 'public')).toBe('public')
  })
})

// ─── Extractors ──────────────────────────────────────────────────────────────

describe('source extractors', () => {
  it('problem: sample tests only, never hidden ones', () => {
    const s = problemSource({
      id: 'p1', slug: 'two-sum', title: 'Two sum', difficulty: 'easy', topics: ['arrays'], statement_md: 'Find two numbers.',
      is_published: true,
      test_cases: [
        { stdin: '1 2', expected_stdout: '3', is_sample: true },
        { stdin: 'SECRET_IN', expected_stdout: 'SECRET_OUT', is_sample: false },
      ],
    })!
    expect(s.visibility).toBe('public')
    expect(s.text).toContain('Find two numbers.')
    expect(s.text).toContain('1 2')
    expect(s.text).not.toContain('SECRET')
    expect(problemSource({ id: 'p2', title: 'x', is_published: false })).toBeNull()
    expect(problemSource({ id: 'p3', title: 'x', visibility: 'hackathon_only' })!.visibility).toBe('platform_admin')
    expect(problemSource({ id: 'p4', title: 'x', tenant_id: 'acme' })!.visibility).toBe('tenant')
  })

  it('question bank: answer only in staff metadata', () => {
    const s = questionSource({ id: 'q1', title: 'Big O', question: 'Complexity of binary search?', options: ['O(n)', 'O(log n)'], answer: 'ANSWER_KEY_XYZ', explanation: 'EXPLAIN_XYZ', tags: ['dsa'] })!
    expect(s.text).toContain('binary search')
    expect(s.text).toContain('O(log n)')
    expect(s.text).not.toContain('ANSWER_KEY_XYZ')
    expect(s.text).not.toContain('EXPLAIN_XYZ')
    expect((s.metadata?.staff as { answer: string }).answer).toBe('ANSWER_KEY_XYZ')
    expect(questionSource({ id: 'q2', title: 'd', question: 'q', review_status: 'draft' })).toBeNull()
  })

  it('course: lesson text by module', () => {
    const s = courseSource({ id: 'c1', title: 'Java', description: 'Learn Java', sections: [{ title: 'Basics', lessons: [{ title: 'Types', content: 'int and long' }] }] })!
    expect(s.text).toContain('## Basics')
    expect(s.text).toContain('### Types')
    expect(s.text).toContain('int and long')
  })

  const exam = {
    id: 'e1', title: 'Backend engineer', subject: 'Node.js', tenant_id: 'acme', duration: 60, passing_score: 50,
    questionList: [
      { id: 'q1', title: 'Event loop', type: 'mcq', prompt: 'PROMPT_SECRET', answer: 'KEY_SECRET', points: 10 },
      { id: 'q2', title: 'Write an API', type: 'coding', points: 10, test_cases: [{ input: 'h', output: 'HIDDEN', hidden: true }] },
    ],
    sections: [{ id: 's1', title: 'Theory', question_ids: ['q1'], time_limit_minutes: 10 }, { id: 's2', title: 'Coding', question_ids: ['q2'] }],
  }

  it('test: settings, sections and question titles — no prompts, answers or tests', () => {
    const s = testSource(exam)!
    expect(s.tenant_id).toBe('acme')
    expect(s.visibility).toBe('tenant')
    expect(s.text).toContain('Section: Theory')
    expect(s.text).toContain('Event loop (mcq)')
    expect(s.text).toContain('Pass mark (%): 50')
    expect(s.text).not.toContain('PROMPT_SECRET')
    expect(s.text).not.toContain('KEY_SECRET')
    expect(s.text).not.toContain('HIDDEN')
    expect(testSource({ ...exam, tenant_id: null })!.visibility).toBe('platform_admin')
  })

  it('result summary: counts, distribution, pass rate, section averages', () => {
    const subs = [
      { user_id: 'a', score: 20, max_score: 20, details: [{ qId: 'q1', correct: true, points: 10 }, { qId: 'q2', correct: true, points: 10 }], total_time_ms: 30 * 60_000 },
      { user_id: 'b', score: 10, max_score: 20, details: [{ qId: 'q1', correct: true, points: 10 }, { qId: 'q2', correct: false, points: 10 }] },
      { user_id: 'c', score: 0, max_score: 20, details: [], has_pending_review: true },
    ]
    const st = resultStats(exam, subs)
    expect(st.submissions).toBe(3)
    expect(st.passed).toBe(2) // 100% and 50% vs 50% pass mark
    expect(st.pass_rate).toBeCloseTo(66.7, 1)
    expect(st.average_percent).toBe(50)
    expect(st.median_percent).toBe(50)
    expect(st.pending_review).toBe(1)
    expect(st.distribution.find((d) => d.band.startsWith('80'))!.count).toBe(1)
    expect(st.sections.find((s) => s.title === 'Theory')!.average_percent).toBeCloseTo(66.7, 1)
    const src = resultSummarySource(exam, subs)!
    expect(src.text).toContain('Pass rate (%): 66.7')
    expect(src.text).not.toContain('KEY_SECRET')
  })

  it('attempt summary: score, flags, identity review, outcome — staff only', () => {
    const s = attemptSource(exam, {
      user_id: 'u9', score: 10, max_score: 20, attempt_no: 1, total_time_ms: 25 * 60_000, details: [{ qId: 'q1', correct: true, points: 10 }],
      identity_check: { method: 'no_camera_upload', needs_manual_review: true }, answers: { q1: 'CANDIDATE_ANSWER' },
    }, { candidateName: 'Asha', riskEvents: { tab_switch: 3 }, outcome: 'shortlisted' })!
    expect(s.source_id).toBe('e1:u9')
    expect(s.visibility).toBe('tenant')
    expect(s.text).toContain('10 / 20 (50%)')
    expect(s.text).toContain('tab switch: 3')
    expect(s.text).toContain('Identity needs manual review: yes')
    expect(s.text).toContain('Hiring outcome: shortlisted')
    expect(s.text).not.toContain('CANDIDATE_ANSWER')
    expect(s.text).not.toContain('@')
  })

  it('hackathon + codeathon: details and rubric, no hidden tests or solutions', () => {
    const h = hackathonSource({
      id: 'h1', name: 'Spring hack', status: 'open', tenant_id: null, starts_at: '2026-05-01T10:00:00Z', ends_at: '2026-05-02T10:00:00Z',
      tasks: [{ problem_title: 'Rate limiter', difficulty: 'medium', points: 100, order: 1 }],
      features: { judging_rubrics: true, rubric_criteria: [{ name: 'Innovation', weight: 40 }] },
    })!
    expect(h.visibility).toBe('public')
    expect(h.text).toContain('Rate limiter')
    expect(h.text).toContain('Innovation: 40%')
    expect(hackathonSource({ id: 'h2', name: 'd', status: 'draft' })!.visibility).toBe('platform_admin')
    const c = codeathonSource({
      id: 'c1', title: 'Code sprint', tenant_id: 'acme',
      problems: [{ title: 'Paths', solution: 'SOLUTION_SECRET', test_cases: [{ input: '1', output: 'HIDDEN_OUT', hidden: true }] }],
    })!
    expect(c.visibility).toBe('tenant')
    expect(c.text).toContain('Paths')
    expect(c.text).not.toContain('SOLUTION_SECRET')
    expect(c.text).not.toContain('HIDDEN_OUT')
  })

  it('docs: FAQ, admin help and legal pages convert from page source', () => {
    const faq = faqSourceToMarkdown(`const faqs = [{ category: 'Billing', items: [{ q: 'Can I cancel?', a: 'Yes, from Billing. It\\'s instant.' }] }]`)
    expect(faq).toBe("## Billing\n\n### Can I cancel?\n\nYes, from Billing. It's instant.")
    const help = helpSourceToMarkdown(`{ title: 'Platform', items: [ { label: 'Users', desc: 'Manage accounts.', href: '/dashboard/admin/users' } ] }`)
    expect(help).toContain('## Platform')
    expect(help).toContain('**Users** (/dashboard/admin/users): Manage accounts.')
    const legal = jsxPageToMarkdown(`export default function P() { return (<article><h2 className="x">1. Intro</h2><p>We value &quot;privacy&quot;.{' '}Really.</p><ul><li>Item one</li></ul></article>) }`)
    expect(legal).toContain('## 1. Intro')
    expect(legal).toContain('We value "privacy". Really.')
    expect(legal).toContain('- Item one')
  })

  it('docs: the real FAQ page parses into questions', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/seo/faq-content.ts'), 'utf-8')
    const md = faqSourceToMarkdown(src)
    expect(md).toContain('### What is CodeSpectra?')
    expect(md.split('### ').length).toBeGreaterThan(8)
  })
})

describe('uploads', () => {
  function zip(entries: Record<string, string>): Buffer {
    const locals: Buffer[] = []
    const centrals: Buffer[] = []
    let offset = 0
    for (const [name, content] of Object.entries(entries)) {
      const data = deflateRawSync(Buffer.from(content, 'utf-8'))
      const nameBuf = Buffer.from(name)
      const local = Buffer.alloc(30)
      local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8)
      local.writeUInt32LE(data.length, 18); local.writeUInt32LE(Buffer.byteLength(content), 22)
      local.writeUInt16LE(nameBuf.length, 26)
      const central = Buffer.alloc(46)
      central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10)
      central.writeUInt32LE(data.length, 20); central.writeUInt32LE(Buffer.byteLength(content), 24)
      central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42)
      locals.push(local, nameBuf, data)
      centrals.push(central, nameBuf)
      offset += 30 + nameBuf.length + data.length
    }
    const cd = Buffer.concat(centrals)
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(Object.keys(entries).length, 8); eocd.writeUInt16LE(Object.keys(entries).length, 10)
    eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16)
    return Buffer.concat([...locals, cd, eocd])
  }

  const xml = '<w:document><w:body>'
    + '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Backend rubric</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t xml:space="preserve">Code quality </w:t></w:r><w:r><w:t>&amp; tests: 30%</w:t></w:r></w:p>'
    + '<w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>Readable names</w:t></w:r></w:p>'
    + '</w:body></w:document>'

  it('reads a DOCX body with headings and lists', () => {
    expect(docxXmlToText(xml)).toBe('# Backend rubric\n\nCode quality & tests: 30%\n\n- Readable names')
    const buf = zip({ '[Content_Types].xml': '<Types/>', 'word/document.xml': xml })
    expect(readZipEntry(buf, 'missing.xml')).toBeNull()
    expect(extractDocx(buf)).toContain('Code quality & tests: 30%')
    expect(detectUploadType('rubric.docx', buf)).toBe('docx')
  })

  it('checks type by extension and magic bytes', () => {
    expect(detectUploadType('a.pdf', Buffer.from('%PDF-1.4 ...'))).toBe('pdf')
    expect(detectUploadType('a.pdf', Buffer.from('MZ fake exe'))).toBeNull()
    expect(detectUploadType('a.docx', Buffer.from('%PDF-'))).toBeNull()
    expect(detectUploadType('notes.md', Buffer.from('# hi'))).toBe('md')
    expect(detectUploadType('x.txt', Buffer.from([0x68, 0x00, 0x69]))).toBeNull()
    expect(detectUploadType('x.exe', Buffer.from('hi'))).toBeNull()
  })

  it('upload source is tenant scoped; tags are cleaned', () => {
    expect(parseTags('Backend, senior ,<script>, backend')).toEqual(['backend', 'senior', 'script'])
    const s = uploadSource({ id: 'u1', tenant_id: 'acme', title: 'JD', kind: 'jd', tags: ['backend'], file_name: 'jd.pdf', text: 'We hire engineers.' })!
    expect(s.visibility).toBe('tenant')
    expect(s.text).toContain('Job description')
    expect(uploadSource({ id: 'u2', tenant_id: null, text: 'x y z' })!.visibility).toBe('platform_admin')
  })

  it('résumé text leaves out contact details', () => {
    const t = resumeText(
      { data: { personal: { fullName: 'A', email: 'a@x.com', phone: '+1 555 123 4567', location: 'Pune' }, summary: 'Backend dev', experience: [{ role: 'SDE', company: 'Acme', description: 'APIs' }], skills: 'Go' } },
      { text_content: 'Reach me at a@x.com or +91 98765 43210. Built payment APIs.', file_name: 'cv.pdf' },
    )
    expect(t).toContain('Backend dev')
    expect(t).toContain('SDE at Acme')
    expect(t).toContain('Built payment APIs')
    expect(t).not.toContain('a@x.com')
    expect(t).not.toContain('98765')
    expect(t).not.toContain('555 123')
  })
})

describe('andFilters', () => {
  it('drops empty clauses', async () => {
    const { andFilters } = await import('@/lib/rag/acl')
    expect(andFilters({}, { a: 1 })).toEqual({ a: 1 })
    expect(andFilters({}, {})).toEqual({})
    expect(andFilters({ a: 1 }, { b: 2 })).toEqual({ $and: [{ a: 1 }, { b: 2 }] })
  })
})
