/**
 * GET /api/ai-inventory/audit
 *
 * Runs a dependency vulnerability audit. Behaviour:
 *
 *   - In **production** (`NODE_ENV === 'production'` or `AI_INVENTORY_REAL_AUDIT=1`):
 *     spawns `pip-audit --strict --format json -r /app/backend/requirements.txt`
 *     and `npm audit --json --omit=dev` against `/app/frontend`. If those tools
 *     aren't installed or fail to spawn, the embedded advisory fallback is
 *     used so the endpoint still returns useful data.
 *
 *   - In **development**: uses the embedded advisory list directly so the
 *     dashboard works offline / in CI sandboxes without `pip-audit` or
 *     network access.
 *
 * Admin-only. Returns a chunked report keyed by ecosystem with a `source`
 * field so callers can tell whether the data came from a real CLI run or
 * from the static fallback list.
 */
import { promises as fs } from 'fs'
import { spawn } from 'child_process'
import { NextResponse } from 'next/server'
import path from 'path'
import { getAPIUser } from '@/lib/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Severity = 'low' | 'medium' | 'high' | 'critical'

interface Finding {
  package: string
  installed: string
  ecosystem: 'pypi' | 'npm'
  severity: Severity
  cve?: string
  summary: string
  fix: string
}

interface Advisory {
  package: string
  ecosystem: 'pypi' | 'npm'
  vulnerable_below: string
  severity: Severity
  cve?: string
  summary: string
  fix: string
}

const ADVISORIES: Advisory[] = [
  {
    package: 'requests',
    ecosystem: 'pypi',
    vulnerable_below: '2.32.4',
    severity: 'medium',
    cve: 'CVE-2024-47081',
    summary: 'Netrc credentials leakage to arbitrary URLs via redirects.',
    fix: 'Upgrade to requests >= 2.32.4',
  },
  {
    package: 'cryptography',
    ecosystem: 'pypi',
    vulnerable_below: '42.0.0',
    severity: 'high',
    cve: 'CVE-2023-50782',
    summary: 'OpenSSL Bleichenbacher timing oracle in PKCS#1 v1.5 unwrap.',
    fix: 'Upgrade to cryptography >= 42.0.0',
  },
  {
    package: 'urllib3',
    ecosystem: 'pypi',
    vulnerable_below: '2.2.2',
    severity: 'medium',
    cve: 'CVE-2024-37891',
    summary: 'Proxy-Authorization header leaks across cross-origin redirects.',
    fix: 'Upgrade to urllib3 >= 2.2.2',
  },
  {
    package: 'jinja2',
    ecosystem: 'pypi',
    vulnerable_below: '3.1.5',
    severity: 'medium',
    cve: 'CVE-2024-56201',
    summary: 'Sandbox escape via attr filter in untrusted templates.',
    fix: 'Upgrade to jinja2 >= 3.1.5',
  },
  {
    package: 'next',
    ecosystem: 'npm',
    vulnerable_below: '14.2.15',
    severity: 'medium',
    cve: 'CVE-2024-46982',
    summary: 'Cache poisoning via crafted x-now-route-matches header.',
    fix: 'Upgrade to next >= 14.2.15',
  },
  {
    package: 'axios',
    ecosystem: 'npm',
    vulnerable_below: '1.7.4',
    severity: 'high',
    cve: 'CVE-2024-39338',
    summary: 'SSRF via absolute URL passed to axios.request with baseURL.',
    fix: 'Upgrade to axios >= 1.7.4',
  },
]

function isAdmin(role?: string | null): boolean {
  return ['superadmin', 'admin', 'tenant_admin'].includes((role || '').toLowerCase())
}

function shouldUseRealAudit(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.AI_INVENTORY_REAL_AUDIT === '1'
}

function normSeverity(raw: string | undefined | null): Severity {
  const s = (raw || '').toLowerCase()
  if (s === 'critical') return 'critical'
  if (s === 'high') return 'high'
  if (s === 'moderate' || s === 'medium') return 'medium'
  return 'low'
}

/** Run a command, capture stdout, with a hard timeout. */
function runCmd(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null; spawned: boolean }> {
  return new Promise((resolve) => {
    let spawned = true
    let child
    try {
      child = spawn(cmd, args, {
        cwd: opts.cwd,
        timeout: opts.timeoutMs ?? 30_000,
        killSignal: 'SIGKILL',
      })
    } catch {
      resolve({ ok: false, stdout: '', stderr: 'spawn-failed', code: null, spawned: false })
      return
    }
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout?.on('data', (c) => out.push(c))
    child.stderr?.on('data', (c) => err.push(c))
    child.on('error', () => {
      spawned = false
      resolve({ ok: false, stdout: '', stderr: Buffer.concat(err).toString(), code: null, spawned: false })
    })
    child.on('close', (code) => {
      const stdout = Buffer.concat(out).toString('utf8')
      const stderr = Buffer.concat(err).toString('utf8')
      // pip-audit / npm audit exit non-zero when vulns are found — still a successful scan.
      resolve({ ok: code === 0 || code === 1, stdout, stderr, code, spawned })
    })
  })
}

function parsePipPin(line: string): { name: string; version: string } | null {
  const m = line.match(/^\s*([A-Za-z0-9_.\-]+)\s*(?:==|>=|~=|>)\s*([0-9][0-9A-Za-z.\-_+]*)/)
  if (!m) return null
  return { name: m[1].toLowerCase(), version: m[2] }
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((s) => Number(s) || 0)
  const pb = b.split(/[.-]/).map((s) => Number(s) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/* -------------------- Embedded (fallback) auditors -------------------- */

async function auditPythonEmbedded(): Promise<Finding[]> {
  const file = path.resolve('/app/backend/requirements.txt')
  const findings: Finding[] = []
  try {
    const text = await fs.readFile(file, 'utf8')
    for (const raw of text.split(/\r?\n/)) {
      if (!raw || raw.trim().startsWith('#')) continue
      const pin = parsePipPin(raw)
      if (!pin) continue
      for (const adv of ADVISORIES) {
        if (adv.ecosystem !== 'pypi') continue
        if (adv.package.toLowerCase() !== pin.name) continue
        if (compareSemver(pin.version, adv.vulnerable_below) < 0) {
          findings.push({
            package: pin.name,
            installed: pin.version,
            ecosystem: 'pypi',
            severity: adv.severity,
            cve: adv.cve,
            summary: adv.summary,
            fix: adv.fix,
          })
        }
      }
    }
  } catch {
    /* missing file → empty findings */
  }
  return findings
}

async function auditNpmEmbedded(): Promise<Finding[]> {
  const file = path.resolve('/app/frontend/package.json')
  const findings: Finding[] = []
  try {
    const text = await fs.readFile(file, 'utf8')
    const pkg = JSON.parse(text) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const all = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
    for (const [name, raw] of Object.entries(all)) {
      const cleaned = String(raw).replace(/^[\^~>=<\s]+/, '').trim()
      if (!cleaned) continue
      for (const adv of ADVISORIES) {
        if (adv.ecosystem !== 'npm') continue
        if (adv.package.toLowerCase() !== name.toLowerCase()) continue
        if (compareSemver(cleaned, adv.vulnerable_below) < 0) {
          findings.push({
            package: name,
            installed: cleaned,
            ecosystem: 'npm',
            severity: adv.severity,
            cve: adv.cve,
            summary: adv.summary,
            fix: adv.fix,
          })
        }
      }
    }
  } catch {
    /* missing file → empty findings */
  }
  return findings
}

/* -------------------- Real CLI auditors -------------------- */

interface PipAuditDep {
  name: string
  version: string
  vulns?: Array<{
    id?: string
    aliases?: string[]
    description?: string
    fix_versions?: string[]
  }>
}

interface PipAuditReport {
  dependencies?: PipAuditDep[]
}

async function auditPythonReal(): Promise<{ findings: Finding[]; ok: boolean; stderr?: string }> {
  const req = path.resolve('/app/backend/requirements.txt')
  const res = await runCmd(
    'pip-audit',
    ['--strict', '--format', 'json', '-r', req],
    { timeoutMs: 45_000 },
  )
  if (!res.spawned) return { findings: [], ok: false, stderr: 'pip-audit not installed' }
  if (!res.stdout) return { findings: [], ok: res.ok, stderr: res.stderr }
  const findings: Finding[] = []
  try {
    const parsed = JSON.parse(res.stdout) as PipAuditReport
    for (const dep of parsed.dependencies || []) {
      for (const v of dep.vulns || []) {
        const cve = (v.aliases || []).find((a) => a.startsWith('CVE-')) || v.id
        const fix = v.fix_versions && v.fix_versions.length > 0
          ? `Upgrade ${dep.name} to >= ${v.fix_versions[0]}`
          : `Upgrade ${dep.name} when a fix is available`
        findings.push({
          package: dep.name.toLowerCase(),
          installed: dep.version,
          ecosystem: 'pypi',
          severity: 'medium', // pip-audit JSON doesn't include severity reliably
          cve,
          summary: (v.description || `Advisory ${v.id || ''}`).split('\n')[0].slice(0, 240),
          fix,
        })
      }
    }
    return { findings, ok: true }
  } catch (e) {
    return { findings: [], ok: false, stderr: `parse-error: ${(e as Error).message}` }
  }
}

interface NpmAuditAdvisory {
  source?: number
  name?: string
  title?: string
  url?: string
  severity?: string
  range?: string
  cwe?: string[]
  cves?: string[]
}

interface NpmAuditVuln {
  name: string
  severity: string
  via: Array<string | NpmAuditAdvisory>
  range?: string
  fixAvailable?: boolean | { name: string; version: string }
  effects?: string[]
  nodes?: string[]
}

interface NpmAuditReport {
  vulnerabilities?: Record<string, NpmAuditVuln>
}

async function auditNpmReal(): Promise<{ findings: Finding[]; ok: boolean; stderr?: string }> {
  const cwd = path.resolve('/app/frontend')
  const res = await runCmd(
    'npm',
    ['audit', '--json', '--omit=dev'],
    { cwd, timeoutMs: 60_000 },
  )
  if (!res.spawned) return { findings: [], ok: false, stderr: 'npm not installed' }
  if (!res.stdout) return { findings: [], ok: res.ok, stderr: res.stderr }
  const findings: Finding[] = []
  try {
    const parsed = JSON.parse(res.stdout) as NpmAuditReport
    for (const [name, vuln] of Object.entries(parsed.vulnerabilities || {})) {
      const adv = (vuln.via || []).find((v): v is NpmAuditAdvisory => typeof v === 'object')
      const cve = adv?.cves?.[0]
      const fixVer =
        typeof vuln.fixAvailable === 'object' && vuln.fixAvailable
          ? vuln.fixAvailable.version
          : null
      findings.push({
        package: name,
        installed: vuln.range || 'unknown',
        ecosystem: 'npm',
        severity: normSeverity(vuln.severity),
        cve,
        summary: (adv?.title || `Vulnerable ${name} ${vuln.range || ''}`).slice(0, 240),
        fix: fixVer ? `Upgrade ${name} to ${fixVer}` : `Run \`npm audit fix\` in /app/frontend`,
      })
    }
    return { findings, ok: true }
  } catch (e) {
    return { findings: [], ok: false, stderr: `parse-error: ${(e as Error).message}` }
  }
}

/* -------------------- Route handler -------------------- */

export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const useReal = shouldUseRealAudit()
  const errors: Record<string, string> = {}

  let pyFindings: Finding[] = []
  let npmFindings: Finding[] = []
  let pySource: 'cli' | 'embedded' = 'embedded'
  let npmSource: 'cli' | 'embedded' = 'embedded'

  if (useReal) {
    const [py, npmRes] = await Promise.all([auditPythonReal(), auditNpmReal()])
    if (py.ok) {
      pyFindings = py.findings
      pySource = 'cli'
    } else {
      errors.python = py.stderr || 'pip-audit failed'
      pyFindings = await auditPythonEmbedded()
    }
    if (npmRes.ok) {
      npmFindings = npmRes.findings
      npmSource = 'cli'
    } else {
      errors.npm = npmRes.stderr || 'npm audit failed'
      npmFindings = await auditNpmEmbedded()
    }
  } else {
    pyFindings = await auditPythonEmbedded()
    npmFindings = await auditNpmEmbedded()
  }

  return NextResponse.json({
    scanned_at: new Date().toISOString(),
    mode: useReal ? 'real' : 'embedded',
    advisory_count: ADVISORIES.length,
    python: { findings: pyFindings, count: pyFindings.length, source: pySource },
    npm: { findings: npmFindings, count: npmFindings.length, source: npmSource },
    errors: Object.keys(errors).length > 0 ? errors : undefined,
    note:
      useReal
        ? 'Real CLI audit: pip-audit + npm audit. Falls back to embedded advisories if CLI fails.'
        : 'Embedded advisory list (dev mode). Set NODE_ENV=production or AI_INVENTORY_REAL_AUDIT=1 to run pip-audit + npm audit.',
  })
}
