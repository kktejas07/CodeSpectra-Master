/**
 * Wave 6 question types: registry, pure graders, sanitizer / candidate
 * projection, aptitude sections, answer-file sniffing.
 * Run: npx vitest run tests/question-types-wave6.test.ts
 */
import { describe, it, expect } from 'vitest'
import { canonicalType, isAutoGradedType, isDeterministicType, isScoredType, needsHumanReview, runsHiddenTests, QUESTION_TYPE_META } from '@/lib/question-types'
import { gradeCaseStudy, gradeInstant, gradeTyping, humanOnlyGrade, systemDesignText, traitScores, typingStats } from '@/lib/grading-extended'
import { aptitudeSections, candidateExtendedFields, extendedDefaultsForType, sanitizeExtendedQuestionFields, uploadKindForName } from '@/lib/question-extensions'
import { sanitizeExamQuestion } from '@/lib/grading'
import { sniffAnswerFile } from '@/lib/upload-sniff'

const enc = (s: string) => new TextEncoder().encode(s)

describe('registry', () => {
  it('resolves the new ids and aliases', () => {
    expect(canonicalType('theory_to_code')).toBe('theory_to_code')
    expect(canonicalType('black box')).toBe('reverse_coding')
    expect(canonicalType('System Design')).toBe('system_design')
    expect(canonicalType('case study')).toBe('case_study')
    expect(canonicalType('video')).toBe('video_response')
    expect(canonicalType('file-upload')).toBe('file_upload')
    expect(canonicalType('WPM')).toBe('typing_test')
  })

  it('flags grading modes', () => {
    expect(runsHiddenTests('coding')).toBe(true)
    expect(runsHiddenTests('theory_to_code')).toBe(true)
    expect(runsHiddenTests('reverse_coding')).toBe(true)
    expect(runsHiddenTests('debugging')).toBe(false)
    expect(isAutoGradedType('case_study')).toBe(true)
    expect(isAutoGradedType('typing_test')).toBe(true)
    expect(isAutoGradedType('mcq')).toBe(true)
    expect(isAutoGradedType('file_upload')).toBe(false)
    expect(isAutoGradedType('system_design')).toBe(false)
    expect(needsHumanReview('system_design')).toBe(true)
    expect(needsHumanReview('video_response')).toBe(true)
    expect(needsHumanReview('coding')).toBe(false)
    // New types never go through the instant objective comparer.
    for (const t of ['case_study', 'typing_test', 'file_upload', 'video_response', 'system_design'] as const) {
      expect(isDeterministicType(t)).toBe(false)
      expect(isScoredType(t)).toBe(true)
      expect(QUESTION_TYPE_META[t].label).toBeTruthy()
    }
  })
})

describe('typingStats / gradeTyping', () => {
  const passage = 'the quick brown fox jumps over the lazy dog'

  it('computes net WPM and accuracy by position', () => {
    const s = typingStats(passage, passage, 60_000)
    expect(s.accuracy).toBe(100)
    expect(s.wpm).toBeCloseTo(passage.length / 5, 1)
    const e = typingStats('abcde', 'abxde', 60_000)
    expect(e.errors).toBe(1)
    expect(e.accuracy).toBe(80)
    expect(e.grossWpm).toBe(1)
    expect(e.wpm).toBe(0) // 1 gross − 1 error/min
  })

  it('guards zero / missing time', () => {
    const s = typingStats('ab', 'ab', 0)
    expect(Number.isFinite(s.wpm)).toBe(true)
    expect(s.minutes).toBeCloseTo(1 / 60)
  })

  it('full marks at both thresholds, proportional below, zero for a fragment', () => {
    const cfg = { passage, min_wpm: 5, min_accuracy: 90 }
    expect(gradeTyping(cfg, JSON.stringify({ typed: passage, elapsed_ms: 60_000 }), 10)).toMatchObject({ awarded: 10, correct: true })
    const slow = gradeTyping({ ...cfg, min_wpm: 8.6 }, JSON.stringify({ typed: passage, elapsed_ms: 120_000 }), 10)
    expect(slow.correct).toBe(false)
    expect(slow.awarded).toBe(5) // half the target speed, 100% accuracy
    expect(gradeTyping(cfg, JSON.stringify({ typed: 'the', elapsed_ms: 1000 }), 10).awarded).toBe(0)
    expect(gradeTyping(cfg, '', 10).awarded).toBe(0)
  })

  it('flags impossible speed for review', () => {
    const g = gradeTyping({ passage, min_wpm: 5, min_accuracy: 90 }, JSON.stringify({ typed: passage, elapsed_ms: 1000 }), 10)
    expect(g.requires_human_review).toBe(true)
  })
})

describe('gradeCaseStudy', () => {
  const subs = [
    { id: 'a', type: 'mcq', prompt: 'Pick', options: ['X', 'Y'], answer: 'Y', points: 4 },
    { id: 'b', type: 'numeric', prompt: 'How many', answer: '42', tolerance: 1, points: 4 },
    { id: 'c', type: 'multiple_response', prompt: 'All', options: ['p', 'q', 'r'], answer: 'p, r', points: 2 },
  ]

  it('sums sub-scores and scales to the question points', () => {
    const all = gradeCaseStudy(subs, JSON.stringify({ a: 'Y', b: '41.5', c: ['r', 'p'] }), 10)
    expect(all.awarded).toBe(10)
    expect(all.correct).toBe(true)
    const part = gradeCaseStudy(subs, JSON.stringify({ a: 'Y', b: '50' }), 10)
    expect(part.awarded).toBe(4)
    expect(part.parts.map((p) => p.awarded)).toEqual([4, 0, 0])
    expect(gradeCaseStudy(subs, JSON.stringify({ a: 'Y' }), 20).awarded).toBe(8)
  })

  it('is safe on junk answers and empty cases', () => {
    expect(gradeCaseStudy(subs, 'not json', 10).awarded).toBe(0)
    expect(gradeCaseStudy([], '{}', 10).requires_human_review).toBe(true)
  })
})

describe('traitScores', () => {
  const qs = [
    { id: 'q1', type: 'likert', trait: 'Openness', scale: { min: 1, max: 5 } },
    { id: 'q2', type: 'likert', trait: 'Openness', reverse_scored: true, scale: { min: 1, max: 5 } },
    { id: 'q3', type: 'likert', trait: 'Grit' },
    { id: 'q4', type: 'likert' }, // no trait
    { id: 'q5', type: 'mcq', trait: 'Openness' }, // not likert
  ]

  it('reverse-keys and averages per trait', () => {
    const r = traitScores(qs, { q1: '5', q2: '1', q3: '3', q4: '5', q5: 'x' })
    expect(r).toEqual([
      { trait: 'Grit', items: 1, mean: 3, percent: 50 },
      { trait: 'Openness', items: 2, mean: 5, percent: 100 },
    ])
  })

  it('skips blank and out-of-range answers', () => {
    expect(traitScores(qs, { q1: '', q2: '9' })).toEqual([])
  })
})

describe('gradeInstant / humanOnlyGrade / systemDesignText', () => {
  it('dispatches only the instant types', () => {
    expect(gradeInstant({ type: 'mcq' }, 'A', 5)).toBeNull()
    expect(gradeInstant({ type: 'case_study' }, '{}', 5)).toBeNull() // legacy case study without parts → LLM path
    expect(gradeInstant({ type: 'case_study', sub_questions: [{ id: 'a', type: 'short_answer', prompt: 'p', answer: 'yes', points: 1 }] }, '{"a":"Yes"}', 5)?.awarded).toBe(5)
    expect(humanOnlyGrade('file_upload')?.requires_human_review).toBe(true)
    expect(humanOnlyGrade('mcq')).toBeNull()
  })

  it('flattens a system design answer', () => {
    expect(systemDesignText(JSON.stringify({ text: 'Use a queue', diagram: 'A-->B' }))).toContain('DIAGRAM')
    expect(systemDesignText('plain text')).toBe('plain text')
  })
})

describe('sanitizer + candidate projection', () => {
  const raw = {
    id: 'q', type: 'reverse_coding', title: 't', prompt: 'p',
    reference_solution: { language: 'python', code: 'print(1)', $where: 'x' },
    black_box_runs: 999,
    rubric: 'secret rubric',
    trait: 'Openness', reverse_scored: true,
    aptitude_area: 'QUANT',
    sub_questions: [{ id: 's1', type: 'mcq', prompt: 'Pick', options: ['a', 'b'], answer: 'b', points: 3 }, { prompt: '' }, 'junk'],
    upload: { allowed: ['pdf', 'exe'], max_mb: 500 },
    typing: { passage: 'abc', min_wpm: 9999, min_accuracy: -5 },
    video: { max_seconds: 1, retakes: 99 },
  }

  it('keeps only known shapes, clamped', () => {
    const c = sanitizeExamQuestion(raw)
    expect(c.reference_solution).toEqual({ language: 'python', code: 'print(1)' })
    expect(c.black_box_runs).toBe(50)
    expect(c.aptitude_area).toBe('quant')
    expect(c.sub_questions).toEqual([{ id: 's1', type: 'mcq', prompt: 'Pick', options: ['a', 'b'], answer: 'b', points: 3 }])
    expect(c.upload).toEqual({ allowed: ['pdf'], max_mb: 9 })
    expect(c.typing).toEqual({ passage: 'abc', min_wpm: 250, min_accuracy: 1 })
    expect(c.video).toEqual({ max_seconds: 10, retakes: 5, allow_text_alternative: true })
  })

  it('never hands keys, rubric, reference code or traits to candidates', () => {
    const out: Record<string, unknown> = {}
    candidateExtendedFields(sanitizeExamQuestion(raw), out)
    const json = JSON.stringify(out)
    expect(json).not.toContain('print(1)')
    expect(json).not.toContain('secret rubric')
    expect(json).not.toContain('Openness')
    expect((out.sub_questions as Array<Record<string, unknown>>)[0].answer).toBeUndefined()
    expect(out.black_box_runs).toBe(50)
  })

  it('drops the black-box budget without a reference solution', () => {
    const out: Record<string, unknown> = {}
    const clean: Record<string, unknown> = {}
    sanitizeExtendedQuestionFields({ black_box_runs: 5 }, clean)
    candidateExtendedFields(clean, out)
    expect(out.black_box_runs).toBeUndefined()
  })

  it('seeds builder defaults', () => {
    expect(extendedDefaultsForType('typing_test').typing?.min_wpm).toBe(35)
    expect(extendedDefaultsForType('mcq')).toEqual({})
  })
})

describe('aptitudeSections', () => {
  it('builds one timed, locked section per area in order', () => {
    const secs = aptitudeSections([
      { id: '1', aptitude_area: 'verbal' }, { id: '2', aptitude_area: 'quant' }, { id: '3' }, { id: '4', aptitude_area: 'quant' },
    ], { quant: 15 })
    expect(secs.map((s) => [s.title, s.time_limit_minutes, s.question_ids])).toEqual([
      ['Quantitative', 15, ['2', '4']],
      ['Verbal ability', 20, ['1']],
      ['Other questions', null, ['3']],
    ])
    expect(secs[0].lock_after_leave).toBe(true)
    expect(aptitudeSections([{ id: '1' }])).toEqual([])
  })
})

describe('answer files', () => {
  it('maps names to allowed kinds', () => {
    expect(uploadKindForName('Report.PDF', ['pdf'])).toBe('pdf')
    expect(uploadKindForName('x.exe', ['pdf', 'zip'])).toBeNull()
    expect(uploadKindForName('a.png', ['pdf'])).toBeNull()
  })

  it('checks magic bytes', () => {
    expect(sniffAnswerFile(enc('%PDF-1.7 ...'), 'pdf')).toBe(true)
    expect(sniffAnswerFile(enc('<html>'), 'pdf')).toBe(false)
    expect(sniffAnswerFile(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0]), 'webm')).toBe(true)
    expect(sniffAnswerFile(new Uint8Array([0, 0, 0, 0x18, ...enc('ftypmp42')]), 'mp4')).toBe(true)
    expect(sniffAnswerFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...enc('word/document.xml')]), 'docx')).toBe(true)
    expect(sniffAnswerFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...enc('xl/workbook.xml')]), 'docx')).toBe(false)
    expect(sniffAnswerFile(enc('hello, world'), 'text')).toBe(true)
    expect(sniffAnswerFile(new Uint8Array([0x68, 0, 0x69]), 'text')).toBe(false)
  })
})
