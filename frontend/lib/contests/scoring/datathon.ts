/**
 * Datathon scoring (pure): CSV parsing, a deterministic public / private
 * split by row id, and accuracy / F1 / RMSE / MAE.
 */

export type DatathonMetric = 'accuracy' | 'f1' | 'rmse' | 'mae'
export const MAX_LABEL_ROWS = 50_000

/** RFC 4180-ish CSV: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text: string, maxRows = MAX_LABEL_ROWS + 1): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const s = String(text ?? '').replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"' && field === '') { quoted = true; continue }
    if (ch === ',') { row.push(field); field = ''; continue }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((c) => c !== '')) rows.push(row)
      row = []
      if (rows.length >= maxRows) return rows
      continue
    }
    field += ch
  }
  row.push(field)
  if (row.some((c) => c !== '')) rows.push(row)
  return rows
}

/** id → value from a CSV with a header row. */
export function csvColumns(text: string, idCol: string, valueCol: string, maxRows = MAX_LABEL_ROWS): { map: Map<string, string>; error?: string; duplicates: number } {
  const rows = parseCsv(text, maxRows + 2)
  const map = new Map<string, string>()
  if (rows.length < 2) return { map, error: 'The CSV needs a header row and at least one data row.', duplicates: 0 }
  if (rows.length > maxRows + 1) return { map, error: `The CSV has more than ${maxRows.toLocaleString('en-US')} rows.`, duplicates: 0 }
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const ii = header.indexOf(idCol.trim().toLowerCase())
  const vi = header.indexOf(valueCol.trim().toLowerCase())
  if (ii < 0 || vi < 0) return { map, error: `The CSV header must include "${idCol}" and "${valueCol}".`, duplicates: 0 }
  let duplicates = 0
  for (const r of rows.slice(1)) {
    const id = (r[ii] ?? '').trim()
    if (!id) continue
    if (map.has(id)) { duplicates++; continue }
    map.set(id, (r[vi] ?? '').trim())
  }
  return { map, duplicates }
}

/** FNV-1a 32-bit — stable split assignment without crypto. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** Row goes to the public split (pure, salted so nobody can predict it). */
export function isPublicRow(id: string, salt: string, publicPercent: number): boolean {
  const pct = Math.max(0, Math.min(100, publicPercent))
  return fnv1a(`${salt}:${id}`) % 10000 < pct * 100
}

function metric(kind: DatathonMetric, pairs: Array<[string, string]>, positive: string): number | null {
  if (pairs.length === 0) return null
  if (kind === 'accuracy') {
    let ok = 0
    for (const [y, p] of pairs) if (y.trim().toLowerCase() === p.trim().toLowerCase()) ok++
    return ok / pairs.length
  }
  if (kind === 'f1') {
    const pos = positive.trim().toLowerCase()
    let tp = 0, fp = 0, fn = 0
    for (const [y, p] of pairs) {
      const yp = y.trim().toLowerCase() === pos
      const pp = p.trim().toLowerCase() === pos
      if (yp && pp) tp++
      else if (!yp && pp) fp++
      else if (yp && !pp) fn++
    }
    return tp === 0 ? 0 : (2 * tp) / (2 * tp + fp + fn)
  }
  let sum = 0
  for (const [y, p] of pairs) {
    const a = Number(y)
    const b = Number(p)
    if (!Number.isFinite(a)) continue
    // NaN marks a non-numeric prediction (null means "no rows").
    if (!Number.isFinite(b)) return NaN
    const d = b - a
    sum += kind === 'rmse' ? d * d : Math.abs(d)
  }
  return kind === 'rmse' ? Math.sqrt(sum / pairs.length) : sum / pairs.length
}

export interface DatathonScore {
  public: number | null
  private: number | null
  matched: number
  missing: number
  extra: number
  error?: string
}

const round = (n: number | null) => (n === null || Number.isNaN(n) ? null : Math.round(n * 1e6) / 1e6)

/** Score predictions against hidden labels. Every label id must be predicted. */
export function scorePredictions(
  labels: Record<string, string>,
  predictions: Map<string, string>,
  opts: { metric: DatathonMetric; positiveLabel: string; salt: string; publicPercent: number },
): DatathonScore {
  const pub: Array<[string, string]> = []
  const priv: Array<[string, string]> = []
  let missing = 0
  for (const [id, y] of Object.entries(labels)) {
    const p = predictions.get(id)
    if (p === undefined || p === '') { missing++; continue }
    ;(isPublicRow(id, opts.salt, opts.publicPercent) ? pub : priv).push([y, p])
  }
  let extra = 0
  for (const id of predictions.keys()) if (!(id in labels)) extra++
  const matched = pub.length + priv.length
  if (missing > 0) return { public: null, private: null, matched, missing, extra, error: `${missing} row${missing === 1 ? ' is' : 's are'} missing a prediction.` }
  const a = metric(opts.metric, pub, opts.positiveLabel)
  const b = metric(opts.metric, priv, opts.positiveLabel)
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return { public: null, private: null, matched, missing, extra, error: 'Every prediction must be a number.' }
  }
  return { public: round(a), private: round(b), matched, missing, extra }
}
