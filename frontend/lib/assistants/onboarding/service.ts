/**
 * Org onboarding (server only): counts → checklist (./checklist), a per-org
 * record (dismissed flag + last snapshot) and the daily loop that refreshes
 * young organisations and — only when "messaging" is switched on — nudges their
 * admins about the next open step, once per step per cooldown.
 *
 *   org_onboarding  { tenant_id, kind, dismissed, snapshot: Checklist, updated_at, completed_at }
 */
import 'server-only'
import type { Document, Filter } from 'mongodb'
import { lazyCollection } from '@/lib/community/lazy'
import { getMongoDb } from '@/lib/mongodb'
import { logger } from '@/lib/logger'
import { getAssistantSettings, markOnce, recordRun } from '../store'
import { computeChecklist, nudgeDue, ONBOARDING_WINDOW_DAYS, type Checklist, type OrgKind, type OrgState } from './checklist'

interface OnboardingDoc { tenant_id: string; kind: OrgKind; dismissed: boolean; snapshot: Checklist; updated_at: string; completed_at: string | null }

const onboardingCol = lazyCollection<OnboardingDoc>('org_onboarding', (c) => Promise.all([
  c.createIndex({ tenant_id: 1 }, { unique: true, name: 'org_onboarding_tenant' }),
]))

export async function loadOrgState(tenantId: string): Promise<OrgState> {
  const db = await getMongoDb()
  const count = (name: string, q: Record<string, unknown>) => db.collection(name).countDocuments(q as Filter<Document>, { limit: 1000 }).catch(() => 0)
  const tenant = await db.collection('tenants').findOne({ id: tenantId }, { projection: { _id: 0, name: 1, slug: 1, kind: 1, created_at: 1 } })
  const kind: OrgKind = tenant?.kind === 'college' ? 'college' : 'company'
  const college = kind === 'college' ? await db.collection('campus_colleges').findOne({ tenant_id: tenantId }, { projection: { _id: 0, departments: 1, batches: 1, staff: 1 } }) : null
  const [members, pending, tests, published, invites, jobs, students, drives, integrations, atsSettings] = await Promise.all([
    count('user', { $or: [{ tenantId }, { organizationId: tenantId }] }),
    count('organization_invitations', { organization_id: tenantId, status: 'pending' }),
    count('exams', { tenant_id: tenantId }),
    count('exams', { tenant_id: tenantId, status: { $in: ['available', 'published', 'active'] } }),
    count('candidate_invites', { tenant_id: tenantId }),
    count('ats_jobs', { tenant_id: tenantId }),
    kind === 'college' ? count('campus_students', { college_id: tenantId }) : Promise.resolve(0),
    kind === 'college' ? count('campus_drives', { college_id: tenantId }) : Promise.resolve(0),
    count('tenant_integrations', { tenant_id: tenantId, status: 'connected' }),
    count('ats_settings', { tenant_id: tenantId }),
  ])
  return {
    kind, created_at: typeof tenant?.created_at === 'string' ? tenant.created_at : null,
    members, pending_invites: pending, tests, published_tests: published, candidate_invites: invites, jobs,
    college_profile: !!college && Array.isArray(college.departments) && college.departments.length > 0 && Array.isArray(college.batches) && college.batches.length > 0,
    college_staff: Array.isArray(college?.staff) ? college.staff.length : 0,
    students, drives, integrations,
    profile_named: !!tenant?.name && !!tenant?.slug,
    careers_page: atsSettings > 0,
  }
}

export interface OnboardingView { checklist: Checklist; dismissed: boolean; org_name: string }

/** The checklist for an organisation (recomputed on every view; the snapshot is kept for the loop). */
export async function getOnboarding(tenantId: string): Promise<OnboardingView> {
  const [state, row, tenant] = await Promise.all([
    loadOrgState(tenantId),
    (await onboardingCol()).findOne({ tenant_id: tenantId }, { projection: { _id: 0 } }),
    (await getMongoDb()).collection('tenants').findOne({ id: tenantId }, { projection: { _id: 0, name: 1 } }),
  ])
  const checklist = computeChecklist(state)
  await saveSnapshot(tenantId, checklist, row?.dismissed ?? false)
  return { checklist, dismissed: row?.dismissed ?? false, org_name: String(tenant?.name || '') }
}

async function saveSnapshot(tenantId: string, c: Checklist, dismissed: boolean) {
  const now = new Date().toISOString()
  await (await onboardingCol()).updateOne(
    { tenant_id: tenantId },
    { $set: { kind: c.kind, snapshot: c, updated_at: now, ...(c.complete ? {} : { completed_at: null }) }, $setOnInsert: { tenant_id: tenantId, dismissed } },
    { upsert: true },
  ).catch(() => undefined)
  if (c.complete) await (await onboardingCol()).updateOne({ tenant_id: tenantId, completed_at: null }, { $set: { completed_at: now } }).catch(() => undefined)
}

export async function setDismissed(tenantId: string, dismissed: boolean): Promise<void> {
  await (await onboardingCol()).updateOne({ tenant_id: tenantId }, { $set: { dismissed, updated_at: new Date().toISOString() } }, { upsert: true })
}

/**
 * Daily loop: refresh organisations created in the last ONBOARDING_WINDOW_DAYS;
 * with messaging on, notify each org's admins (in-app + e-mail, their language,
 * with unsubscribe) about the next open step — once per (org, step) per cooldown.
 */
export async function runOnboardingLoop(now = new Date(), trigger: 'cron' | 'manual' = 'cron') {
  const s = await getAssistantSettings('org_onboarding')
  const started = now.toISOString()
  if (!s.enabled) return recordRun({ assistant: 'org_onboarding', trigger, status: 'skipped', started_at: started, message: 'Switched off', counts: {}, tenant_id: null })
  const db = await getMongoDb()
  const since = new Date(now.getTime() - ONBOARDING_WINDOW_DAYS * 86_400_000).toISOString()
  const orgs = await db.collection('tenants').find({ created_at: { $gte: since }, is_active: { $ne: false } }, { projection: { _id: 0, id: 1, created_at: 1 } }).limit(500).toArray()
  let refreshed = 0, nudged = 0, failed = 0
  const { notify } = await import('@/lib/notifications')
  for (const o of orgs) {
    try {
      const view = await getOnboarding(String(o.id))
      refreshed++
      if (!s.messaging_enabled || !nudgeDue(view.checklist, { created_at: String(o.created_at || ''), dismissed: view.dismissed, now })) continue
      const step = view.checklist.next!
      if (!(await markOnce('org_onboarding', `nudge:${o.id}:${step}`, s.cooldown_days, now))) continue
      const admins = await db.collection('user').find({ role: 'tenant_admin', $or: [{ tenantId: o.id }, { organizationId: o.id }] }, { projection: { id: 1, _id: 1 } }).limit(5).toArray()
      for (const a of admins) {
        // A setup nudge to the org's admins: through the shared per-person cap (CORE-046).
        const n = await notify({
          budget: { class: 'engagement', topic: 'org-onboarding-step', object: `${String(o.id)}:${step}:${now.toISOString().slice(0, 10)}`, source: 'onboarding-assistant' },
          user_id: String(a.id ?? a._id), type: 'assistant.onboarding_step',
          title: 'Next setup step', message: `${view.checklist.done} of ${view.checklist.total} setup steps done.`,
          title_i18n: { key: 'assistantOnboardingTitle' },
          message_i18n: [{ key: 'assistantOnboardingBody', params: { done: view.checklist.done, total: view.checklist.total } }, { key: `assistantOnboardingStep_${step}` }],
          link: '/dashboard/admin/onboarding', send_email: true,
        })
        if (n) nudged++
      }
    } catch (e) {
      failed++
      logger.warn(`[assistants] onboarding ${String(o.id).slice(0, 8)}: ${(e as Error)?.message}`)
    }
  }
  return recordRun({
    assistant: 'org_onboarding', trigger, status: failed && !refreshed ? 'failed' : failed ? 'partial' : 'ok', started_at: started, tenant_id: null,
    message: `${refreshed} organisation(s) checked, ${nudged} nudge(s)${s.messaging_enabled ? '' : ' (messaging off)'}${failed ? `, ${failed} failed` : ''}`,
    counts: { orgs: orgs.length, refreshed, nudged, failed },
  })
}
