/**
 * RAG Query Router — classifies intent and maps a user query to the right
 * knowledge source types for retrieval.
 *
 * Runs purely on regex/heuristics (no LLM call) so it costs nothing and adds
 * < 1 ms to each EDITH request.
 *
 * Intent buckets:
 *   scan       — questions about the user's own code scans / scan results
 *   hiring     — jobs, applicants, resumes, ATS
 *   contest    — hackathons, codeathons, coding contests, events
 *   learning   — courses, problems, assessments, study plans
 *   platform   — CodeSpectra features, settings, credits, BYOK
 *   general    — everything else (falls back to all default types)
 */
import type { KnowledgeSourceType } from '@/lib/agent/contract'
import { DEFAULT_SEARCH_TYPES } from './types'

export type QueryIntent =
  | 'scan'
  | 'hiring'
  | 'contest'
  | 'learning'
  | 'platform'
  | 'general'

export interface RouterResult {
  intent: QueryIntent
  /** Source types to pass to searchKnowledge */
  types: KnowledgeSourceType[]
  /** Human-readable label for logging / debug */
  label: string
}

// ── Intent matchers ─────────────────────────────────────────────────────────

const SCAN_RE =
  /\b(scan|scans|my (code|scan|result|issue)|last (scan|result)|code (quality|issue|bug|smell|warning|error)|security (issue|vulnerability|flaw)|complexity|cyclomatic|sonar|static anal)/i

const HIRING_RE =
  /\b(job|jobs|applicant|applicants|resume|resumes|candidate|candidates|hiring|hire|ats|jd|job description|recrui|interview pipeline|talent|shortlist|application)/i

const CONTEST_RE =
  /\b(hackathon|codeathon|contest|competition|leaderboard|event|challenge|sprint|bounty|tournament)/i

const LEARNING_RE =
  /\b(course|courses|lesson|problem|problems|assessment|assessments|quiz|test|study|practice|module|lecture|topic|roadmap|curriculum|skill path|coding challenge)/i

const PLATFORM_RE =
  /\b(credit|credits|byok|api key|bring your own|settings|plan|billing|subscription|rate limit|feature|how (do|does|can) (i|the)|whats? (is|are) (the|a|an)|edith|dashboard|admin|superadmin|scanner feature|ai agent feature)/i

// ── Source type maps per intent ──────────────────────────────────────────────

const INTENT_TYPES: Record<QueryIntent, KnowledgeSourceType[]> = {
  scan: ['test_result_summary', 'attempt_summary', 'problem', 'doc'],
  hiring: ['ats_job', 'ats_application', 'resume', 'upload'],
  contest: ['hackathon', 'codeathon', 'contest', 'external_event', 'news'],
  learning: ['problem', 'question', 'course', 'test', 'test_result_summary', 'doc'],
  platform: ['doc', 'dev_doc', 'digest', 'news'],
  general: [...DEFAULT_SEARCH_TYPES],
}

const INTENT_LABELS: Record<QueryIntent, string> = {
  scan: 'code scan history',
  hiring: 'hiring / ATS',
  contest: 'contests & hackathons',
  learning: 'learning content',
  platform: 'platform docs',
  general: 'all sources',
}

// ── Main classifier ──────────────────────────────────────────────────────────

/**
 * Classify the query intent and return the matching source types.
 * Order matters — more specific matchers win over general ones.
 */
export function routeQuery(query: string): RouterResult {
  const q = query.trim()

  if (SCAN_RE.test(q)) {
    return { intent: 'scan', types: INTENT_TYPES.scan, label: INTENT_LABELS.scan }
  }
  if (HIRING_RE.test(q)) {
    return { intent: 'hiring', types: INTENT_TYPES.hiring, label: INTENT_LABELS.hiring }
  }
  if (CONTEST_RE.test(q)) {
    return { intent: 'contest', types: INTENT_TYPES.contest, label: INTENT_LABELS.contest }
  }
  if (LEARNING_RE.test(q)) {
    return { intent: 'learning', types: INTENT_TYPES.learning, label: INTENT_LABELS.learning }
  }
  if (PLATFORM_RE.test(q)) {
    return { intent: 'platform', types: INTENT_TYPES.platform, label: INTENT_LABELS.platform }
  }

  return { intent: 'general', types: INTENT_TYPES.general, label: INTENT_LABELS.general }
}
