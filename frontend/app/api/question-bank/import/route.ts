import { NextResponse, type NextRequest } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { normalizeBankQuestion, questionBank, bankContentHash, type BankQuestionDoc } from '@/lib/question-bank'

export const runtime = 'nodejs'

const MAX_ITEMS = 5000

/** Parse a simple CSV (header row: type,title,question,options,answer,explanation,difficulty,degree_type,branch,subject,tags,marks). Options pipe-delimited. */
function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^"(.*)"$/, '$1'))
  const out: Record<string, unknown>[] = []
  for (let i = 1; i < lines.length; i++) {
    // naive split respecting quoted fields
    const fields: string[] = []
    let cur = ''
    let inQuote = false
    for (const ch of lines[i]) {
      if (ch === '"') inQuote = !inQuote
      else if (ch === ',' && !inQuote) { fields.push(cur); cur = '' }
      else cur += ch
    }
    fields.push(cur)
    const row: Record<string, unknown> = {}
    header.forEach((h, idx) => {
      if (h) row[h] = (fields[idx] || '').trim()
    })
    if (row.question || row.title) out.push(row)
  }
  return out
}

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const contentType = request.headers.get('content-type') || ''
    let items: Record<string, unknown>[] = []
    if (contentType.includes('application/json')) {
      const body = await request.json()
      const arr = Array.isArray(body) ? body : Array.isArray(body.questions) ? body.questions : []
      items = arr
    } else {
      const text = await request.text()
      items = parseCsv(text)
    }
    if (items.length === 0) return NextResponse.json({ error: 'No questions found to import' }, { status: 400 })
    if (items.length > MAX_ITEMS) return NextResponse.json({ error: `Max ${MAX_ITEMS} per import` }, { status: 400 })

    const col = await questionBank()
    const existing = await col.find({}, { projection: { _id: 0 } }).toArray()
    const seen = new Set(existing.map((d: any) => bankContentHash(d)))
    const source = items.length >= 50 ? 'import' : 'manual'

    const toInsert: BankQuestionDoc[] = []
    let skipped = 0
    const errors: string[] = []
    for (let i = 0; i < items.length; i++) {
      const doc = normalizeBankQuestion(items[i])
      if (!doc) { skipped++; continue }
      doc.source = source
      const hash = bankContentHash(doc)
      if (seen.has(hash)) { skipped++; continue }
      seen.add(hash)
      toInsert.push(doc)
    }

    if (toInsert.length === 0) {
      return NextResponse.json({ inserted: 0, skipped, errors, message: 'No new questions (all duplicates)' })
    }
    await col.insertMany(toInsert)
    return NextResponse.json({ inserted: toInsert.length, skipped, errors })
  } catch (e) {
    console.error('[question-bank/import] error:', e)
    return NextResponse.json({ error: 'Failed to import questions' }, { status: 500 })
  }
}
