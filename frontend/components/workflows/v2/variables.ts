/**
 * Variables a step can use, for the builder's variable picker (pure).
 */
import { eventTypeDef } from '@/lib/automation/event-types'
import type { StepDef } from '@/lib/automation/steps-catalog'
import { stepTypeDef } from '@/lib/automation/steps-catalog'

export interface VarOption {
  path: string
  label: string
  group: 'Trigger' | 'Steps' | 'Built-in' | 'Loop'
}

export interface TriggerInfo {
  trigger: string
  event_type?: string | null
  sample_payload?: Record<string, unknown> | null
}

function samplePaths(obj: unknown, prefix: string, depth = 0): VarOption[] {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || depth > 2) return []
  const out: VarOption[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>).slice(0, 40)) {
    const path = `${prefix}.${k}`
    out.push({ path, label: k, group: 'Trigger' })
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...samplePaths(v, path, depth + 1))
  }
  return out
}

export function triggerVariables(t: TriggerInfo): VarOption[] {
  if (t.trigger === 'event' && t.event_type) {
    const def = eventTypeDef(t.event_type)
    if (def) return def.fields.map((f) => ({ path: `trigger.${f.key}`, label: f.label, group: 'Trigger' as const }))
  }
  return samplePaths(t.sample_payload || {}, 'trigger')
}

export const BUILTIN_VARS: VarOption[] = [
  { path: 'vars.now', label: 'Now (date/time)', group: 'Built-in' },
  { path: 'vars.today', label: 'Today (YYYY-MM-DD)', group: 'Built-in' },
  { path: 'vars.yesterday', label: '24 hours ago', group: 'Built-in' },
  { path: 'vars.sevenDaysAgo', label: '7 days ago', group: 'Built-in' },
  { path: 'vars.thirtyDaysAgo', label: '30 days ago', group: 'Built-in' },
  { path: 'vars.inOneHour', label: 'An hour from now', group: 'Built-in' },
  { path: 'vars.inOneDay', label: '24 hours from now', group: 'Built-in' },
  { path: 'vars.app_url', label: 'Site address', group: 'Built-in' },
  { path: 'workflow.name', label: 'Workflow name', group: 'Built-in' },
  { path: 'run.id', label: 'Run id', group: 'Built-in' },
]

/** Steps that run before `targetId` (depth-first order), plus loop variables when inside a for-each. */
export function priorStepVariables(steps: StepDef[], targetId: string): VarOption[] {
  const out: VarOption[] = []
  let found = false
  const walk = (list: StepDef[], inLoop: boolean): boolean => {
    for (const s of list) {
      if (s.id === targetId) {
        if (inLoop) out.push({ path: 'item', label: 'Current item', group: 'Loop' }, { path: 'index', label: 'Item number (from 0)', group: 'Loop' })
        found = true
        return true
      }
      const td = stepTypeDef(s.type)
      if (s.type === 'condition') {
        if (walk(s.then || [], inLoop) || walk(s.else || [], inLoop)) return true
      } else if (s.type === 'for_each') {
        if (walk(s.steps || [], true)) return true
      }
      if (td && s.type !== 'log') {
        const base = `steps.${s.id}`
        const name = s.label || td.label
        if (s.type === 'mongo.find') {
          const mode = String(s.config?.mode || 'list')
          out.push(mode === 'count' ? { path: `${base}.count`, label: `${name} → count`, group: 'Steps' } : { path: base, label: `${name} → result`, group: 'Steps' })
        } else if (s.type === 'ai.complete') out.push({ path: base, label: `${name} → text`, group: 'Steps' })
        else out.push({ path: base, label: `${name} → output`, group: 'Steps' })
      }
    }
    return false
  }
  walk(steps, false)
  return found ? out : out
}
