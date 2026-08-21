import { describe, it, expect } from 'vitest'
import { lessonObjectKey, lessonVideoKey, r2EndpointFromAccount, presetFor, endpointHost } from '@/lib/s3-presets'
import { lessonR2Key, r2Host } from '@/lib/r2'

describe('object storage helpers', () => {
  it('builds a stable private object key per lesson', () => {
    expect(lessonObjectKey('java', 'linked-lists')).toBe('courses/java/lessons/linked-lists.mp3')
    expect(lessonVideoKey('java', 'linked-lists')).toBe('courses/java/lessons/linked-lists.mp4')
    expect(lessonR2Key('java', 'linked-lists')).toBe('courses/java/lessons/linked-lists.mp3')
  })

  it('maps R2 account id to the S3 endpoint host', () => {
    expect(r2EndpointFromAccount('abc123')).toBe('https://abc123.r2.cloudflarestorage.com')
    expect(r2Host('abc123')).toBe('abc123.r2.cloudflarestorage.com')
    expect(endpointHost('https://abc123.r2.cloudflarestorage.com')).toBe('abc123.r2.cloudflarestorage.com')
  })

  it('fills provider presets', () => {
    expect(presetFor('s3').endpoint).toContain('amazonaws.com')
    expect(presetFor('gcs').endpoint).toBe('https://storage.googleapis.com')
    expect(presetFor('hetzner').region).toBe('fsn1')
  })
})
