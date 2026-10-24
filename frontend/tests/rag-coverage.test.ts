/**
 * Knowledge coverage gate: the assistant must be able to answer about the
 * whole application. Fails when
 *  - a docs/ folder (or root .md) is neither indexed nor explicitly excluded,
 *  - a markdown file in an indexed folder is not listed / does not load,
 *  - frontend/docs (the Docker mirror, scripts/sync-docs.cjs) drifts from docs/,
 *  - a dashboard page has no in-app guide and is not on PAGES_WITHOUT_GUIDE,
 *  - visibility rules let implementation docs reach the public assistants.
 * Fix by adding the doc/guide (preferred) or an exclusion with a reason.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { AgentCaller } from '@/lib/agent/contract'
import { canSeeChunk } from '@/lib/rag/acl'
import { canSeePublicChunk } from '@/lib/rag/public'
import { oracleCanSee } from '@/lib/rag/eval/metrics'
import { DOC_FOLDERS_NOT_INDEXED, INTERNAL_DOC_FOLDERS, internalDocSource, listInternalDocIds } from '@/lib/rag/sources/docs'
import { guideSource, listGuideIds } from '@/lib/rag/sources/guide'
import { GUIDE_CONTENT } from '@/components/tour/guide-content'
import { resolveTourId } from '@/lib/tour-paths'

const FRONTEND = process.cwd()
const REPO_DOCS = path.join(FRONTEND, '..', 'docs')
const MIRROR = path.join(FRONTEND, 'docs')
const hasRepoDocs = fs.existsSync(path.join(REPO_DOCS, 'public'))

/** Dashboard pages that deliberately have no guide, with the reason. Keep it short. */
const PAGES_WITHOUT_GUIDE: Record<string, string> = {
  '/dashboard/locked': 'access-denied screen shown in place of a blocked page',
  '/dashboard/analytics': 'redirects to /dashboard/skill-analytics (has a guide)',
  '/dashboard/quizzes': 'permanent redirect to /dashboard/company-tests (has a guide)',
}

function mdFiles(dir: string, rel = ''): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) return mdFiles(path.join(dir, e.name), r)
    return e.name.endsWith('.md') ? [r] : []
  })
}

function dashboardPages(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name === 'page.tsx' || e.name === 'page.ts') {
        out.push('/' + path.relative(path.join(FRONTEND, 'app'), dir).split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).join('/'))
      }
    }
  }
  walk(path.join(FRONTEND, 'app', 'dashboard'))
  return [...new Set(out)].sort()
}

describe.skipIf(!hasRepoDocs)('docs/ coverage', () => {
  it('every docs/ folder and root .md is indexed or explicitly excluded', () => {
    const entries = fs.readdirSync(REPO_DOCS, { withFileTypes: true })
    const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name)
    const unmapped = folders.filter((f) => !(f in INTERNAL_DOC_FOLDERS) && !(f in DOC_FOLDERS_NOT_INDEXED))
    expect(unmapped, 'add these to INTERNAL_DOC_FOLDERS (lib/rag/sources/docs.ts) or DOC_FOLDERS_NOT_INDEXED').toEqual([])
    const stale = Object.keys(INTERNAL_DOC_FOLDERS).filter((f) => f !== '.' && !folders.includes(f))
    expect(stale, 'INTERNAL_DOC_FOLDERS lists folders that no longer exist').toEqual([])
    if (entries.some((e) => e.isFile() && e.name.endsWith('.md'))) expect(INTERNAL_DOC_FOLDERS['.']).toBeDefined()
  })

  it('lists and loads every markdown file in the indexed folders', async () => {
    const expected = Object.keys(INTERNAL_DOC_FOLDERS).flatMap((f) =>
      f === '.'
        ? fs.readdirSync(REPO_DOCS).filter((n) => n.endsWith('.md')).map((n) => `docs:int/./${n.slice(0, -3)}`)
        : mdFiles(path.join(REPO_DOCS, f)).map((r) => `docs:int/${f}/${r.slice(0, -3)}`))
    const listed = await listInternalDocIds(REPO_DOCS)
    expect(listed.sort()).toEqual(expected.sort())
    for (const id of listed) {
      const src = await internalDocSource(id, REPO_DOCS)
      expect(src, `${id} did not load`).not.toBeNull()
      expect(src!.title.length, `${id} has no title`).toBeGreaterThan(0)
      const folder = id.split('/')[1]
      expect(src!.visibility).toBe(INTERNAL_DOC_FOLDERS[folder])
    }
  })

  it('frontend/docs mirrors docs/ (run `node scripts/sync-docs.cjs` and commit)', () => {
    const drift: string[] = []
    for (const rel of mdFiles(REPO_DOCS)) {
      const mirrored = path.join(MIRROR, rel)
      if (!fs.existsSync(mirrored)) drift.push(`missing: ${rel}`)
      else if (fs.readFileSync(mirrored, 'utf8') !== fs.readFileSync(path.join(REPO_DOCS, rel), 'utf8')) drift.push(`stale: ${rel}`)
    }
    expect(drift).toEqual([])
  })

  it('rejects ids outside the mapped folders', async () => {
    for (const id of ['docs:int/../etc/passwd', 'docs:int/security/../../x', 'docs:int/public/01-getting-started', 'docs:int/nope/x']) {
      expect(await internalDocSource(id, REPO_DOCS)).toBeNull()
    }
  })
})

describe('in-app guide coverage', () => {
  it('every guide entry is an indexable source', () => {
    const ids = listGuideIds()
    expect(ids.length).toBe(Object.keys(GUIDE_CONTENT).length)
    for (const id of ids) expect(guideSource(id), id).not.toBeNull()
    expect(guideSource('guide:__proto__')).toBeNull()
  })

  it('every dashboard page has a guide or an explicit exclusion', () => {
    const pages = dashboardPages()
    const uncovered = pages.filter((p) => {
      if (p in PAGES_WITHOUT_GUIDE) return false
      const id = resolveTourId(p)
      // '/dashboard' maps to the welcome guide; other pages must not fall back to it.
      return !id || !GUIDE_CONTENT[id] || (id === 'welcome' && p !== '/dashboard')
    })
    expect(uncovered, 'add a GUIDE_CONTENT entry + TOUR_ID_FOR_PATHS mapping, or a PAGES_WITHOUT_GUIDE reason').toEqual([])
    const stale = Object.keys(PAGES_WITHOUT_GUIDE).filter((p) => !pages.includes(p))
    expect(stale, 'PAGES_WITHOUT_GUIDE lists pages that no longer exist').toEqual([])
  })
})

describe('staff visibility (implementation docs)', () => {
  const TA: AgentCaller = { userId: 'u-ta', role: 'tenant_admin', tenantId: 't1' }
  const SUPER: AgentCaller = { userId: 'u-s', role: 'superadmin', tenantId: null }
  const staffRow = { tenant_key: '_platform', tenant_id: null, visibility: 'staff', source_type: 'doc' }
  const superRow = { ...staffRow, visibility: 'platform_admin' }

  it('org admins and superadmins see staff docs; public assistants never do', () => {
    expect(canSeeChunk(TA, staffRow)).toBe(true)
    expect(canSeeChunk(SUPER, staffRow)).toBe(true)
    expect(oracleCanSee(TA, staffRow)).toBe(true)
    expect(canSeePublicChunk(staffRow)).toBe(false)
  })

  it('superadmin-only docs stay superadmin-only', () => {
    expect(canSeeChunk(TA, superRow)).toBe(false)
    expect(oracleCanSee(TA, superRow)).toBe(false)
    expect(canSeePublicChunk(superRow)).toBe(false)
    for (const f of ['security', 'devops', 'audit', 'reports']) expect(INTERNAL_DOC_FOLDERS[f]).toBe('platform_admin')
  })
})
