/**
 * Superadmin: private uploads storage.
 *   GET   status — configured?, encryption mode, inline (Mongo) files left to move
 *   POST  { action: 'migrate', dry_run?: boolean (default true), batch?: 1-500, targets?: [...] }
 *         moves Mongo-stored files to the bucket (idempotent, resumable — repeat until remaining is 0)
 *         { action: 'sweep' } deletes abandoned direct uploads
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'
import { readStorageConfig } from '@/lib/storage/config'
import { MIGRATION_TARGETS, migrateInlineFiles } from '@/lib/storage/migrate'
import { sweepUploads } from '@/lib/storage/uploads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('migrate'),
    dry_run: z.boolean().optional(),
    batch: z.number().int().min(1).max(500).optional(),
    targets: z.array(z.enum(MIGRATION_TARGETS)).max(MIGRATION_TARGETS.length).optional(),
  }),
  z.object({ action: z.literal('sweep') }),
])

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const cfg = await readStorageConfig()
    const inline = await migrateInlineFiles({ dryRun: true })
    return NextResponse.json({
      configured: !!cfg,
      ...(cfg ? {
        bucket: cfg.bucket,
        region: cfg.region,
        endpoint_host: cfg.endpoint ? cfg.endpoint.replace(/^https?:\/\//, '').split('/')[0] : 's3.amazonaws.com',
        encryption: cfg.sse,
        kms_key: !!cfg.kmsKeyId,
        credentials: cfg.accessKeyId ? 'access_key' : 'default_chain',
        pending_tag: cfg.pendingTag,
      } : {}),
      inline: inline.ok ? inline.reports : [],
    })
  } catch (e) {
    console.error('[admin/storage] GET:', e instanceof Error ? e.message : 'error')
    return NextResponse.json({ error: 'Failed to load storage status' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    if (parsed.data.action === 'sweep') {
      const r = await sweepUploads()
      await auditAdmin(gate.user, 'admin.storage.sweep', 'storage', 'storage/uploads', `removed ${r.removed}, failed ${r.failed}`)
      return NextResponse.json({ ok: true, ...r })
    }
    const dryRun = parsed.data.dry_run !== false
    const r = await migrateInlineFiles({ dryRun, batch: parsed.data.batch, targets: parsed.data.targets })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 })
    if (!dryRun) {
      const moved = r.reports.reduce((n, x) => n + x.moved, 0)
      const failed = r.reports.reduce((n, x) => n + x.failed, 0)
      await auditAdmin(gate.user, 'admin.storage.migrate', 'storage', 'storage/migrate', `moved ${moved}, failed ${failed}`, failed ? 'warning' : 'info')
    }
    return NextResponse.json(r)
  } catch (e) {
    console.error('[admin/storage] POST:', e instanceof Error ? e.message : 'error')
    return NextResponse.json({ error: 'Storage action failed' }, { status: 500 })
  }
}
