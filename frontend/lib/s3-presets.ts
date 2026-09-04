export type S3Provider = 'r2' | 's3' | 'gcs' | 'hetzner' | 'custom'

export function r2EndpointFromAccount(accountId: string): string {
  return `https://${accountId.trim()}.r2.cloudflarestorage.com`
}

export function normalizeEndpoint(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  const u = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  return `${u.protocol}//${u.host}`
}

export function endpointHost(endpoint: string): string {
  return new URL(normalizeEndpoint(endpoint)).host
}

export function lessonObjectKey(courseId: string, lessonId: string, ext = 'mp3'): string {
  return `courses/${courseId}/lessons/${lessonId}.${ext}`
}

export function lessonVideoKey(courseId: string, lessonId: string): string {
  return lessonObjectKey(courseId, lessonId, 'mp4')
}

export function presetFor(provider: S3Provider, accountId = ''): { endpoint: string; region: string } {
  if (provider === 'r2') return { endpoint: accountId ? r2EndpointFromAccount(accountId) : '', region: 'auto' }
  if (provider === 's3') return { endpoint: 'https://s3.us-east-1.amazonaws.com', region: 'us-east-1' }
  if (provider === 'gcs') return { endpoint: 'https://storage.googleapis.com', region: 'auto' }
  if (provider === 'hetzner') return { endpoint: 'https://fsn1.your-objectstorage.com', region: 'fsn1' }
  return { endpoint: '', region: 'us-east-1' }
}
