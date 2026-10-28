/**
 * Condition evaluation for workflow triggers, filters and if/else steps
 * (pure, client-safe).
 *
 * Shape:
 *   { all: [ { field: 'trigger.percent', op: 'gte', value: 60 }, … ] }
 *   { any: [ … ] }
 *   { not: { … } }
 *   { field, op, value }                      ← a single rule
 *
 * `field` is a context path ("trigger.plan_id", "steps.lookup.count").
 * `value` may contain {{variables}}; it is interpolated before comparing.
 * Unknown ops evaluate to false. Nesting depth is bounded.
 */
import { getPath, interpolate, type Ctx } from './interpolate'

export const CONDITION_OPS = [
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte',
  'contains', 'not_contains', 'in', 'not_in',
  'starts_with', 'ends_with',
  'exists', 'not_exists', 'empty', 'not_empty',
  'before', 'after', 'is_true', 'is_false',
] as const
export type ConditionOp = (typeof CONDITION_OPS)[number]

export const OP_LABELS: Record<ConditionOp, string> = {
  eq: 'equals', ne: 'does not equal', gt: 'is greater than', gte: 'is at least', lt: 'is less than', lte: 'is at most',
  contains: 'contains', not_contains: 'does not contain', in: 'is one of', not_in: 'is not one of',
  starts_with: 'starts with', ends_with: 'ends with',
  exists: 'is set', not_exists: 'is not set', empty: 'is empty', not_empty: 'is not empty',
  before: 'is before (date)', after: 'is after (date)', is_true: 'is true', is_false: 'is false',
}

/** Ops that take no value. */
export const UNARY_OPS: ReadonlySet<string> = new Set(['exists', 'not_exists', 'empty', 'not_empty', 'is_true', 'is_false'])

export interface Rule {
  field: string
  op: ConditionOp | string
  value?: unknown
}
export interface Condition {
  all?: Condition[]
  any?: Condition[]
  not?: Condition
  field?: string
  op?: string
  value?: unknown
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v as object).length === 0
  return false
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  if (typeof v === 'boolean') return v ? 1 : 0
  return null
}

function asTime(v: unknown): number | null {
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v) {
    const t = Date.parse(v)
    return Number.isNaN(t) ? null : t
  }
  return null
}

function loose(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim().toLowerCase()
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return ''
    }
  }
  return String(v).toLowerCase()
}

function equal(a: unknown, b: unknown): boolean {
  const na = asNumber(a)
  const nb = asNumber(b)
  if (na !== null && nb !== null && typeof a !== 'boolean' && typeof b !== 'boolean') return na === nb
  if (typeof a === 'boolean' || typeof b === 'boolean') return loose(a) === loose(b)
  return loose(a) === loose(b)
}

function toList(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean)
  return v === undefined || v === null ? [] : [v]
}

function compare(a: unknown, b: unknown, cmp: (x: number, y: number) => boolean): boolean {
  const na = asNumber(a)
  const nb = asNumber(b)
  if (na !== null && nb !== null) return cmp(na, nb)
  const ta = asTime(a)
  const tb = asTime(b)
  if (ta !== null && tb !== null) return cmp(ta, tb)
  return false
}

/** Evaluate one rule against an already-resolved left value. */
export function evalRule(left: unknown, op: string, right: unknown): boolean {
  switch (op) {
    case 'eq': return equal(left, right)
    case 'ne': return !equal(left, right)
    case 'gt': return compare(left, right, (x, y) => x > y)
    case 'gte': return compare(left, right, (x, y) => x >= y)
    case 'lt': return compare(left, right, (x, y) => x < y)
    case 'lte': return compare(left, right, (x, y) => x <= y)
    case 'contains':
      if (Array.isArray(left)) return left.some((x) => equal(x, right))
      return loose(left).includes(loose(right))
    case 'not_contains':
      if (Array.isArray(left)) return !left.some((x) => equal(x, right))
      return !loose(left).includes(loose(right))
    case 'in': return toList(right).some((x) => equal(left, x))
    case 'not_in': return !toList(right).some((x) => equal(left, x))
    case 'starts_with': return loose(left).startsWith(loose(right))
    case 'ends_with': return loose(left).endsWith(loose(right))
    case 'exists': return left !== undefined && left !== null
    case 'not_exists': return left === undefined || left === null
    case 'empty': return isEmpty(left)
    case 'not_empty': return !isEmpty(left)
    case 'before': {
      const a = asTime(left)
      const b = asTime(right)
      return a !== null && b !== null && a < b
    }
    case 'after': {
      const a = asTime(left)
      const b = asTime(right)
      return a !== null && b !== null && a > b
    }
    case 'is_true': return left === true || loose(left) === 'true' || left === 1
    case 'is_false': return left === false || loose(left) === 'false' || left === 0 || left === null || left === undefined
    default: return false
  }
}

/** Evaluate a condition tree. An empty / missing condition is true. */
export function evaluateCondition(cond: Condition | null | undefined, ctx: Ctx, depth = 0): boolean {
  if (!cond || typeof cond !== 'object') return true
  if (depth > 8) return false
  if (Array.isArray(cond.all)) {
    if (!cond.all.every((c) => evaluateCondition(c, ctx, depth + 1))) return false
  }
  if (Array.isArray(cond.any) && cond.any.length) {
    if (!cond.any.some((c) => evaluateCondition(c, ctx, depth + 1))) return false
  }
  if (cond.not) {
    if (evaluateCondition(cond.not, ctx, depth + 1)) return false
  }
  if (typeof cond.field === 'string' && cond.field && typeof cond.op === 'string') {
    const left = getPath(ctx, cond.field.replace(/^\{\{\s*|\s*\}\}$/g, ''))
    const right = typeof cond.value === 'string' ? interpolate(cond.value, ctx) : cond.value
    if (!evalRule(left, cond.op, right)) return false
  }
  return true
}

/** Validate a condition tree's shape; returns human-readable problems. */
export function conditionProblems(cond: unknown, depth = 0): string[] {
  if (cond === null || cond === undefined) return []
  if (typeof cond !== 'object' || Array.isArray(cond)) return ['Condition must be an object']
  if (depth > 8) return ['Conditions are nested too deeply']
  const c = cond as Condition
  const out: string[] = []
  for (const k of ['all', 'any'] as const) {
    if (c[k] !== undefined) {
      if (!Array.isArray(c[k])) out.push(`"${k}" must be a list`)
      else if (c[k]!.length > 25) out.push(`"${k}" has too many rules (max 25)`)
      else for (const sub of c[k]!) out.push(...conditionProblems(sub, depth + 1))
    }
  }
  if (c.not !== undefined) out.push(...conditionProblems(c.not, depth + 1))
  if (c.field !== undefined || c.op !== undefined) {
    if (typeof c.field !== 'string' || !c.field.trim()) out.push('A rule needs a field')
    if (typeof c.op !== 'string' || !(CONDITION_OPS as readonly string[]).includes(c.op)) out.push(`Unknown comparison "${String(c.op)}"`)
  }
  return out
}
