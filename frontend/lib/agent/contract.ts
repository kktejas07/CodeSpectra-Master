/**
 * CodeSpectra admin agent — shared contract.
 *
 * Three parts are built against this file:
 *  - lib/rag/*        knowledge: ingestion, chunking, embeddings, scoped search
 *  - lib/agent/*      runtime: provider-agnostic tool-calling loop, proposals, audit
 *  - lib/agent/tools  actions: read tools + write tools that only *propose*
 *
 * Product rules (decided by the owner):
 *  - Admins only: role superadmin or tenant_admin (with a tenantId). Everything is
 *    scoped by the caller's session, never by anything the model or user text says.
 *  - Draft, then confirm: read tools run immediately. Any tool that saves, sends
 *    email, releases results, charges money or deletes returns a ProposedAction;
 *    nothing changes until a human confirms it in the UI.
 *  - Model: the platform's LLM settings (lib/ai/get-user-model resolveModel /
 *    readPlatformLlmConfig) with provider fallback; tool calling adapted per provider.
 *  - Retrieved text and tool output are DATA, never instructions (prompt-injection).
 */

// ─── Caller ──────────────────────────────────────────────────────────────────

export type AgentRole = 'superadmin' | 'tenant_admin'

export interface AgentCaller {
  userId: string
  role: AgentRole
  /** Required for tenant_admin; superadmin may act platform-wide or pick a tenant. */
  tenantId: string | null
  name?: string
  email?: string
}

// ─── Knowledge (RAG) ─────────────────────────────────────────────────────────

export type KnowledgeSourceType =
  | 'problem' // coding problems library
  | 'question' // question bank items (answers never indexed into searchable text for non-staff; staff only here)
  | 'course'
  | 'doc' // docs, FAQ, help, policies (public)
  | 'test' // assessment metadata (title, role, sections, settings) — tenant scoped
  | 'test_result_summary' // per-test aggregate results — tenant scoped
  | 'hackathon'
  | 'codeathon'
  | 'upload' // company uploads: JDs, rubrics, policies, PDFs — tenant scoped
  | 'resume' // candidate résumés — tenant scoped, staff only
  | 'attempt_summary' // candidate attempt + proctoring summary — tenant scoped, staff only
  | 'marketplace_product' // published marketplace products from approved sellers (public)
  | 'external_event' // events feed: published external hackathons / contests (public)
  | 'ats_job' // hiring pipeline job: title, JD, requirements, pipeline — tenant scoped
  | 'ats_application' // applicant: stage, match summary, résumé highlights (PII-minimised) — tenant scoped, staff only
  | 'news' // published tech news posts (/news, Signals) (public)
  | 'digest' // published daily digests (/digest/<date>) with their items (public)

export type KnowledgeVisibility = 'public' | 'platform_admin' | 'tenant'

export interface KnowledgeChunk {
  id: string
  source_type: KnowledgeSourceType
  source_id: string
  /** null = platform-wide; otherwise only this tenant's admins (and superadmin) can retrieve it. */
  tenant_id: string | null
  visibility: KnowledgeVisibility
  title: string
  /** Deep link to open the source in the app. */
  url: string | null
  chunk_index: number
  text: string
  embedding?: number[]
  embedding_model?: string
  content_hash: string
  metadata?: Record<string, unknown>
  updated_at: string
}

export interface KnowledgeSearchArgs {
  caller: AgentCaller
  query: string
  types?: KnowledgeSourceType[]
  limit?: number // default 8, max 20
  /** superadmin only: restrict to one tenant. */
  tenantId?: string | null
}

export interface KnowledgeHit {
  chunk_id: string
  source_type: KnowledgeSourceType
  source_id: string
  title: string
  url: string | null
  snippet: string
  score: number
}

// Implemented in lib/rag/search.ts:
//   export async function searchKnowledge(args: KnowledgeSearchArgs): Promise<KnowledgeHit[]>
// Implemented in lib/rag/ingest.ts:
//   export async function indexSource(type: KnowledgeSourceType, sourceId: string): Promise<{ chunks: number }>
//   export async function removeSource(type: KnowledgeSourceType, sourceId: string): Promise<void>

// ─── Tools ───────────────────────────────────────────────────────────────────

/** JSON Schema subset used to describe tool parameters to every provider. */
export interface JsonSchema {
  type: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array'
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  enum?: (string | number)[]
  minimum?: number
  maximum?: number
  maxLength?: number
  maxItems?: number
}

export type ToolKind = 'read' | 'write'

export type ToolRisk =
  | 'none' // read
  | 'create' // creates a draft/unpublished object
  | 'update'
  | 'send' // emails, notifications, invites
  | 'publish' // publish, release scores/results
  | 'delete'
  | 'money'

export interface ToolContext {
  caller: AgentCaller
  conversationId: string
  /** Abort if the client disconnects. */
  signal?: AbortSignal
}

export interface ToolResult {
  /** Short, model-facing JSON-serialisable summary (keep < ~6KB). */
  data: unknown
  /** Sources the answer relied on, shown as citations. */
  citations?: KnowledgeHit[]
}

export interface ProposedAction {
  id: string
  conversationId: string
  tool: string
  risk: Exclude<ToolRisk, 'none'>
  /** One-line human summary, sentence case: "Create test “Backend engineer, 2–4 years” with 12 questions". */
  title: string
  /** Structured preview the UI renders (fields, lists, counts). */
  preview: Record<string, unknown>
  /** Validated arguments that will be executed on confirm (re-validated + re-authorised then). */
  args: Record<string, unknown>
  status: 'pending' | 'confirmed' | 'executing' | 'done' | 'failed' | 'cancelled' | 'expired'
  created_by: string
  tenant_id: string | null
  created_at: string
  expires_at: string // 24h
  result?: { ok: boolean; message: string; link?: string; data?: unknown }
}

export interface AgentTool<A = Record<string, unknown>> {
  name: string // snake_case, e.g. "create_test"
  description: string // when to use it, what it does — model-facing
  kind: ToolKind
  risk: ToolRisk
  parameters: JsonSchema // top-level type 'object'
  /** Who may use it. tenant_admin tools must scope to caller.tenantId. */
  roles: AgentRole[]
  /** Validate + normalise raw args from the model; throw ToolInputError with a helpful message. */
  parse(raw: unknown, ctx: ToolContext): A | Promise<A>
  /** read tools: run and return data. */
  run?(args: A, ctx: ToolContext): Promise<ToolResult>
  /** write tools: build the preview (may read the DB; must not write). */
  propose?(args: A, ctx: ToolContext): Promise<{ title: string; preview: Record<string, unknown> }>
  /** write tools: perform the change after human confirmation. Must re-check permissions. */
  execute?(args: A, ctx: ToolContext): Promise<{ ok: boolean; message: string; link?: string; data?: unknown }>
}

export class ToolInputError extends Error {}
export class ToolPermissionError extends Error {}

// Implemented in lib/agent/tools/index.ts:
//   export function toolsFor(caller: AgentCaller): AgentTool[]
//   export function getTool(name: string): AgentTool | undefined

// ─── Conversation & streaming ────────────────────────────────────────────────

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; id: string; tool: string; args: unknown }
  | { type: 'tool_result'; id: string; tool: string; ok: boolean; summary: string; citations?: KnowledgeHit[] }
  | { type: 'proposal'; action: ProposedAction }
  | { type: 'error'; message: string }
  | { type: 'done'; usage?: { input_tokens?: number; output_tokens?: number; credits?: number } }

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: { id: string; tool: string; args: unknown }[]
  tool_call_id?: string
  created_at: string
}

// ─── Additions (appended after the first build) ─────────────────────────────

/**
 * ADDITION: interface merge onto ToolContext above. The confirm endpoint sets
 * `actionId` (the ProposedAction id) so execute() can key idempotency on it.
 * Undefined in read tools and propose().
 */
export interface ToolContext {
  actionId?: string
}

/**
 * ADDITION (agent loop v2): edit flow passes the stored args so a write tool
 * can keep its sealed AI draft when the generation inputs did not change (AGT-002).
 */
export interface ToolContext {
  priorArgs?: Record<string, unknown>
}

/** ADDITION (agent loop v2): proposals drafted together as one bundle, executed in order. */
export interface ProposedAction {
  bundle_id?: string
  bundle_index?: number
}

export interface ProposalBundle {
  id: string
  conversationId: string
  title: string
  summary?: string
  action_ids: string[]
  status: 'pending' | 'executing' | 'done' | 'failed' | 'partial' | 'cancelled' | 'expired'
  created_by: string
  tenant_id: string | null
  created_at: string
  expires_at: string
  /** Per step, filled while executing. */
  results?: { action_id: string; ok: boolean; message: string; status: ProposedAction['status'] }[]
  stopped_at?: number | null
}

/** ADDITION (RAG-011): how a hit was retrieved — 'keyword_only' when vector search was unavailable. */
export interface KnowledgeHit {
  retrieval?: 'hybrid' | 'keyword_only'
}
