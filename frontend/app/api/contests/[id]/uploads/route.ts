/**
 * POST /api/contests/[id]/uploads — direct upload of a large contest file
 * (ideathon video / deck, design diagram) to the private bucket.
 *   { action: 'start', role, name, size } → { upload_id, url, method: 'PUT', headers }
 *                                         → 409 { inline: true } when object storage is off
 *   { action: 'finish', role, upload_id } → size + magic bytes + virus scan → { upload_id, ready: true }
 * Then submit with the form field `upload_<role>=<upload_id>` instead of the file.
 * Only members of an entry, while submissions are open.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { FORMATS } from '@/lib/contests/formats'
import { submissionsOpen } from '@/lib/contests/config'
import { checkFileHead, checkFileMeta, contestMime, contestUploadScope, myEntry, slotMaxBytes } from '@/lib/contests/participation'
import { guarded, loadVisible, notFound, unauthorized, withUser } from '@/lib/contests/http'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { largeUploadLimits } from '@/lib/storage/config'
import { finishDirectUpload, startDirectUpload } from '@/lib/storage/uploads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const role = z.enum(['deck', 'video', 'diagram', 'predictions'])
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), role, name: z.string().min(1).max(300), size: z.number().int().positive() }),
  z.object({ action: z.literal('finish'), role, upload_id: z.string().max(40) }),
])

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await withUser()
  if (!user) return unauthorized()
  const { id } = await ctx.params
  return guarded('upload', async () => {
    const parsed = body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const input = parsed.data
    const c = await loadVisible(id, user)
    if (!c) return notFound()
    const meta = FORMATS[c.format]
    // Predictions CSVs are scored in-request, so they stay on the regular submit.
    const slot = meta.submission === 'files' ? (meta.files || []).find((s) => s.role === input.role) : undefined
    if (!slot) return NextResponse.json({ error: 'This contest does not take that file.' }, { status: 400 })
    if (!submissionsOpen(c)) return NextResponse.json({ error: 'Submissions are closed.' }, { status: 409 })
    const entry = await myEntry(c.id, user.id)
    if (!entry) return NextResponse.json({ error: 'Join the contest first.' }, { status: 403 })
    const rl = await rateLimitRedis(`contest-direct:${c.id}:${user.id}`, 20, 10 * 60_000)
    if (!rl.ok) return NextResponse.json({ error: `Too many uploads. Try again in ${rl.retryAfterSec} s.` }, { status: 429 })
    const scope = contestUploadScope(c.id, entry.id, slot.role)
    const maxBytes = slotMaxBytes(slot, true, largeUploadLimits())

    if (input.action === 'start') {
      const name = String(input.name).split(/[\\/]/).pop()!.replace(/[\u0000-\u001f"<>|:*?]/g, '_').slice(0, 200) || 'file'
      // Magic bytes are checked on finish, once the object exists.
      const bad = checkFileMeta(slot, name, input.size, maxBytes)
      if (bad) return NextResponse.json({ error: bad }, { status: input.size > maxBytes ? 413 : 400 })
      const contentType = contestMime(name)
      const r = await startDirectUpload({
        feature: 'contest', tenantId: null, ownerId: user.id, scope, name, size: input.size, contentType, maxBytes, allowedTypes: [contentType],
      })
      if (!r.ok) return NextResponse.json({ error: r.error, ...('inline' in r ? { inline: true } : {}) }, { status: r.status })
      return NextResponse.json(r, { status: 201 })
    }

    const done = await finishDirectUpload({
      uploadId: input.upload_id, ownerId: user.id, scope, scanMode: 'strict',
      sniff: (head, doc) => checkFileHead(slot, doc.name, head, doc.size, maxBytes) === null,
      sniffError: `${slot.label}: the file content does not match its type.`,
    })
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status })
    return NextResponse.json({ upload_id: done.upload.id, ready: true })
  })
}
