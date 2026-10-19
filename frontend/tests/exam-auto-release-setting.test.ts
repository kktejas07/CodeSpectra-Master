/** Test setting "Release scores automatically when grading finishes" (auto_release_scores). */
import { describe, it, expect } from 'vitest'
import { EXAM_EDITABLE_FIELDS, normalizeCertificateFields, pickFields } from '@/lib/exam-access'

describe('auto_release_scores setting', () => {
  it('is editable and strictly boolean (anything but true is off)', () => {
    expect(EXAM_EDITABLE_FIELDS).toContain('auto_release_scores')
    for (const [raw, want] of [[true, true], [false, false], ['true', false], [1, false], [null, false]] as const) {
      const d = pickFields({ auto_release_scores: raw }, EXAM_EDITABLE_FIELDS)
      normalizeCertificateFields(d)
      expect(d.auto_release_scores).toBe(want)
    }
  })
  it('is left alone when not sent', () => {
    const d = pickFields({ title: 'x' }, EXAM_EDITABLE_FIELDS)
    normalizeCertificateFields(d)
    expect('auto_release_scores' in d).toBe(false)
  })
})
