/**
 * POST /api/upload — Upload an image file and return a public URL.
 * Stores in MongoDB as base64 (simple, no external storage needed).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { randomUUID } from 'node:crypto'
import DOMPurify from 'isomorphic-dompurify'

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
