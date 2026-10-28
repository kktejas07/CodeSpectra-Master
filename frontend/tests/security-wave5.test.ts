import { describe, it, expect, vi, afterEach } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { corsAllowedOrigins, httpsRedirectUrl } from '@/lib/request-guards'
import { decodeBase64Image, imageExtensionMatches, isStepFile, sniffImageMime } from '@/lib/upload-sniff'
import { buildXlsx, parseCsv, readSpreadsheetRows, SpreadsheetError } from '@/lib/xlsx-lite'

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null })

describe('httpsRedirectUrl', () => {
  const prod = { NODE_ENV: 'production' }
  it('redirects plain-http requests forwarded by a TLS proxy', () => {
    expect(httpsRedirectUrl('http://codespectra.ai/pricing?x=1', headers({ 'x-forwarded-proto': 'http', host: 'codespectra.ai' }), prod))
      .toBe('https://codespectra.ai/pricing?x=1')
    expect(httpsRedirectUrl('http://10.0.0.5:3000/a', headers({ 'x-forwarded-proto': 'http', 'x-forwarded-host': 'codespectra.ai', host: '10.0.0.5:3000' }), prod))
      .toBe('https://codespectra.ai/a')
  })
  it('leaves https, direct, localhost, health checks and non-production alone', () => {
    expect(httpsRedirectUrl('http://codespectra.ai/', headers({ 'x-forwarded-proto': 'https', host: 'codespectra.ai' }), prod)).toBeNull()
    expect(httpsRedirectUrl('http://codespectra.ai/', headers({ host: 'codespectra.ai' }), prod)).toBeNull()
    expect(httpsRedirectUrl('http://localhost:3000/', headers({ 'x-forwarded-proto': 'http', host: 'localhost:3000' }), prod)).toBeNull()
    expect(httpsRedirectUrl('http://codespectra.ai/api/health', headers({ 'x-forwarded-proto': 'http', host: 'codespectra.ai' }), prod)).toBeNull()
    expect(httpsRedirectUrl('http://codespectra.ai/', headers({ 'x-forwarded-proto': 'http', host: 'codespectra.ai' }), { NODE_ENV: 'development' })).toBeNull()
    expect(httpsRedirectUrl('http://codespectra.ai/', headers({ 'x-forwarded-proto': 'http', host: 'codespectra.ai' }), { NODE_ENV: 'production', FORCE_HTTPS: '0' })).toBeNull()
  })
  it('refuses a malformed host header', () => {
    expect(httpsRedirectUrl('http://x/', headers({ 'x-forwarded-proto': 'http', host: 'evil.com/@x' }), prod)).toBeNull()
  })
})

describe('corsAllowedOrigins', () => {
  it('is an exact https allowlist with no wildcard', () => {
    const list = corsAllowedOrigins({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://app.example.com/path', CORS_ALLOWED_ORIGINS: 'https://a.example.com, http://insecure.example.com, *, not a url' })
    expect(list).toContain('https://codespectra.ai')
    expect(list).toContain('https://app.example.com')
    expect(list).toContain('https://a.example.com')
    expect(list).not.toContain('http://insecure.example.com')
    expect(list.some((o) => o.includes('*'))).toBe(false)
    expect(list.some((o) => o.includes('localhost'))).toBe(false)
  })
  it('adds localhost only in development', () => {
    expect(corsAllowedOrigins({ NODE_ENV: 'development' })).toContain('http://localhost:3000')
  })
})

describe('upload-sniff', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])
  const webp = new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ')
  it('detects images by content', () => {
    expect(sniffImageMime(png)).toBe('image/png')
    expect(sniffImageMime(jpg)).toBe('image/jpeg')
    expect(sniffImageMime(webp)).toBe('image/webp')
    expect(sniffImageMime(new TextEncoder().encode('GIF89a....'))).toBe('image/gif')
    expect(sniffImageMime(new TextEncoder().encode('<html><script>alert(1)</script>'))).toBeNull()
  })
  it('accepts SVG only when asked', () => {
    const svg = new TextEncoder().encode('<?xml version="1.0"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(sniffImageMime(svg)).toBeNull()
    expect(sniffImageMime(svg, { allowSvg: true })).toBe('image/svg+xml')
    expect(sniffImageMime(new TextEncoder().encode('<html><svg></svg></html>'), { allowSvg: true })).toBeNull()
  })
  it('checks the extension against the sniffed type', () => {
    expect(imageExtensionMatches('logo.PNG', 'image/png')).toBe(true)
    expect(imageExtensionMatches('logo.png.html', 'image/png')).toBe(false)
    expect(imageExtensionMatches('photo.jpeg', 'image/jpeg')).toBe(true)
  })
  it('recognises STEP files', () => {
    expect(isStepFile(new TextEncoder().encode('ISO-10303-21;\nHEADER;'))).toBe(true)
    expect(isStepFile(new TextEncoder().encode('MZ\u0090\u0000'))).toBe(false)
  })
  it('decodes base64 images with a size cap and magic check', () => {
    const b64 = Buffer.from(jpg).toString('base64')
    expect(decodeBase64Image(`data:image/jpeg;base64,${b64}`, 1024)?.mime).toBe('image/jpeg')
    expect(decodeBase64Image(b64, 1024)?.mime).toBe('image/jpeg')
    expect(decodeBase64Image(Buffer.from('<svg/>').toString('base64'), 1024)).toBeNull()
    expect(decodeBase64Image(Buffer.from(new Uint8Array(4096).fill(0xff)).toString('base64'), 1024)).toBeNull()
    expect(decodeBase64Image('not base64 !!', 1024)).toBeNull()
  })
})

describe('xlsx-lite', () => {
  it('round-trips a workbook it wrote', () => {
    const bytes = buildXlsx(
      [
        { Provider: 'Groq', 'API key': 'k-1', Count: 3, Active: true },
        { Provider: 'R&D <team> "quoted"', 'API key': '=SUM(A1)', Count: 0, Active: false },
      ],
      { sheetName: 'Keys', columnWidths: [12, 20, 8, 8] },
    )
    const files = unzipSync(bytes)
    expect(strFromU8(files['xl/workbook.xml'])).toContain('name="Keys"')
    const rows = readSpreadsheetRows(bytes)
    expect(rows[0]).toEqual(['Provider', 'API key', 'Count', 'Active'])
    expect(rows[1]).toEqual(['Groq', 'k-1', 3, true])
    // Formula-looking text stays plain text (inline string, never a formula).
    expect(rows[2]).toEqual(['R&D <team> "quoted"', '=SUM(A1)', 0, false])
    expect(strFromU8(files['xl/worksheets/sheet1.xml'])).not.toContain('<f>')
  })

  it('reads shared strings, gaps and rich text like Excel writes them', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    const bytes = zipSync({
      'xl/workbook.xml': strToU8('<workbook xmlns:r="r"><sheets><sheet name="S" sheetId="1" r:id="rId7"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId7" Type="x" Target="worksheets/data.xml"/></Relationships>'),
      'xl/sharedStrings.xml': strToU8('<sst><si><t>openai</t></si><si><r><t>sk</t></r><r><t xml:space="preserve">-abc &amp; d</t></r></si></sst>'),
      'xl/worksheets/data.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="3"><c r="B3"><v>42.5</v></c><c r="C3" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>'),
    })
    const rows = readSpreadsheetRows(bytes)
    expect(rows[0]).toEqual(['openai', null, 'sk-abc & d'])
    expect(rows[1]).toEqual([])
    expect(rows[2]).toEqual([null, 42.5, 'x'])
  })

  it('parses CSV and rejects legacy .xls with a clear message', () => {
    expect(parseCsv('﻿name,key\r\n"Open, AI","a""b"\nx,\n')).toEqual([['name', 'key'], ['Open, AI', 'a"b'], ['x', '']])
    expect(readSpreadsheetRows(new TextEncoder().encode('a,b\n1,2'))).toEqual([['a', 'b'], ['1', '2']])
    const xls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0])
    expect(() => readSpreadsheetRows(xls)).toThrow(SpreadsheetError)
  })

  it('rejects a corrupt zip', () => {
    expect(() => readSpreadsheetRows(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toThrow(SpreadsheetError)
  })
})

describe('captchaGate', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })
  const req = { headers: headers({}) }

  it('is a no-op when Turnstile is not configured', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '')
    const { captchaGate } = await import('@/lib/captcha/require')
    expect(await captchaGate(req, undefined)).toBeNull()
  })

  it('requires a valid token when configured', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { captchaGate } = await import('@/lib/captcha/require')
    const missing = await captchaGate(req, '')
    expect(missing?.status).toBe(403)
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] })))
    expect((await captchaGate(req, 'bad-token-0123456789'))?.status).toBe(403)
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
    expect(await captchaGate(req, 'good-token-0123456789')).toBeNull()
  })
})

describe('sanitizeMongoInput', () => {
  it('strips operator and prototype keys deeply, keeps literals', async () => {
    const { sanitizeMongoInput, isMongoLiteral } = await import('@/lib/mongo-sanitize')
    const body = JSON.parse('{"email":{"$ne":null},"name":"Ada","tags":[{"$where":"1"},"x"],"nested":{"ok":1,"$gt":""},"__proto__":{"admin":true}}')
    const out = sanitizeMongoInput(body) as Record<string, any>
    expect(out.email).toEqual({})
    expect(out.name).toBe('Ada')
    expect(out.tags).toEqual([{}, 'x'])
    expect(out.nested).toEqual({ ok: 1 })
    expect(({} as Record<string, unknown>).admin).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(false)
    expect(isMongoLiteral('a')).toBe(true)
    expect(isMongoLiteral({ $ne: 1 })).toBe(false)
  })
})
