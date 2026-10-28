/**
 * GET  /api/campus/students?department&batch&status&q&page   placement team
 * POST /api/campus/students { csv, dry_run?, send_invites? }  bulk import + email invites
 */
import { NextResponse } from 'next/server'
import { guarded, readJson, withStaff } from '@/lib/campus/access'
import { importStudents, listStudents } from '@/lib/campus/service'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return guarded('students GET', () => withStaff(req, async (ctx) => {
    const p = new URL(req.url).searchParams
    const r = await listStudents(ctx, {
      department: p.get('department'), batch: p.get('batch'), status: p.get('status'), q: p.get('q'),
      page: Number(p.get('page')) || 1, limit: Number(p.get('limit')) || 50,
    })
    return NextResponse.json(r)
  }))
}

export async function POST(req: Request) {
  return guarded('students POST', () => withStaff(req, async (ctx) => {
    const body = await readJson(req)
    const dryRun = body.dry_run === true
    if (!dryRun) {
      const rl = await rateLimitRedis(`campus-import:${ctx.college.tenant_id}`, 20, 3_600_000)
      if (!rl.ok) return NextResponse.json({ error: 'Too many imports — try again later', code: 'campus_imports_limit' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
    }
    const r = await importStudents(ctx, body.csv, { dryRun, sendInvites: body.send_invites !== false })
    return NextResponse.json(r, { status: r.issues.length ? 422 : 200 })
  }))
}
