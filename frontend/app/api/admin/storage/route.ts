/**
 * Superadmin: private uploads storage.
 *   GET   status — configured?, encryption mode, inline (Mongo) files left to move
 *   POST  { action: 'migrate', dry_run?: boolean (default true), batch?: 1-500, targets?: [...] }
 *         moves Mongo-stored files to the bucket (idempotent, resumable — repeat until remaining is 0)
 *         { action: 'sweep' } deletes abandoned direct uploads
 *         { action: 'test', config?: {...} } writes, reads and deletes a probe object
 *         with the saved settings, or with unsaved form values layered over them
 *         (an empty secret key means "keep the saved one")
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'
import { largeUploadLimits, parseAllowUnscanned, parseStorageConfig, readStorageConfig } from '@/lib/storage/config'
import { readServerSecrets } from '@/lib/server-secrets-cache'
import { s3Probe } from '@/lib/storage/s3'
import { STORAGE_FEATURES } from '@/lib/storage/keys'
import { randomBytes } from 'crypto'
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
  z.object({
    action: z.literal('test'),
    config: z.object({
      bucket: z.string().trim().max(63).optional(),
      region: z.string().trim().max(40).optional(),
      endpoint: z.string().trim().max(300).optional(),
      force_path_style: z.boolean().optional(),
      access_key_id: z.string().trim().max(200).optional(),
      secret_access_key: z.string().max(300).optional(),
      sse: z.enum(['', 'AES256', 'aws:kms', 'none']).optional(),
      kms_key_id: z.string().trim().max(300).optional(),
    }).strict().optional(),
  }),
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
      features: STORAGE_FEATURES,
      allow_unscanned: [...parseAllowUnscanned((await readServerSecrets().catch(() => ({}))) as Record<string, string>, process.env as Record<string, string>)],
      scan_max_mb: Math.floor(largeUploadLimits().scanBytes / 1048576),
      scan_inline_mb: Math.floor(largeUploadLimits().scanInlineBytes / 1048576),
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
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  try {
    if (parsed.data.action === 'test') {
      const saved = (await readServerSecrets().catch(() => ({}))) as Record<string, string | undefined>
      const c = parsed.data.config
      const merged: Record<string, string | undefined> = c ? {
        ...saved,
        uploads_s3_bucket: c.bucket ?? saved.uploads_s3_bucket,
        uploads_s3_region: c.region ?? saved.uploads_s3_region,
        uploads_s3_endpoint: c.endpoint ?? saved.uploads_s3_endpoint,
        uploads_s3_force_path_style: c.force_path_style === undefined ? saved.uploads_s3_force_path_style : String(c.force_path_style),
        uploads_s3_access_key_id: c.access_key_id ?? saved.uploads_s3_access_key_id,
        uploads_s3_secret_access_key: c.secret_access_key?.trim() ? c.secret_access_key.trim() : saved.uploads_s3_secret_access_key,
        uploads_s3_sse: c.sse ?? saved.uploads_s3_sse,
        uploads_s3_kms_key_id: c.kms_key_id ?? saved.uploads_s3_kms_key_id,
      } : saved
      const cfg = parseStorageConfig(merged, process.env as Record<string, string>)
      if (!cfg) return NextResponse.json({ ok: false, error: 'Set a valid bucket name (and an http(s) endpoint, if any) first.', code: 'storage_not_configured' }, { status: 400 })
      const r = await s3Probe(cfg, `u/probe/platform/m/${randomBytes(16).toString('hex')}`)
      await auditAdmin(gate.user, 'admin.storage.test', 'storage', 'storage/test', r.ok ? 'ok' : `failed at ${r.step}`)
      return NextResponse.json({ ...r, bucket: cfg.bucket, encryption: cfg.sse })
    }
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
