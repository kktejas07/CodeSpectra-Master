/**
 * /api/admin/question-bot/domains (superadmin) — domain CRUD.
 * POST   { id, label, kind, branch?, topics[], language?, targets, active } — add a domain.
 * PATCH  ?id= { label?, topics?, language?, targets?, active? } — edit (targets grid, on/off).
 * DELETE ?id= — remove the domain (its questions stay in the bank).
 */
import { NextRequest, NextResponse } from 'next/server'
import { audit, botAdmin, readBody, serverError } from '@/lib/question-bot/http'
import { parseDomainInput, parseDomainPatch } from '@/lib/question-bot/domains'
import { createDomain, deleteDomain, ensureDomainSeed, getDomain, updateDomain } from '@/lib/question-bot/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const idOf = (req: NextRequest): string | null => {
  const id = new URL(req.url).searchParams.get('id')?.trim().toLowerCase() || ''
  return /^[a-z0-9_]{2,40}$/.test(id) ? id : null
}

export async function POST(req: NextRequest) {
  const g = await botAdmin()
  if ('res' in g) return g.res
  const body = await readBody(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  const v = parseDomainInput(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  try {
    await ensureDomainSeed()
    const r = await createDomain(v.domain)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 })
    await audit(g.user.id, 'question_bot.domain_create', v.domain.id, `Added domain ${v.domain.label}`)
    return NextResponse.json({ domain: v.domain }, { status: 201 })
  } catch (e) {
    return serverError('domain create', e)
  }
}

export async function PATCH(req: NextRequest) {
  const g = await botAdmin()
  if ('res' in g) return g.res
  const id = idOf(req)
  if (!id) return NextResponse.json({ error: 'id required', code: 'id_required' }, { status: 400 })
  const body = await readBody(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  const v = parseDomainPatch(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  try {
    const current = await getDomain(id)
    if (!current) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    const targets = v.patch.targets ? { ...current.targets, ...v.patch.targets } : undefined
    if (targets?.coding && Object.values(targets.coding).some((n) => Number(n) > 0) && !(v.patch.language || current.language)) {
      return NextResponse.json({ error: 'Pick a language for coding questions.' }, { status: 400 })
    }
    await updateDomain(id, { ...v.patch, ...(targets ? { targets } : {}) })
    await audit(g.user.id, 'question_bot.domain_update', id, `Changed ${Object.keys(v.patch).join(', ')}`)
    return NextResponse.json({ domain: await getDomain(id) })
  } catch (e) {
    return serverError('domain update', e)
  }
}

export async function DELETE(req: NextRequest) {
  const g = await botAdmin()
  if ('res' in g) return g.res
  const id = idOf(req)
  if (!id) return NextResponse.json({ error: 'id required', code: 'id_required' }, { status: 400 })
  try {
    if (!(await deleteDomain(id))) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    await audit(g.user.id, 'question_bot.domain_delete', id, 'Removed domain')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError('domain delete', e)
  }
}
