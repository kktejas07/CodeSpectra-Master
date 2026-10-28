/**
 * Every gallery template and every starter workflow must validate and run
 * end to end as a test run against its sample payload (A-014: "starter
 * workflows crash on step 1").
 */
import { describe, it, expect } from 'vitest'
import { WORKFLOW_TEMPLATES } from '@/lib/automation/templates'
import { STARTER_WORKFLOWS } from '@/lib/automation/seeds'
import { advance, type RunState } from '@/lib/automation/engine'
import { builtinVars } from '@/lib/automation/interpolate'
import { validateDefinition, type StepDef } from '@/lib/automation/steps-catalog'
import { EVENT_TYPES, eventTypeDef } from '@/lib/automation/event-types'

/** Test-run executor: what the real executors return in dry-run, with plausible data for reads. */
async function dryExec(step: StepDef, cfg: Record<string, unknown>) {
  switch (step.type) {
    case 'mongo.find':
      return cfg.mode === 'count' ? { count: 0 } : cfg.mode === 'first' ? { id: 'x', email: 'asha@example.com', name: 'Asha', past_due: true, emailVerified: false, stage_id: 's_interview', status: 'active' } : []
    case 'ai.complete':
      return { dry_run: true, prompt_preview: String(cfg.prompt || '').slice(0, 100) }
    default:
      // Side-effect steps: the real executor validates and previews; here we
      // check the interpolated config has no unresolved/empty required values.
      return { dry_run: true, would: step.type, cfg }
  }
}

async function dryRun(steps: StepDef[], payload: Record<string, unknown>) {
  const state: RunState = { step_state: {}, logs: [] }
  const now = new Date('2026-03-02T09:00:00Z')
  const vars = builtinVars(now, 'https://app.example.com')
  const result = await advance(steps, { ...vars, vars, trigger: payload, workflow: { id: 'w', name: 'T' }, run: { id: 'r' }, steps: {} }, state, {
    now: () => now, dryRun: true, persistent: true, exec: dryExec,
  })
  return { result, state }
}

describe('workflow templates gallery', () => {
  it('has the twelve required templates', () => {
    const ids = WORKFLOW_TEMPLATES.map((t) => t.id)
    for (const id of ['payment-dunning', 'plan-expiry', 'abandoned-signup', 're-engagement', 'results-ready', 'hiring-stage-nudge', 'interview-reminders', 'hackathon-reminders', 'abandoned-checkout', 'weekly-admin-report', 'new-event-alert', 'certificate-follow-up']) {
      expect(ids).toContain(id)
    }
  })

  for (const t of WORKFLOW_TEMPLATES) {
    it(`"${t.name}" validates and completes a test run`, async () => {
      expect(validateDefinition({ trigger: t.trigger, cron_expression: t.cron_expression, event_type: t.event_type, event_filter: t.event_filter, steps: t.steps }, { platform: !!t.platformOnly })).toEqual([])
      if (t.event_type) expect(eventTypeDef(t.event_type)).toBeTruthy()
      const { result, state } = await dryRun(t.steps, t.sample_payload)
      expect(result.status).toBe('success')
      expect(state.logs.length).toBeGreaterThan(0)
      expect(state.logs.every((l) => l.ok)).toBe(true)
      // Emails in templates must resolve their recipient from the sample data.
      for (const l of state.logs) {
        const out = l.output as { would?: string; cfg?: Record<string, unknown> } | undefined
        if (out?.would === 'email.send') expect(String(out.cfg?.to || '')).toMatch(/@/)
      }
    })
  }

  it('tenant-safe templates use no platform-only steps', () => {
    for (const t of WORKFLOW_TEMPLATES.filter((x) => !x.platformOnly)) {
      expect(validateDefinition({ trigger: t.trigger, cron_expression: t.cron_expression, event_type: t.event_type, event_filter: t.event_filter, steps: t.steps }, { platform: false })).toEqual([])
    }
  })
})

describe('starter workflows (fixed seeds)', () => {
  for (const s of STARTER_WORKFLOWS) {
    it(`"${s.name}" runs`, async () => {
      expect(validateDefinition({ trigger: s.trigger, cron_expression: s.cron_expression, event_type: s.event_type, steps: s.steps }, { platform: true })).toEqual([])
      const { result } = await dryRun(s.steps, s.sample_payload)
      expect(result.status).toBe('success')
    })
  }
})

describe('event catalog', () => {
  it('covers the platform events and every sample matches its fields', () => {
    const types = EVENT_TYPES.map((e) => e.type)
    for (const t of ['user.created', 'user.inactive', 'exam.submitted', 'exam.graded', 'score.released', 'attempt.abandoned', 'payment.succeeded', 'payment.failed', 'subscription.expiring', 'subscription.expired', 'candidate.applied', 'candidate.stage_changed', 'interview.scheduled', 'interview.completed', 'bgv.completed', 'hackathon.registered', 'hackathon.starting', 'marketplace.order.paid', 'marketplace.order.shipped', 'learn.post.published', 'events_feed.new_event']) {
      expect(types).toContain(t)
    }
    for (const e of EVENT_TYPES) for (const f of e.fields) expect(Object.keys(e.sample)).toContain(f.key)
  })
})
