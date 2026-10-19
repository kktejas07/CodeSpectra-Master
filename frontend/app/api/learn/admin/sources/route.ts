/**
 * /api/learn/admin/sources — research allowlist (superadmin).
 *  GET     list
 *  POST    { domain, label } add (hostname; subdomains are covered)
 *  PATCH   { id, enabled }
 *  DELETE  ?id=
 */
import { NextRequest, NextResponse } from 'next/server'
import { cleanDomain, learnSources, listSources } from '@/lib/learn/store'
import { fail, learnAdmin, readJson, serverError } from '@/lib/learn/http'
import { newId, nowIso } from '@/lib/db/ids'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  try {
    return NextResponse.json({ sources: await listSources() })
  } catch (e) {
    return serverError('sources list', e)
  }
}

export async function POST(req: NextRequest) {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  try {
    const body = await readJson(req)
    const domain = cleanDomain(body.domain)
    if (!domain) return fail('Enter a domain like docs.python.org.')
    const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 80) : domain
    const doc = { id: newId(), domain, label, enabled: true, created_at: nowIso() }
    try {
      await (await learnSources()).insertOne(doc)
    } catch {
      return fail('This domain is already on the list.', 409)
    }
    return NextResponse.json({ source: doc }, { status: 201 })
  } catch (e) {
    return serverError('sources add', e)
  }
}

export async function PATCH(req: NextRequest) {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  try {
    const body = await readJson(req)
    if (typeof body.id !== 'string') return fail('Missing id.')
    const r = await (await learnSources()).updateOne({ id: body.id }, { $set: { enabled: body.enabled === true } })
    if (!r.matchedCount) return fail('Source not found.', 404)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError('sources edit', e)
  }
}

export async function DELETE(req: NextRequest) {
  const g = await learnAdmin()
  if ('res' in g) return g.res
  try {
    const id = req.nextUrl.searchParams.get('id') || ''
    const r = await (await learnSources()).deleteOne({ id })
    if (!r.deletedCount) return fail('Source not found.', 404)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError('sources delete', e)
  }
}
