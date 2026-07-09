/**
 * Dependency scanner — parses manifest files and checks against OSV.dev vulnerability DB.
 * Supports: npm, pip, go, maven, gradle, cargo, bundler, nuget, composer
 */

interface DepEntry {
  name: string
  version: string
  ecosystem: string
}

export interface DepIssue {
  package_name: string
  current_version: string
  ecosystem: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  summary: string
  cve_id?: string
  fixed_version?: string
  aliases: string[]
}

const MANIFEST_PARSERS: Record<string, (text: string) => DepEntry[]> = {
  'package.json': parsePackageJson,
  'requirements.txt': parseRequirementsTxt,
  'go.mod': parseGoMod,
  'pom.xml': parsePomXml,
  'Cargo.toml': parseCargoToml,
  'Gemfile': parseGemfile,
  'Gemfile.lock': parseGemfileLock,
  'build.gradle': parseGradle,
  'composer.json': parseComposerJson,
  'packages.csproj': parseNuGet,
}

export function detectManifest(filename: string, text: string): { entries: DepEntry[]; manifestType: string } | null {
  const basename = filename.split('/').pop() || filename
  const parser = MANIFEST_PARSERS[basename]
  if (!parser) return null
  try {
    const entries = parser(text)
    return { entries, manifestType: basename }
  } catch {
    return null
  }
}

function parsePackageJson(text: string): DepEntry[] {
  const json = JSON.parse(text)
  const result: DepEntry[] = []
  for (const [name, ver] of Object.entries(json.dependencies || {})) {
    result.push({ name, version: String(ver).replace(/^[\^~]/, ''), ecosystem: 'npm' })
  }
  for (const [name, ver] of Object.entries(json.devDependencies || {})) {
    result.push({ name, version: String(ver).replace(/^[\^~]/, ''), ecosystem: 'npm' })
  }
  return result
}

function parseRequirementsTxt(text: string): DepEntry[] {
  const result: DepEntry[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue
    const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*[=~><!]+\s*([\d.*]+)/)
    if (match) result.push({ name: match[1].toLowerCase(), version: match[2], ecosystem: 'PyPI' })
  }
  return result
}

function parseGoMod(text: string): DepEntry[] {
  const result: DepEntry[] = []
  let inRequire = false
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('require (')) { inRequire = true; continue }
    if (trimmed === ')') { inRequire = false; continue }
    if (inRequire) {
      const match = trimmed.match(/^([a-zA-Z0-9_.\/-]+)\s+v?([\d.]+)/)
      if (match) result.push({ name: match[1], version: match[2], ecosystem: 'Go' })
    }
  }
  return result
}

function parsePomXml(text: string): DepEntry[] {
  const result: DepEntry[] = []
  const depRegex = /<dependency>[\s\S]*?<groupId>([^<]+)<\/groupId>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?(?:<version>([^<]*)<\/version>)?/g
  let match: RegExpExecArray | null
  while ((match = depRegex.exec(text)) !== null) {
    const ver = (match[3] || '').trim()
    if (ver) result.push({ name: `${match[1].trim()}:${match[2].trim()}`, version: ver, ecosystem: 'Maven' })
  }
  return result
}

function parseCargoToml(text: string): DepEntry[] {
  const result: DepEntry[] = []
  const lines = text.split('\n')
  let inDeps = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('[dependencies]')) { inDeps = true; continue }
    if (trimmed.startsWith('[') && inDeps) break
    if (inDeps) {
      const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*["']([^"']+)["']/)
      if (match) result.push({ name: match[1], version: match[2].replace(/^[\^~]/, ''), ecosystem: 'crates.io' })
    }
  }
  return result
}

function parseGemfile(text: string): DepEntry[] {
  const result: DepEntry[] = []
  for (const line of text.split('\n')) {
    const match = line.match(/gem\s+["']([^"']+)["']\s*,\s*["']([^"']+)["']/)
    if (match) result.push({ name: match[1], version: match[2], ecosystem: 'RubyGems' })
  }
  return result
}

function parseGemfileLock(text: string): DepEntry[] {
  const result: DepEntry[] = []
  let inSection = false
  for (const line of text.split('\n')) {
    if (line.trim().startsWith('specs:')) { inSection = true; continue }
    if (inSection && line.trim().startsWith('BUNDLED WITH')) { inSection = false; break }
    if (inSection) {
      const match = line.match(/^\s{4}([a-zA-Z0-9_-]+)\s+\(([\d.]+)/)
      if (match) result.push({ name: match[1], version: match[2], ecosystem: 'RubyGems' })
    }
  }
  return result
}

function parseGradle(text: string): DepEntry[] {
  const result: DepEntry[] = []
  for (const line of text.split('\n')) {
    const match = line.match(/(?:implementation|api|compile)\s+["']([^:]+):([^:]+):([^"']+)["']/)
    if (match) result.push({ name: `${match[1]}:${match[2]}`, version: match[3], ecosystem: 'Maven' })
  }
  return result
}

function parseComposerJson(text: string): DepEntry[] {
  const json = JSON.parse(text)
  const result: DepEntry[] = []
  for (const [name, ver] of Object.entries(json.require || {})) {
    result.push({ name, version: String(ver).replace(/^[\^~]/, ''), ecosystem: 'Packagist' })
  }
  return result
}

function parseNuGet(text: string): DepEntry[] {
  const result: DepEntry[] = []
  const refRegex = /<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"\s*\/>/g
  let match: RegExpExecArray | null
  while ((match = refRegex.exec(text)) !== null) {
    result.push({ name: match[1], version: match[2], ecosystem: 'NuGet' })
  }
  return result
}

// OSV.dev API query
async function queryOSV(entries: DepEntry[]): Promise<DepIssue[]> {
  const issues: DepIssue[] = []
  const batchSize = 50

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize)
    try {
      const res = await fetch('https://api.osv.dev/v1/querybatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: batch.map((e) => ({
            package: { name: e.name, ecosystem: e.ecosystem },
            version: e.version,
          })),
        }),
      })
      if (!res.ok) continue
      const data = await res.json() as { results: { vulns?: { id: string; aliases: string[]; summary: string; severity?: string; fixed?: string }[] }[] }
      for (let j = 0; j < data.results.length; j++) {
        const result = data.results[j]
        if (!result?.vulns?.length) continue
        for (const vuln of result.vulns) {
          const sev = mapSeverity(vuln.severity || 'MEDIUM')
          issues.push({
            package_name: batch[j].name,
            current_version: batch[j].version,
            ecosystem: batch[j].ecosystem,
            severity: sev,
            summary: vuln.summary || 'No summary available',
            cve_id: vuln.id,
            fixed_version: vuln.fixed,
            aliases: vuln.aliases || [],
          })
        }
      }
    } catch {
      continue
    }
  }
  return issues
}

// Embedded advisory database (fallback when OSV is unavailable)
const EMBEDDED_ADVISORIES: DepIssue[] = [
  { package_name: 'lodash', current_version: '<4.17.21', ecosystem: 'npm', severity: 'high', summary: 'Prototype pollution in lodash', cve_id: 'CVE-2020-8203', fixed_version: '4.17.21', aliases: ['GHSA-4xc9-xhrj-vm6j'] },
  { package_name: 'axios', current_version: '<0.21.1', ecosystem: 'npm', severity: 'medium', summary: 'Server-Side Request Forgery in axios', cve_id: 'CVE-2020-28168', fixed_version: '0.21.1', aliases: ['GHSA-4w2v-v9vh-wvw4'] },
  { package_name: 'minimist', current_version: '<1.2.3', ecosystem: 'npm', severity: 'high', summary: 'Prototype pollution in minimist', cve_id: 'CVE-2020-7598', fixed_version: '1.2.3', aliases: ['GHSA-7f63-6vc9-f5v7'] },
  { package_name: 'node-fetch', current_version: '<2.6.1', ecosystem: 'npm', severity: 'medium', summary: 'URL credential leakage in node-fetch', cve_id: 'CVE-2020-15168', fixed_version: '2.6.1', aliases: ['GHSA-r683-j2x4-v87g'] },
  { package_name: 'express', current_version: '<4.17.1', ecosystem: 'npm', severity: 'medium', summary: 'Path traversal in express.static', cve_id: 'CVE-2017-16119', fixed_version: '4.17.1', aliases: ['GHSA-3cwg-q9qm-4w88'] },
  { package_name: 'cross-fetch', current_version: '<3.1.5', ecosystem: 'npm', severity: 'high', summary: 'Cross-fetch certificate validation bypass', cve_id: 'CVE-2022-1351', fixed_version: '3.1.5', aliases: ['GHSA-6m3p-27fj-v82c'] },
  { package_name: 'underscore', current_version: '<1.13.0-2', ecosystem: 'npm', severity: 'high', summary: 'Arbitrary code execution via template function', cve_id: 'CVE-2021-23358', fixed_version: '1.13.0-2', aliases: ['GHSA-cf4h-3jh5-x42q'] },
  { package_name: 'Django', current_version: '<3.2.18', ecosystem: 'PyPI', severity: 'high', summary: 'Potential bypass of validation in Django', cve_id: 'CVE-2023-23969', fixed_version: '3.2.18', aliases: ['GHSA-qrpm-9xx2-w8vg'] },
  { package_name: 'Flask', current_version: '<2.2.5', ecosystem: 'PyPI', severity: 'medium', summary: 'Open redirect in Flask', cve_id: 'CVE-2023-30861', fixed_version: '2.2.5', aliases: ['GHSA-cw2r-6m4w-v7vg'] },
  { package_name: 'requests', current_version: '<2.31.0', ecosystem: 'PyPI', severity: 'medium', summary: 'Requests proxy header injection', cve_id: 'CVE-2023-32681', fixed_version: '2.31.0', aliases: ['GHSA-j8r2-6xqx-qr38'] },
  { package_name: 'golang.org/x/net', current_version: '<0.17.0', ecosystem: 'Go', severity: 'high', summary: 'HTTP/2 rapid reset attack (CVE-2023-39325)', cve_id: 'CVE-2023-39325', fixed_version: '0.17.0', aliases: ['GHSA-3c6p-8246-48p6'] },
  { package_name: 'org.apache.logging.log4j:log4j-core', current_version: '<2.17.1', ecosystem: 'Maven', severity: 'critical', summary: 'Log4Shell remote code execution in Log4j', cve_id: 'CVE-2021-44832', fixed_version: '2.17.1', aliases: ['GHSA-8489-44mv-ggj8'] },
  { package_name: 'com.fasterxml.jackson.core:jackson-databind', current_version: '<2.13.4.2', ecosystem: 'Maven', severity: 'high', summary: 'Jackson XML external entity injection', cve_id: 'CVE-2022-42003', fixed_version: '2.13.4.2', aliases: ['GHSA-4rx3-4f5q-69x2'] },
  { package_name: 'serde', current_version: '<1.0.171', ecosystem: 'crates.io', severity: 'medium', summary: 'Deserialization denial of service in serde', cve_id: 'CVE-2023-26548', fixed_version: '1.0.171', aliases: ['RUSTSEC-2023-0024'] },
  { package_name: 'openssl', current_version: '<0.10.48', ecosystem: 'crates.io', severity: 'high', summary: 'OpenSSL subject alternative name confusion', cve_id: 'CVE-2023-3446', fixed_version: '0.10.48', aliases: ['RUSTSEC-2023-0047'] },
]

function mapSeverity(s: string): 'critical' | 'high' | 'medium' | 'low' {
  const sev = s.toUpperCase()
  if (sev === 'CRITICAL') return 'critical'
  if (sev === 'HIGH' || sev === 'HIGH') return 'high'
  if (sev === 'MODERATE' || sev === 'MEDIUM') return 'medium'
  return 'low'
}

export async function scanDependencies(
  files: { path: string; content: string }[],
): Promise<{ issues: DepIssue[]; manifestsScanned: string[] }> {
  const manifestsScanned: string[] = []
  const allEntries: DepEntry[] = []

  for (const file of files) {
    const result = detectManifest(file.path, file.content)
    if (result) {
      manifestsScanned.push(`${file.path} (${result.manifestType})`)
      allEntries.push(...result.entries)
    }
  }

  if (allEntries.length === 0) {
    return { issues: [], manifestsScanned }
  }

  // Try OSV API first, fall back to embedded advisories
  let issues: DepIssue[]
  try {
    issues = await queryOSV(allEntries)
    if (issues.length === 0) throw new Error('no OSV results')
  } catch {
    issues = scanEmbedded(allEntries)
  }

  return { issues, manifestsScanned }
}

function scanEmbedded(entries: DepEntry[]): DepIssue[] {
  const found: DepIssue[] = []
  for (const entry of entries) {
    for (const advisory of EMBEDDED_ADVISORIES) {
      if (advisory.package_name.toLowerCase() === entry.name.toLowerCase() && advisory.ecosystem.toLowerCase() === entry.ecosystem.toLowerCase()) {
        if (advisory.current_version.startsWith('<')) {
          const fixed = advisory.fixed_version || ''
          if (fixed && compareVersions(entry.version, fixed) < 0) {
            found.push({ ...advisory, current_version: entry.version })
          }
        }
      }
    }
  }
  return found
}

// Minimal semver comparison (handles major.minor.patch only)
function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((s) => parseInt(s, 10) || 0)
  const pb = b.split(/[.-]/).map((s) => parseInt(s, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}
