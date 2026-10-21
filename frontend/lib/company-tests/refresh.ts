/**
 * Weekly company test refresh (server only). Off by default — Admin →
 * Company patterns turns it on. Runs from runPlatformCron under a database
 * lease (one run per week across replicas; see lib/automation/job-lease.ts).
 *
 * For each active pattern and level:
 *   - approved drafts are moved in (reconcileVersion)
 *   - ~rotatePercent of each section is swapped for unused bank questions of
 *     the same difficulty (rotateSection); a question with no replacement stays
 *   - a section still short is topped up from the bank
 *   - swaps the bank couldn't cover are generated as review drafts for next
 *     week, within the AI caps
 * A version that has never been built is built (bank + AI shortfall).
 */
import 'server-only'
import { composeSection, rotateSection, type Rand } from './compose'
import { buildVersion, generateDrafts, loadPool, reconcileVersion, tagQuestions } from './build'
import { aiUsageState, getCompanyTestSettings, listPatterns, recordAiUsage, versions } from './db'
import { BANK_DIFFICULTIES, PRACTICE_LEVELS, versionId, type BankDifficulty } from './types'

export interface RefreshReport {
  versions: number
  built: number
  swapped: number
  drafts: number
  aiCapped: boolean
}

export async function runCompanyTestsRefresh(now = new Date(), rand: Rand = Math.random): Promise<RefreshReport> {
  const settings = await getCompanyTestSettings(true)
  const report: RefreshReport = { versions: 0, built: 0, swapped: 0, drafts: 0, aiCapped: false }
  const fraction = settings.rotatePercent / 100
  const col = await versions()

  for (const pattern of await listPatterns({ activeOnly: true })) {
    const pool = await loadPool(pattern)
    for (const level of PRACTICE_LEVELS) {
      const existing = await col.findOne({ id: versionId(pattern.id, level) }, { projection: { _id: 0 } })
      if (!existing) {
        const r = await buildVersion(pattern, level, { allowAi: !report.aiCapped, now, rand })
        report.built++
        report.drafts += r.generated
        report.aiCapped ||= r.aiCapped
        continue
      }
      const v = await reconcileVersion(existing, pattern)
      const used = new Set(v.sections.flatMap((s) => s.questionIds))
      const unmetAll: { sectionId: string; difficulty: BankDifficulty; count: number }[] = []
      const sections = v.sections.map((s) => {
        const def = pattern.sections.find((x) => x.id === s.sectionId)
        if (!def) return s
        const rot = rotateSection({ current: s.questionIds, section: def, pool, fraction, rand })
        rot.questionIds.forEach((id) => used.add(id))
        report.swapped += rot.swapped
        let questionIds = rot.questionIds
        if (questionIds.length < def.questionCount) {
          const top = composeSection({ section: { ...def, questionCount: def.questionCount - questionIds.length }, level, pool, exclude: used, rand })
          top.picked.forEach((id) => used.add(id))
          questionIds = [...questionIds, ...top.picked]
        }
        for (const d of BANK_DIFFICULTIES) if (rot.unmet[d] > 0) unmetAll.push({ sectionId: def.id, difficulty: d, count: rot.unmet[d] })
        return { ...s, name: def.name, timeMinutes: def.timeMinutes, questionIds, missing: Math.max(0, def.questionCount - questionIds.length - s.pendingDraftIds.length) }
      })
      const complete = sections.length === pattern.sections.length
        && sections.every((s) => s.questionIds.length >= (pattern.sections.find((x) => x.id === s.sectionId)?.questionCount ?? 0))
      await col.updateOne({ id: v.id }, { $set: { sections, complete, refreshedAt: now.toISOString(), revision: (v.revision || 0) + 1 } })
      await tagQuestions(pattern, level, sections.flatMap((s) => s.questionIds))
      report.versions++

      // Fresh supply for next week: drafts for swaps the bank couldn't cover.
      for (const u of unmetAll) {
        if (report.aiCapped) break
        const { remaining } = await aiUsageState(now)
        if (remaining <= 0) { report.aiCapped = true; break }
        const def = pattern.sections.find((x) => x.id === u.sectionId)!
        const n = Math.min(u.count, remaining, 15)
        const out = await generateDrafts({ pattern, section: def, level, difficulty: u.difficulty, category: def.categories[0] || '', count: n })
        await recordAiUsage(n, out.costUsd, now).catch(() => undefined)
        report.drafts += out.ids.length
      }
    }
  }
  return report
}
