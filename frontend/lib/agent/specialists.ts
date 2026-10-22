/**
 * Specialist sub-agents (pure). Each is a focused system prompt + a subset of
 * the caller's tools. The main loop routes by intent (which tools it offers)
 * and can hand a sub-task to a specialist with `delegate_to_specialist`; the
 * specialist runs the same loop with the same permission + tenant checks —
 * its tools are filtered from the caller's own allowed tools, never added.
 */
import type { AgentTool } from '@/lib/agent/contract'

export type SpecialistId = 'hiring' | 'assessments' | 'events' | 'marketplace' | 'content' | 'automations' | 'analytics'

export interface Specialist {
  id: SpecialistId
  label: string
  /** One line for the main agent: when to delegate. */
  description: string
  /** Extra instructions for the specialist's system prompt. */
  focus: string
  tools: readonly string[]
  /** Intent keywords (lower case, whole words or prefixes). */
  keywords: readonly string[]
}

/** Tools every specialist and the main agent may use. */
export const GENERAL_TOOLS = ['search_knowledge', 'get_analytics', 'get_plan_usage'] as const

export const SPECIALISTS: readonly Specialist[] = [
  {
    id: 'hiring',
    label: 'Hiring specialist',
    description: 'Jobs, applicants, pipeline stages, interviews, bot screening, HR decisions, background checks and the hiring funnel.',
    focus: 'You manage the hiring pipeline (ATS). Look up the job and the application before any change. Stage moves, rejections, interview scheduling, screenings and HR decisions are proposals. Never reveal salary figures unless the tool returned them, and never show background-check document contents.',
    tools: ['list_jobs', 'get_job', 'create_job', 'update_job', 'set_job_status', 'list_applicants', 'get_application', 'move_application_stage', 'reject_application', 'shortlist_applicants', 'schedule_interview', 'get_interview_scorecards', 'start_bot_screening', 'record_hr_decision', 'get_bgv_status', 'get_hiring_funnel', 'get_hiring_analytics', 'get_candidate', 'search_talent'],
    keywords: ['job', 'jobs', 'jd', 'applicant', 'applicants', 'application', 'candidate', 'pipeline', 'stage', 'interview', 'interviews', 'scorecard', 'screening', 'screen', 'shortlist', 'reject', 'hire', 'hiring', 'offer', 'bgv', 'background', 'recruit', 'opening', 'funnel', 'hr'],
  },
  {
    id: 'assessments',
    label: 'Assessments specialist',
    description: 'Tests, invites, reminders, results, scores, certificates, question bank and coding problems.',
    focus: 'You build and run assessments. Check the test and its results before changing anything. Publishing, inviting, reminding and releasing scores are proposals.',
    tools: ['list_tests', 'get_test', 'get_test_results', 'get_candidate', 'list_invites', 'create_test', 'build_company_test', 'update_test', 'publish_test', 'invite_candidates', 'send_reminders', 'release_scores', 'record_outcomes', 'shortlist_candidates', 'revoke_certificate', 'search_question_bank', 'search_problems', 'create_problem', 'update_problem', 'publish_problem', 'add_questions_to_bank', 'get_question_coverage', 'run_question_bot', 'get_integrity_report', 'start_mock_interview', 'get_study_plan', 'regenerate_study_plan'],
    keywords: ['test', 'tests', 'assessment', 'assessments', 'quiz', 'invite', 'invites', 'reminder', 'reminders', 'score', 'scores', 'result', 'results', 'certificate', 'question', 'questions', 'problem', 'problems', 'coding', 'mcq', 'grade', 'grading', 'mock', 'study', 'learner'],
  },
  {
    id: 'events',
    label: 'Events specialist',
    description: 'Hackathons, codeathons, hosted contests (CTF, datathon, prompt-a-thon, ideathon, code golf…), judges, results, and the external events feed (search, feature, hide, subscribers).',
    focus: 'You run hackathons, codeathons and the events feed. Publishing, judging assignments, releasing results and feed visibility changes are proposals.',
    tools: ['list_hackathons', 'get_hackathon', 'create_hackathon', 'update_hackathon', 'publish_hackathon', 'assign_judges', 'release_hackathon_results', 'list_codeathons', 'get_codeathon', 'create_codeathon', 'update_codeathon', 'publish_codeathon', 'release_codeathon_results', 'create_contest', 'publish_contest', 'release_contest_results', 'get_integrity_report', 'search_feed_events', 'set_feed_event_visibility', 'get_feed_stats', 'search_problems', 'list_placement_drives', 'get_batch_readiness'],
    keywords: ['hackathon', 'hackathons', 'codeathon', 'codeathons', 'contest', 'judge', 'judges', 'event', 'events', 'feed', 'campus', 'drive', 'team', 'teams', 'ctf', 'datathon', 'ideathon', 'promptathon', 'placement', 'placements', 'readiness', 'batch'],
  },
  {
    id: 'marketplace',
    label: 'Marketplace specialist',
    description: 'Marketplace products, orders, sellers and payouts; product moderation, refund and payout decisions.',
    focus: 'You look after the marketplace. Money decisions (refunds, payouts) and moderation are proposals with risk shown; never promise money movement.',
    tools: ['list_marketplace_products', 'list_marketplace_orders', 'list_marketplace_sellers', 'list_marketplace_payouts', 'get_marketplace_sales', 'moderate_product', 'decide_refund', 'decide_payout'],
    keywords: ['marketplace', 'product', 'products', 'order', 'orders', 'seller', 'sellers', 'payout', 'payouts', 'refund', 'refunds', 'sales', 'store', 'listing', 'moderation'],
  },
  {
    id: 'content',
    label: 'Content specialist',
    description: 'Learn hub topics, drafts and posts: generate a draft, approve, publish or unpublish.',
    focus: 'You manage Learn hub content. Generating a draft, approving and publishing are proposals; summarise drafts in plain language.',
    tools: ['list_learn_topics', 'list_learn_posts', 'generate_learn_draft', 'set_learn_post_status'],
    keywords: ['learn', 'post', 'posts', 'article', 'articles', 'blog', 'draft', 'drafts', 'topic', 'topics', 'content', 'publish'],
  },
  {
    id: 'automations',
    label: 'Automations specialist',
    description: 'Workflows and their runs, templates, switching workflows on/off, re-running failures and scheduled copilot tasks ("every Monday send me…").',
    focus: 'You manage automations. New workflows start switched off unless the admin asked for a schedule; switching on, re-running and scheduled tasks are proposals.',
    tools: ['list_workflows', 'list_workflow_runs', 'list_workflow_templates', 'create_workflow_from_template', 'set_workflow_enabled', 'rerun_workflow_run', 'schedule_agent_task'],
    keywords: ['workflow', 'workflows', 'automation', 'automations', 'automate', 'schedule', 'scheduled', 'every', 'weekly', 'daily', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'remind', 'trigger', 'run', 'runs'],
  },
  {
    id: 'analytics',
    label: 'Analytics specialist',
    description: 'KPIs and trends across tests, hiring, events, marketplace and copilot usage.',
    focus: 'You answer numbers questions. Use the analytics tools, state the period, and never estimate a number a tool did not return.',
    tools: ['get_analytics', 'get_plan_usage', 'get_hiring_funnel', 'get_hiring_analytics', 'get_marketplace_sales', 'get_feed_stats', 'get_copilot_usage', 'get_platform_kpis'],
    keywords: ['analytics', 'kpi', 'kpis', 'metrics', 'trend', 'trends', 'report', 'reports', 'dashboard', 'conversion', 'usage', 'how', 'many', 'average', 'rate', 'stats'],
  },
]

export function specialistById(id: unknown): Specialist | undefined {
  return SPECIALISTS.find((s) => s.id === id)
}

const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)

/** Specialists ranked by keyword hits in the text (best first; only those with hits). */
export function routeIntent(text: string): SpecialistId[] {
  const w = words(text)
  const scored = SPECIALISTS.map((s) => {
    let n = 0
    for (const k of s.keywords) if (w.some((x) => x === k || (k.length > 4 && x.startsWith(k)))) n++
    return { id: s.id, n }
  }).filter((x) => x.n > 0)
  // 'analytics' keywords are generic ("how many") — they only win alone.
  scored.sort((a, b) => b.n - a.n || (a.id === 'analytics' ? 1 : b.id === 'analytics' ? -1 : 0))
  return scored.map((x) => x.id)
}

/** The caller's tools that belong to this specialist (permission filtering already applied upstream). */
export function specialistTools(s: Specialist, callerTools: AgentTool[]): AgentTool[] {
  const allow = new Set<string>([...s.tools, ...GENERAL_TOOLS])
  return callerTools.filter((t) => allow.has(t.name))
}

/** Specialists that have at least one tool for this caller. */
export function availableSpecialists(callerTools: AgentTool[]): Specialist[] {
  const names = new Set(callerTools.map((t) => t.name))
  return SPECIALISTS.filter((s) => s.tools.some((t) => names.has(t)))
}

/**
 * Tools the MAIN loop offers this turn: the general tools, every tool of the
 * top routed specialists, and any tool used in recent history. Everything
 * else stays reachable through delegate_to_specialist. With no intent match,
 * all tools are offered (small tool sets / ambiguous asks).
 */
export function routedTools(callerTools: AgentTool[], userText: string, recentToolNames: readonly string[] = [], maxSpecialists = 2): { tools: AgentTool[]; routed: SpecialistId[] } {
  const routed = routeIntent(userText).slice(0, maxSpecialists)
  if (!routed.length || callerTools.length <= 24) return { tools: callerTools, routed }
  const allow = new Set<string>([...GENERAL_TOOLS, ...recentToolNames])
  for (const id of routed) for (const t of specialistById(id)!.tools) allow.add(t)
  return { tools: callerTools.filter((t) => allow.has(t.name)), routed }
}
