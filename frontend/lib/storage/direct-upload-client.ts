/**
 * Browser side of direct uploads (lib/storage/uploads.ts): ask the app route
 * for a presigned PUT, send the bytes to the bucket, then ask the route to
 * finish (verify + record). Returns { inline: true } when the server has no
 * object storage, so the caller falls back to its multipart upload.
 */
import { csrfFetch } from '@/lib/csrf-fetch'

type Json = Record<string, unknown>

async function postJson(url: string, body: Json): Promise<{ status: number; data: Json }> {
  const res = await csrfFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' })
  return { status: res.status, data: (await res.json().catch(() => ({}))) as Json }
}

export async function directUpload<T = Json>(p: { url: string; file: Blob; start: Json; finish: (uploadId: string) => Json }): Promise<{ inline: true } | { inline: false; data: T }> {
  const started = await postJson(p.url, { action: 'start', ...p.start, size: p.file.size })
  if (started.status === 409 && started.data.inline) return { inline: true }
  if (started.status >= 400) throw new Error(String(started.data.error || 'Upload failed. Try again.'))
  const uploadId = String(started.data.upload_id || '')
  const target = String(started.data.url || '')
  const headers = (started.data.headers || {}) as Record<string, string>
  if (!uploadId || !/^https?:\/\//.test(target)) throw new Error('Upload failed. Try again.')

  // Straight to the bucket: no cookies, exactly the signed headers.
  const put = await fetch(target, { method: 'PUT', body: p.file, headers, credentials: 'omit', mode: 'cors' }).catch(() => null)
  if (!put || !put.ok) throw new Error('The upload did not reach storage. Check your connection and try again.')

  // The scanner can take a moment on large files; retry while it says to.
  for (let i = 0; i < 4; i++) {
    const done = await postJson(p.url, { action: 'finish', ...p.finish(uploadId), upload_id: uploadId })
    if (done.status < 400) return { inline: false, data: done.data as T }
    if (done.status !== 409 && done.status !== 503) throw new Error(String(done.data.error || 'Upload failed. Try again.'))
    if (i === 3) throw new Error(String(done.data.error || 'Upload failed. Try again.'))
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
  }
  throw new Error('Upload failed. Try again.')
}

let statusCache: Promise<{ direct: boolean; video_max_mb: number; file_max_mb: number }> | null = null

/** Whether large direct uploads are on (and their caps), cached per page load. */
export function uploadLimits(): Promise<{ direct: boolean; video_max_mb: number; file_max_mb: number }> {
  if (!statusCache) {
    statusCache = fetch('/api/uploads/status', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => ({ direct: !!j?.direct, video_max_mb: Number(j?.video_max_mb) || 0, file_max_mb: Number(j?.file_max_mb) || 0 }))
      .catch(() => ({ direct: false, video_max_mb: 0, file_max_mb: 0 }))
  }
  return statusCache
}
