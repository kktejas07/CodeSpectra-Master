/**
 * Minimal .xlsx / .csv read + .xlsx write — replaces the `xlsx` (SheetJS
 * 0.18.5) npm package, which has unfixed prototype-pollution and ReDoS
 * advisories (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9). Zip handling is
 * fflate; the XML is the small, fixed subset Excel/Sheets/Numbers write.
 *
 * Covers what the app uses: read the first worksheet as rows of cell values
 * (like sheet_to_json(..., { header: 1 })), parse CSV, and write a one-sheet
 * workbook. Legacy binary .xls is not supported (ask for .xlsx or .csv).
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

export type CellValue = string | number | boolean | null
export type Row = CellValue[]

/** Upper bounds so a hostile file can't exhaust memory in the tab. */
const MAX_UNZIPPED_BYTES = 50 * 1024 * 1024
const MAX_ROWS = 100_000
const MAX_COLS = 1_000

export class SpreadsheetError extends Error {}

// ─── XML helpers ────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function decodeXml(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
      }
      return ENTITIES[e.toLowerCase()] ?? m
    })
    .replace(/_x([0-9A-F]{4})_/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
}

function escapeXml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return m ? decodeXml(m[1]) : null
}

/** Concatenated text of every <t>…</t> run inside a fragment (rich text included, phonetic runs skipped). */
function textRuns(fragment: string): string {
  const noPhonetic = fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
  let out = ''
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(noPhonetic))) out += decodeXml(m[1] ?? '')
  return out
}

export function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref.toUpperCase())?.[0] || ''
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function columnName(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// ─── Reading ────────────────────────────────────────────────────────────────

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

function isLegacyXls(bytes: Uint8Array): boolean {
  return bytes.length > 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
}

function firstSheetPath(files: Record<string, Uint8Array>): string {
  const wb = files['xl/workbook.xml'] ? strFromU8(files['xl/workbook.xml']) : ''
  const rels = files['xl/_rels/workbook.xml.rels'] ? strFromU8(files['xl/_rels/workbook.xml.rels']) : ''
  const sheetTag = /<(?:\w+:)?sheet\b[^>]*>/.exec(wb)?.[0]
  const rid = sheetTag ? attr(sheetTag, '(?:r:)?id') : null
  if (rid && rels) {
    const relTag = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => attr(t, 'Id') === rid)
    const target = relTag ? attr(relTag, 'Target') : null
    if (target) {
      const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
      if (files[path]) return path
    }
  }
  const sheets = Object.keys(files).filter((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k)).sort()
  if (!sheets.length) throw new SpreadsheetError('This workbook has no worksheets.')
  return sheets.includes('xl/worksheets/sheet1.xml') ? 'xl/worksheets/sheet1.xml' : sheets[0]
}

function readXlsx(bytes: Uint8Array): Row[] {
  let total = 0
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize
        if (total > MAX_UNZIPPED_BYTES) throw new SpreadsheetError('This spreadsheet is too large to import.')
        return /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(f.name)
      },
    })
  } catch (e) {
    if (e instanceof SpreadsheetError) throw e
    throw new SpreadsheetError('This file could not be read as an .xlsx workbook.')
  }

  const shared: string[] = []
  if (files['xl/sharedStrings.xml']) {
    const xml = strFromU8(files['xl/sharedStrings.xml'])
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)) shared.push(textRuns(m[1] ?? ''))
  }

  const xml = strFromU8(files[firstSheetPath(files)])
  const rows: Row[] = []
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const rowAttrs = rm[1] ?? rm[3] ?? ''
    const r = Number(attr(`<row${rowAttrs}>`, 'r'))
    const rowIndex = Number.isFinite(r) && r > 0 ? r - 1 : rows.length
    if (rowIndex >= MAX_ROWS) break
    const row: Row = []
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = `<c${cm[1]}>`
      const ref = attr(tag, 'r')
      const col = ref ? columnIndex(ref) : row.length
      if (col < 0 || col >= MAX_COLS) continue
      const type = attr(tag, 't') || 'n'
      const inner = cm[2] ?? ''
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
      let value: CellValue = null
      if (type === 's') value = v !== undefined ? shared[Number(v)] ?? '' : ''
      else if (type === 'inlineStr') value = textRuns(/<is>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? '')
      else if (type === 'str' || type === 'e') value = v !== undefined ? decodeXml(v) : ''
      else if (type === 'b') value = v === '1'
      else if (v !== undefined) {
        const n = Number(v)
        value = Number.isFinite(n) ? n : decodeXml(v)
      }
      if (value === null) continue
      while (row.length < col) row.push(null)
      row[col] = value
    }
    while (rows.length < rowIndex) rows.push([])
    rows[rowIndex] = row
  }
  return rows
}

/** RFC 4180 CSV (quoted fields, "" escapes, CRLF/LF), with an optional UTF-8 BOM. */
export function parseCsv(text: string): Row[] {
  const src = text.replace(/^﻿/, '')
  const rows: Row[] = []
  let row: Row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"' && field === '') quoted = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
      if (rows.length >= MAX_ROWS) return rows
    } else field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

/** First worksheet (xlsx) or the CSV as rows of cell values. Throws SpreadsheetError with a user-facing message. */
export function readSpreadsheetRows(data: ArrayBuffer | Uint8Array): Row[] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (isZip(bytes)) return readXlsx(bytes)
  if (isLegacyXls(bytes)) throw new SpreadsheetError('Old .xls files are not supported. Save the sheet as .xlsx or .csv and try again.')
  return parseCsv(new TextDecoder('utf-8').decode(bytes))
}

// ─── Writing ────────────────────────────────────────────────────────────────

/** One-sheet .xlsx from header-keyed objects (like json_to_sheet). Strings are inline; numbers stay numeric. */
export function buildXlsx(
  records: Record<string, CellValue | undefined>[],
  opts: { sheetName?: string; columnWidths?: number[] } = {},
): Uint8Array {
  const headers = Object.keys(records[0] || {})
  const sheetName = escapeXml((opts.sheetName || 'Sheet1').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))
  const cell = (ref: string, v: CellValue | undefined): string => {
    if (v === null || v === undefined || v === '') return ''
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`
    if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(v))}</t></is></c>`
  }
  const lines = [headers, ...records.map((r) => headers.map((h) => r[h]))]
  const sheetRows = lines
    .map((vals, i) => `<row r="${i + 1}">${vals.map((v, c) => cell(`${columnName(c)}${i + 1}`, v as CellValue)).join('')}</row>`)
    .join('')
  const cols = opts.columnWidths?.length
    ? `<cols>${opts.columnWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(1, Math.min(255, w))}" customWidth="1"/>`).join('')}</cols>`
    : ''
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${ns} xmlns:r="${rel}"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ${ns}>${cols}<sheetData>${sheetRows}</sheetData></worksheet>`,
    ),
  })
}

/** Browser download of bytes built by buildXlsx. */
export function downloadXlsx(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
