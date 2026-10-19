/**
 * POST /api/upload — Upload an image file and return a public URL.
 * Stores in MongoDB as base64 (simple, no external storage needed).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { randomUUID } from 'node:crypto'
import DOMPurify from 'isomorphic-dompurify'

import { internalBackendUrl } from '@/lib/ai/internal-backend-url'

async function getInternalSecret(): Promise<string> {
  const fromEnv = process.env.INTERNAL_BACKEND_SECRET?.trim() || ''
  if (fromEnv) return fromEnv
  try {
    const { readServerSecrets, isMaskedSecret } = await import('@/lib/server-secrets-cache')
    const secrets = await readServerSecrets()
    const stored = typeof secrets.internal_backend_secret === 'string' ? secrets.internal_backend_secret.trim() : ''
    return stored && !isMaskedSecret(stored) ? stored : ''
  } catch { return '' }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP, SVG' }, { status: 400 })
    }

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Max 5MB' }, { status: 400 })
    }

    let bytes = await file.arrayBuffer()
    let finalType = file.type

    if (finalType === 'image/svg+xml') {
      const rawText = Buffer.from(bytes).toString('utf-8')
      const sanitized = DOMPurify.sanitize(rawText, { USE_PROFILES: { svg: true, svgFilters: true } }) as string
      // Create new buffer from sanitized string
      const buf = Buffer.from(sanitized, 'utf-8')
      bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    }

    // Virus scan via ClamAV (backend /internal/security/scan) before persisting.
    try {
      const secret = await getInternalSecret()
      const scanRes = await fetch(`${internalBackendUrl()}/internal/security/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { 'x-internal-secret': secret } : {}),
        },
        body: JSON.stringify({
          file_base64: Buffer.from(bytes).toString('base64'),
          filename: file.name,
        }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!scanRes.ok) {
        const detail = await scanRes.json().catch(() => ({ detail: 'Security scanner rejected this file.' }))
        const msg = detail.detail || detail.error || 'Security scanner rejected this file.'
        // 400 = ClamAV flagged malware; anything else = scanner offline → fail-closed.
        return NextResponse.json(
          { error: msg },
          { status: scanRes.status === 400 || scanRes.status === 422 ? 400 : 503 },
        )
      }
    } catch (scanErr) {
      // Network/timeout error — scanner offline → fail-closed.
      const msg = scanErr instanceof Error ? scanErr.message : String(scanErr)
      console.error('[upload] virus scan error:', msg)
      return NextResponse.json(
        { error: 'Security scanner is currently offline. Please try again later.' },
        { status: 503 },
      )
    }

    const base64 = Buffer.from(bytes).toString('base64')
    const dataUrl = `data:${finalType};base64,${base64}`

    // Store in MongoDB for persistence
    const db = await getMongoDb()
    const id = randomUUID()
    await db.collection('uploaded_files').insertOne({
      id,
      filename: file.name,
      content_type: file.type,
      size: file.size,
      data_url: dataUrl,
      uploaded_by: gate.user.id,
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true, url: dataUrl, id })
  } catch (e) {
    console.error('[upload] error:', e)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
