/**
 * Candidate rows for bulk assessment invites — pure and client-safe, shared by
 * the invite page (preview) and lib/services/bulk-invites.ts (server checks).
 */
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

export interface CandidateRow { email: string; name?: string; company?: string; role?: string }
export type RowError = { email: string; reason: string }

/** Split one CSV line, honouring double quotes ("Doe, Jane"). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',' || ch === ';' || ch === '\t') { out.push(cur.trim()); cur = '' }
    else cur += ch
  }
  out.push(cur.trim())
  return out
}

/**
 * Parse a CSV (header with an `email` column, or none) or a pasted list
 * ("a@x.com, b@y.com", one per line, or "Jane Doe <jane@x.com>").
 */
export function parseCandidateText(text: string): CandidateRow[] {
  const clean = String(text || '').replace(/^﻿/, '').trim()
  if (!clean) return []
  const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''))
  const emailIdx = header.indexOf('email')
  if (emailIdx >= 0) {
    const idx = (names: string[]) => header.findIndex((h) => names.includes(h))
    const nameIdx = idx(['name', 'fullname', 'candidatename'])
    const companyIdx = idx(['company', 'organisation', 'organization'])
    const roleIdx = idx(['role', 'jobtitle', 'position', 'title'])
    return lines.slice(1).map((l) => {
      const c = splitCsvLine(l)
      return { email: c[emailIdx] || '', name: nameIdx >= 0 ? c[nameIdx] : undefined, company: companyIdx >= 0 ? c[companyIdx] : undefined, role: roleIdx >= 0 ? c[roleIdx] : undefined }
    }).filter((r) => r.email || r.name)
  }
  // Pasted list: every e-mail-looking token, with an optional "Name <email>" form.
  const rows: CandidateRow[] = []
  for (const l of lines) {
    for (const part of l.split(/[,;\t]+/)) {
      const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(part)
      if (m) rows.push({ email: m[2].trim(), name: m[1].trim() || undefined })
      else if (part.trim()) rows.push({ email: part.trim() })
    }
  }
  return rows
}

/** Validate + de-duplicate rows (case-insensitive). Pure. */
export function validateRows(rows: unknown, already: Set<string> = new Set()): { valid: CandidateRow[]; errors: RowError[] } {
  const valid: CandidateRow[] = []
  const errors: RowError[] = []
  const seen = new Set<string>()
  for (const raw of Array.isArray(rows) ? rows : []) {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const email = typeof r.email === 'string' ? r.email.trim().toLowerCase() : ''
    const label = email || (typeof r.email === 'string' && r.email) || '(empty)'
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) { errors.push({ email: label, reason: 'Invalid email' }); continue }
    if (seen.has(email)) { errors.push({ email, reason: 'Listed twice' }); continue }
    seen.add(email)
    if (already.has(email)) { errors.push({ email, reason: 'Already invited to this assessment' }); continue }
    const s = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '') || undefined
    valid.push({ email, name: s(r.name, 120), company: s(r.company, 120), role: s(r.role, 120) })
  }
  return { valid, errors }
}

