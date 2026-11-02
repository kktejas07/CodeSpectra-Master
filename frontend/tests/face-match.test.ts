import { describe, expect, it, vi } from 'vitest'
import { faceMatchScore } from '@/components/proctoring/face-match-score'

// ponytail: jsdom has no face-api model / image pipeline, so the real module
// resolves to its documented offline fallback. A short timeout keeps the test
// fast without waiting for the default 20s race timer.
describe('faceMatchScore', () => {
  it('resolves (never rejects) to the unavailable report in jsdom', async () => {
    const report = await faceMatchScore('id-photo.jpg', 'selfie.jpg', 100)
    expect(['compared', 'no_face_in_id', 'no_face_in_selfie', 'unavailable']).toContain(report.status)
    // In a headless env with no model the expected outcome is unavailable or no face.
    expect(['unavailable', 'no_face_in_id', 'no_face_in_selfie']).toContain(report.status)
  })
})
