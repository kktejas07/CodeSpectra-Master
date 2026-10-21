/**
 * Bulk student invite CSV: parse + validate (pure, client-safe — the officer
 * page previews errors before upload, the server validates again).
 *
 * Columns (header row required, any order, case-insensitive):
 *   name, email, roll_no, department (code or name), batch (name or graduation year), cgpa, backlogs
 * Only name + email are required. Export helpers guard against spreadsheet
 * formula injection.
 */
import { MAX_CSV_ROWS, normRollNo, type Batch, type Department } from './types'

/** RFC 4180-ish parser: quoted fields, escaped quotes, CRLF / LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
      continue
    }
    if (c === '"' && field === '') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows
}

export interface StudentRow {
  line: number
  name: string
  email: string
  roll_no: string | null
  department_id: string | null
  batch_id: string | null
  cgpa: number | null
  backlogs: number
}

export interface CsvIssue { line: number; message: string }

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/
const ALIASES: Record<string, string> = {
  'full name': 'name', 'student name': 'name', 'e-mail': 'email', 'email address': 'email',
  'roll no': 'roll_no', 'roll number': 'roll_no', rollno: 'roll_no', 'roll': 'roll_no', 'hall ticket': 'roll_no',
  dept: 'department', branch: 'department', 'graduation year': 'batch', year: 'batch', gpa: 'cgpa', backlog: 'backlogs', arrears: 'backlogs',
}

function headerKey(h: string): string {
  const k = h.trim().toLowerCase().replace(/[_\s]+/g, ' ')
  return ALIASES[k] ?? k.replace(/ /g, '_')
}

/** Validate parsed CSV rows against the college's departments and batches. */
export function validateStudentCsv(
  text: string,
  ctx: { departments: readonly Department[]; batches: readonly Batch[] },
): { rows: StudentRow[]; issues: CsvIssue[]; total: number } {
  const table = parseCsv(text)
  const issues: CsvIssue[] = []
  if (table.length < 2) return { rows: [], issues: [{ line: 1, message: 'Add a header row and at least one student' }], total: 0 }
  const header = table[0].map(headerKey)
  const col = (k: string) => header.indexOf(k)
  if (col('name') < 0 || col('email') < 0) return { rows: [], issues: [{ line: 1, message: 'The header needs “name” and “email” columns' }], total: table.length - 1 }
  const body = table.slice(1)
  if (body.length > MAX_CSV_ROWS) return { rows: [], issues: [{ line: 1, message: `Up to ${MAX_CSV_ROWS} students per file — split it` }], total: body.length }

  const deptBy = new Map<string, Department>()
  for (const d of ctx.departments) { deptBy.set(d.code.toLowerCase(), d); deptBy.set(d.name.toLowerCase(), d) }
  const seenEmail = new Set<string>()
  const seenRoll = new Set<string>()
  const rows: StudentRow[] = []

  body.forEach((r, i) => {
    const line = i + 2
    const get = (k: string) => { const c = col(k); return c >= 0 ? String(r[c] ?? '').trim() : '' }
    const name = get('name').slice(0, 120)
    const email = get('email').toLowerCase()
    if (!name) return issues.push({ line, message: 'Name is missing' })
    if (!EMAIL_RE.test(email) || email.length > 200) return issues.push({ line, message: 'Email is not valid' })
    if (seenEmail.has(email)) return issues.push({ line, message: `${email} appears twice in the file` })

    const rollRaw = get('roll_no')
    const roll = rollRaw ? normRollNo(rollRaw) : null
    if (roll && (roll.length > 40 || !/^[A-Z0-9/-]+$/.test(roll))) return issues.push({ line, message: 'Roll number can only have letters, digits, - and /' })
    if (roll && seenRoll.has(roll)) return issues.push({ line, message: `Roll number ${roll} appears twice in the file` })

    let department: Department | null = null
    const deptRaw = get('department')
    if (deptRaw) {
      department = deptBy.get(deptRaw.toLowerCase()) ?? null
      if (!department) return issues.push({ line, message: `Unknown department “${deptRaw.slice(0, 40)}” — add it first` })
    }

    let batch: Batch | null = null
    const batchRaw = get('batch')
    if (batchRaw) {
      const asYear = /^\d{4}$/.test(batchRaw) ? Number(batchRaw) : null
      const candidates = ctx.batches.filter((b) => (asYear ? b.graduation_year === asYear : b.name.toLowerCase() === batchRaw.toLowerCase()))
      // Prefer the batch of the student's department, then a college-wide batch.
      batch = candidates.find((b) => department && b.department_id === department.id) ?? candidates.find((b) => !b.department_id) ?? (candidates.length === 1 ? candidates[0] : null)
      if (!batch) return issues.push({ line, message: `Unknown batch “${batchRaw.slice(0, 40)}” — add it first` })
    }

    let cgpa: number | null = null
    const cgpaRaw = get('cgpa')
    if (cgpaRaw) {
      const n = Number(cgpaRaw)
      if (!Number.isFinite(n) || n < 0 || n > 10) return issues.push({ line, message: 'CGPA must be between 0 and 10' })
      cgpa = Math.round(n * 100) / 100
    }
    let backlogs = 0
    const blRaw = get('backlogs')
    if (blRaw) {
      const n = Number(blRaw)
      if (!Number.isInteger(n) || n < 0 || n > 100) return issues.push({ line, message: 'Backlogs must be a whole number' })
      backlogs = n
    }

    seenEmail.add(email)
    if (roll) seenRoll.add(roll)
    rows.push({ line, name, email, roll_no: roll, department_id: department?.id ?? null, batch_id: batch?.id ?? null, cgpa, backlogs })
  })
  return { rows, issues, total: body.length }
}

/** One CSV cell, quoted when needed, with formula-injection guard. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
