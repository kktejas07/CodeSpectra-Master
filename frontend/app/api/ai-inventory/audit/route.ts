/**
 * GET /api/ai-inventory/audit
 *
 * Runs a lightweight, in-process dependency vulnerability audit:
 *   - Python deps from /app/backend/requirements.txt (matched against a
 *     small embedded advisory list).
 *   - JS deps from /app/frontend/package.json (matched against the same list
 *     when the package name overlaps).
 *
 * For real production use, point this endpoint at `pip-audit` and
 * `npm audit --json` instead of the embedded list. This implementation is
 * intentionally self-contained so it works offline / in CI sandboxes.
 *
 * Admin-only. Returns a chunked report keyed by ecosystem.
 */
import { promises as fs } from 'fs'
import { NextResponse } from 'next/server'
import path from 'path'
import { getAPIUser } from '@/lib/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Advisory {
  package: string
  ecosystem: 'pypi' | 'npm'
  /** A simple `<` comparison; production usage should swap in semver / pep440. */
  vulnerable_below: string
  severity: 'low' | 'medium' | 'high' | 'critical'
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

function parsePipPin(line: string): { name: string; version: string } | null {
  // Accept: pkg==1.2.3, pkg>=1.2 (treat as no fixed version), pkg~=1.2
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

interface Finding {
  package: string
  installed: string
  ecosystem: 'pypi' | 'npm'
  severity: Advisory['severity']
  cve?: string
  summary: string
  fix: string
}

async function auditPython(): Promise<Finding[]> {
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

async function auditNpm(): Promise<Finding[]> {
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

export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const [python, npm] = await Promise.all([auditPython(), auditNpm()])
  return NextResponse.json({
    scanned_at: new Date().toISOString(),
    advisory_count: ADVISORIES.length,
    python: { findings: python, count: python.length },
    npm: { findings: npm, count: npm.length },
    note:
      'Embedded advisory list. For production accuracy, replace with `pip-audit --strict --format json` ' +
      'and `npm audit --json`.',
  })
}
