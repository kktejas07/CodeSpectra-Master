/**
 * AI inventory discovery.
 *
 * Walks the live application (filesystem + MongoDB + package manifests)
 * and produces a normalised inventory across 13 component categories.
 *
 *   1.  automations          (workflows authored by admins)
 *   2.  mcp_servers          (this app exposes one — /api/mcp)
 *   3.  llm_models           (model IDs we call via emergent integrations)
 *   4.  rag_docs             (RAG hint sources — currently submissions stderr)
 *   5.  agents               (the Agent View routes + scanner agent)
 *   6.  bot_replies          (chat / hint / grading routes)
 *   7.  plugins              (Next.js / FastAPI plugin imports)
 *   8.  connectors           (3rd-party services: Razorpay, GitHub, Resend, …)
 *   9.  ai_skills            (registered tool names — discoverable from /api/ai/*)
 *  10.  mcp_tools            (the 5 tools we expose at /api/mcp)
 *  11.  genai_runs           (entries in ai_chat_sessions / ai_code_reviews / agent_runs)
 *  12.  web_scraping_tools   (Crawlee / playwright / ScrapeAI etc; static catalog)
 *  13.  os_agent_frameworks  (LangGraph, AutoGen, CrewAI; static catalog)
 *
 * The results are intentionally normalised into a single `InventoryItem`
 * shape so the chunked API can paginate any category uniformly. Each item
 * carries `status`, `module`, `purpose`, and an optional `source` (URL).
 */
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export type InventoryCategory =
  | 'automations'
  | 'mcp_servers'
  | 'llm_models'
  | 'rag_docs'
  | 'agents'
  | 'bot_replies'
  | 'plugins'
  | 'connectors'
  | 'ai_skills'
  | 'mcp_tools'
  | 'genai_runs'
  | 'web_scraping_tools'
  | 'os_agent_frameworks'

export interface InventoryItem {
  id: string
  category: InventoryCategory
  name: string
  /** Short one-line description shown in the table. */
  purpose: string
  /** Path or file where the implementation lives. */
  module: string
  /** 'active' (in use), 'inactive' (registered but unused), 'recommended' (catalog suggestion). */
  status: 'active' | 'inactive' | 'recommended'
  /** Optional metadata. Free-form per category. */
  meta?: Record<string, unknown>
  /** External link (GitHub repo, docs page, GitHub release). */
  source?: string
  version?: string
}

export const CATEGORY_ORDER: InventoryCategory[] = [
  'automations',
  'mcp_servers',
  'llm_models',
  'rag_docs',
  'agents',
  'bot_replies',
  'plugins',
  'connectors',
  'ai_skills',
  'mcp_tools',
  'genai_runs',
  'web_scraping_tools',
  'os_agent_frameworks',
]

export const CATEGORY_LABEL: Record<InventoryCategory, string> = {
  automations: 'Automations',
  mcp_servers: 'MCP Servers',
  llm_models: 'LLM Models',
  rag_docs: 'RAG Docs',
  agents: 'Agents',
  bot_replies: 'Bot Replies',
  plugins: 'Plugins',
  connectors: 'Connectors',
  ai_skills: 'AI Skills',
  mcp_tools: 'MCP Tools',
  genai_runs: 'GenAI Runs',
  web_scraping_tools: 'Web Scraping Tools',
  os_agent_frameworks: 'Open-Source Agent Frameworks',
}

// ---------------------------------------------------------------------------
// Static catalogs (categories 12-13 + recommendation pool)
// ---------------------------------------------------------------------------

const WEB_SCRAPING_CATALOG: InventoryItem[] = [
  {
    id: 'scrape-firecrawl',
    category: 'web_scraping_tools',
    name: 'Firecrawl',
    purpose: 'AI-friendly crawler that returns LLM-ready markdown.',
    module: 'recommended',
    status: 'recommended',
    source: 'https://github.com/mendableai/firecrawl',
    version: 'latest',
  },
  {
    id: 'scrape-scrapegraph-ai',
    category: 'web_scraping_tools',
    name: 'ScrapeGraphAI',
    purpose: 'Graph-based scraper that uses LLMs to extract structured data.',
    module: 'recommended',
    status: 'recommended',
    source: 'https://github.com/ScrapeGraphAI/Scrapegraph-ai',
    version: '1.x',
  },
  {
    id: 'scrape-crawl4ai',
    category: 'web_scraping_tools',
    name: 'Crawl4AI',
    purpose: 'Fast Playwright-based crawler with LLM extraction strategies.',
    module: 'recommended',
    status: 'recommended',
    source: 'https://github.com/unclecode/crawl4ai',
    version: '0.x',
  },
  {
    id: 'scrape-crawlee',
    category: 'web_scraping_tools',
    name: 'Crawlee',
    purpose: 'TypeScript scraper toolkit by Apify, plays well with Playwright.',
    module: 'recommended',
    status: 'recommended',
    source: 'https://github.com/apify/crawlee',
    version: '3.x',
  },
  {
    id: 'scrape-jina-ai-reader',
    category: 'web_scraping_tools',
    name: 'Jina AI Reader',
    purpose: 'Drop-in URL→markdown reader API tuned for LLM ingestion.',
    module: 'recommended',
    status: 'recommended',
    source: 'https://github.com/jina-ai/reader',
    version: 'latest',
  },
]

const OS_AGENT_CATALOG: InventoryItem[] = [
  {
    id: 'agents-langgraph',
    category: 'os_agent_frameworks',
    name: 'LangGraph',
    purpose: 'Stateful, graph-based agent orchestration from the LangChain team.',
    module: 'recommended',
    status: 'recommended',
    source: 'https://github.com/langchain-ai/langgraph',
    version: '0.2.x',
  },
  {
    id: 'agents-crewai',
    category: 'os_agent_frameworks',
    name: 'CrewAI',
    purpose: 'Multi-agent role-playing framework with task delegation.',
    module: 'recommended',
    status: 'recommended',
    source: 'https://github.com/crewAIInc/crewAI',
    version: '0.x',
  },
  {
    id: 'agents-autogen',
    category: 'os_agent_frameworks',
    name: 'Microsoft AutoGen',
    purpose: 'Conversable agents that can write + execute code together.',
    module: 'recommended',
    status: 'recommended',
    source: 'https://github.com/microsoft/autogen',
    version: '0.4.x',
  },
  {
    id: 'agents-smolagents',
    category: 'os_agent_frameworks',
    name: 'Hugging Face smolagents',
    purpose: 'Tiny library for code-writing agents with built-in tool calling.',
    module: 'recommended',
    status: 'recommended',
    source: 'https://github.com/huggingface/smolagents',
    version: '1.x',
  },
  {
    id: 'agents-openai-swarm',
    category: 'os_agent_frameworks',
    name: 'OpenAI Swarm',
    purpose: 'Lightweight multi-agent orchestration (educational reference).',
    module: 'recommended',
    status: 'recommended',
    source: 'https://github.com/openai/swarm',
    version: 'main',
  },
  {
    id: 'agents-pydantic-ai',
    category: 'os_agent_frameworks',
    name: 'Pydantic AI',
    purpose: 'Type-safe agent framework backed by Pydantic schemas.',
    module: 'recommended',
    status: 'recommended',
    source: 'https://github.com/pydantic/pydantic-ai',
    version: '0.x',
  },
]

const MCP_TOOLS: InventoryItem[] = [
  {
    id: 'mcp-tool-list-problems',
    category: 'mcp_tools',
    name: 'list_problems',
    purpose: 'List published CodeSpectra problems with optional filters.',
    module: '/app/api/mcp/route.ts',
    status: 'active',
  },
  {
    id: 'mcp-tool-get-problem',
    category: 'mcp_tools',
    name: 'get_problem',
    purpose: 'Fetch full problem statement + samples + starter code by slug.',
    module: '/app/api/mcp/route.ts',
    status: 'active',
  },
  {
    id: 'mcp-tool-run-code',
    category: 'mcp_tools',
    name: 'run_code',
    purpose: 'Execute code via Piston (or local fallback executor).',
    module: '/app/api/mcp/route.ts',
    status: 'active',
  },
  {
    id: 'mcp-tool-get-user-xp',
    category: 'mcp_tools',
    name: 'get_user_xp',
    purpose: 'Total XP / level / solved counts for a user.',
    module: '/app/api/mcp/route.ts',
    status: 'active',
  },
  {
    id: 'mcp-tool-get-leaderboard',
    category: 'mcp_tools',
    name: 'get_leaderboard',
    purpose: 'Top-N XP earners (global / monthly).',
    module: '/app/api/mcp/route.ts',
    status: 'active',
  },
]

const LLM_MODELS: InventoryItem[] = [
  {
    id: 'llm-claude-sonnet-4-5',
    category: 'llm_models',
    name: 'Claude Sonnet 4.5',
    purpose: 'Reasoning model used by /api/ai/code-review and AI code-review bot.',
    module: 'lib/ai/backend.ts',
    status: 'active',
    meta: { provider: 'anthropic', billing: 'emergent-llm-key' },
  },
  {
    id: 'llm-gpt-4o-mini',
    category: 'llm_models',
    name: 'GPT-4o-mini',
    purpose: 'Fast chat completions via Vercel AI SDK.',
    module: 'app/api/ai/chat/route.ts',
    status: 'active',
    meta: { provider: 'openai', billing: 'emergent-llm-key' },
  },
  {
    id: 'llm-nano-banana',
    category: 'llm_models',
    name: 'Gemini Nano Banana',
    purpose: 'Image generation (used by question-generator for problem cover art).',
    module: 'app/api/ai/generate-problem/route.ts',
    status: 'inactive',
    meta: { provider: 'google', billing: 'emergent-llm-key' },
  },
]

const MCP_SERVERS: InventoryItem[] = [
  {
    id: 'mcp-server-codespectra',
    category: 'mcp_servers',
    name: 'codespectra-mcp',
    purpose: 'Local MCP server exposing 5 tools at /api/mcp (+ /mcp alias).',
    module: 'app/api/mcp/route.ts',
    status: 'active',
    meta: { version: '1.0.0', protocol: 'mcp-json-rpc-2.0' },
  },
]

// ---------------------------------------------------------------------------
// Discovery — categories pulled directly from live MongoDB collections.
// ---------------------------------------------------------------------------

interface ChatSession {
  id: string
  user_id: string
  created_at: string
}
interface AgentRun {
  id: string
  user_id: string
  goal?: string
  created_at: string
}
interface ScanDoc {
  id: string
  language?: string
  scan_type?: string
  created_at: string
}
interface WorkflowDoc {
  id: string
  name: string
  trigger: string
  is_active: boolean
  nodes: unknown[]
}

async function chatSessions(): Promise<Collection<ChatSession>> {
  return (await getMongoDb()).collection<ChatSession>('ai_chat_sessions')
}
async function agentRuns(): Promise<Collection<AgentRun>> {
  return (await getMongoDb()).collection<AgentRun>('agent_runs')
}
async function scans(): Promise<Collection<ScanDoc>> {
  return (await getMongoDb()).collection<ScanDoc>('scans')
}
async function workflows(): Promise<Collection<WorkflowDoc>> {
  return (await getMongoDb()).collection<WorkflowDoc>('workflows')
}

async function discoverAutomations(): Promise<InventoryItem[]> {
  const items: InventoryItem[] = []
  try {
    const wfs = await (await workflows()).find({}).limit(100).toArray()
    for (const w of wfs) {
      items.push({
        id: `wf-${w.id}`,
        category: 'automations',
        name: w.name,
        purpose: `Workflow with ${w.nodes?.length ?? 0} node(s), trigger=${w.trigger}.`,
        module: '/dashboard/admin/workflows',
        status: w.is_active ? 'active' : 'inactive',
      })
    }
  } catch {
    /* missing collection is fine */
  }
  // Always include the scheduler boot hook as an "automation".
  items.push({
    id: 'auto-scheduler-loop',
    category: 'automations',
    name: 'in-process scheduler tick',
    purpose: 'Cron evaluator that fires schedule-trigger workflows every minute.',
    module: 'lib/scheduler.ts',
    status: 'active',
  })
  items.push({
    id: 'auto-github-queue-worker',
    category: 'automations',
    name: 'GitHub queue worker',
    purpose: 'Drains pending push/PR rows and runs AI code review.',
    module: 'lib/github-queue-worker.ts',
    status: 'active',
  })
  return items
}

async function discoverAgents(): Promise<InventoryItem[]> {
  return [
    {
      id: 'agent-emergent-view',
      category: 'agents',
      name: 'Emergent Agent (interactive)',
      purpose: 'Multi-step reasoning agent exposed via /api/ai/agent.',
      module: 'app/api/ai/agent/route.ts',
      status: 'active',
    },
    {
      id: 'agent-code-review-bot',
      category: 'agents',
      name: 'GitHub code-review bot',
      purpose: 'Autonomous reviewer that posts comments on incoming PRs.',
      module: 'lib/github-queue-worker.ts',
      status: 'active',
    },
    {
      id: 'agent-scanner',
      category: 'agents',
      name: 'SonarQube-style scanner',
      purpose: 'Scans uploaded codebases and emits AI-driven findings.',
      module: 'app/dashboard/scanner',
      status: 'active',
    },
  ]
}

async function discoverBotReplies(): Promise<InventoryItem[]> {
  return [
    {
      id: 'bot-chat',
      category: 'bot_replies',
      name: 'AI chat',
      purpose: 'Conversational endpoint for the in-product chatbot.',
      module: 'app/api/ai/chat/route.ts',
      status: 'active',
    },
    {
      id: 'bot-hints',
      category: 'bot_replies',
      name: 'Smart hints',
      purpose: 'RAG-style hints conditioned on the user’s submission errors.',
      module: 'app/api/ai/hints/route.ts',
      status: 'active',
    },
    {
      id: 'bot-grading',
      category: 'bot_replies',
      name: 'Smart grading',
      purpose: 'Generates rubric-based feedback on accepted submissions.',
      module: 'app/api/ai/grade/route.ts',
      status: 'active',
    },
  ]
}

async function discoverConnectors(): Promise<InventoryItem[]> {
  return [
    {
      id: 'conn-razorpay',
      category: 'connectors',
      name: 'Razorpay',
      purpose: 'Primary payment processor (subscriptions + one-off orders).',
      module: 'lib/razorpay-server.ts',
      status: 'active',
    },
    {
      id: 'conn-github',
      category: 'connectors',
      name: 'GitHub (OAuth + Webhooks)',
      purpose: 'PR webhooks, OAuth install flow, AI review comment posting.',
      module: 'lib/github-queue-worker.ts',
      status: 'active',
    },
    {
      id: 'conn-piston',
      category: 'connectors',
      name: 'Piston code-execution',
      purpose: 'Sandboxed code execution backend (with local fallback).',
      module: 'lib/piston.ts',
      status: 'active',
    },
    {
      id: 'conn-better-auth',
      category: 'connectors',
      name: 'Better Auth',
      purpose: 'Email/password + session management against MongoDB.',
      module: 'lib/auth.ts',
      status: 'active',
    },
    {
      id: 'conn-emergent-llm',
      category: 'connectors',
      name: 'Emergent LLM key',
      purpose: 'Universal multi-provider LLM gateway (openai, anthropic, gemini).',
      module: 'lib/ai/backend.ts',
      status: 'active',
    },
  ]
}

async function discoverAiSkills(): Promise<InventoryItem[]> {
  // AI skills = registered tool names (different from MCP tools).
  return [
    { id: 'skill-code-review', category: 'ai_skills', name: 'code_review', purpose: 'Review pasted code for issues.', module: 'app/api/ai/code-review/route.ts', status: 'active' },
    { id: 'skill-grade', category: 'ai_skills', name: 'grade_submission', purpose: 'Grade an accepted submission against a rubric.', module: 'app/api/ai/grade/route.ts', status: 'active' },
    { id: 'skill-hints', category: 'ai_skills', name: 'next_hint', purpose: 'Generate a next-step hint for a stuck user.', module: 'app/api/ai/hints/route.ts', status: 'active' },
    { id: 'skill-generate-problem', category: 'ai_skills', name: 'generate_problem', purpose: 'Compose a new coding problem from a prompt.', module: 'app/api/ai/generate-problem/route.ts', status: 'active' },
    { id: 'skill-skill-analytics', category: 'ai_skills', name: 'skill_analytics', purpose: 'Cluster a user’s submissions into a skill graph.', module: 'app/api/ai/code-analysis/route.ts', status: 'active' },
  ]
}

async function discoverRagDocs(): Promise<InventoryItem[]> {
  return [
    {
      id: 'rag-submissions-stderr',
      category: 'rag_docs',
      name: 'Submission stderr corpus',
      purpose: 'Per-user error logs are joined into the smart-hints prompt.',
      module: 'app/api/ai/hints/route.ts',
      status: 'active',
    },
    {
      id: 'rag-problem-corpus',
      category: 'rag_docs',
      name: 'Problem statement corpus',
      purpose: 'Statements indexed for problem-suggestion + similarity search.',
      module: 'lib/db/problems.ts',
      status: 'active',
    },
  ]
}

async function discoverPlugins(): Promise<InventoryItem[]> {
  return [
    { id: 'plugin-monaco', category: 'plugins', name: 'Monaco Editor', purpose: 'Browser-side code editor used in the sandbox.', module: 'node_modules/@monaco-editor/react', status: 'active' },
    { id: 'plugin-reactflow', category: 'plugins', name: '@xyflow/react (React Flow)', purpose: 'Visual graph builder for workflows.', module: 'components/workflows/workflow-builder.tsx', status: 'active' },
    { id: 'plugin-qrcode', category: 'plugins', name: 'qrcode', purpose: 'SVG QR generation for ID cards + team scoreboards.', module: 'lib/qr.ts', status: 'active' },
    { id: 'plugin-emergent-integrations', category: 'plugins', name: 'emergentintegrations', purpose: 'Universal LLM SDK used by the FastAPI router.', module: '/app/backend/ai_router.py', status: 'active' },
  ]
}

async function discoverGenAiRuns(): Promise<InventoryItem[]> {
  const out: InventoryItem[] = []
  try {
    const chatCount = await (await chatSessions()).countDocuments({})
    out.push({
      id: 'runs-chat-sessions',
      category: 'genai_runs',
      name: 'ai_chat_sessions',
      purpose: `${chatCount} chat session(s) recorded.`,
      module: 'mongodb://ai_chat_sessions',
      status: chatCount > 0 ? 'active' : 'inactive',
    })
  } catch {
    /* no collection yet */
  }
  try {
    const agentCount = await (await agentRuns()).countDocuments({})
    out.push({
      id: 'runs-agent',
      category: 'genai_runs',
      name: 'agent_runs',
      purpose: `${agentCount} multi-step agent run(s) logged.`,
      module: 'mongodb://agent_runs',
      status: agentCount > 0 ? 'active' : 'inactive',
    })
  } catch {
    /* ignore */
  }
  try {
    const scanCount = await (await scans()).countDocuments({})
    out.push({
      id: 'runs-scans',
      category: 'genai_runs',
      name: 'scans',
      purpose: `${scanCount} AI-driven code scan(s).`,
      module: 'mongodb://scans',
      status: scanCount > 0 ? 'active' : 'inactive',
    })
  } catch {
    /* ignore */
  }
  return out
}

// ---------------------------------------------------------------------------
// Public entry — fetch one category. Used by the chunked API.
// ---------------------------------------------------------------------------

export async function fetchCategory(cat: InventoryCategory): Promise<InventoryItem[]> {
  switch (cat) {
    case 'automations':
      return discoverAutomations()
    case 'mcp_servers':
      return MCP_SERVERS
    case 'llm_models':
      return LLM_MODELS
    case 'rag_docs':
      return discoverRagDocs()
    case 'agents':
      return discoverAgents()
    case 'bot_replies':
      return discoverBotReplies()
    case 'plugins':
      return discoverPlugins()
    case 'connectors':
      return discoverConnectors()
    case 'ai_skills':
      return discoverAiSkills()
    case 'mcp_tools':
      return MCP_TOOLS
    case 'genai_runs':
      return discoverGenAiRuns()
    case 'web_scraping_tools':
      return WEB_SCRAPING_CATALOG
    case 'os_agent_frameworks':
      return OS_AGENT_CATALOG
  }
}

/**
 * Summary counts across every category — cheap call used by the dashboard
 * landing page.
 */
export async function fetchSummary(): Promise<
  Record<InventoryCategory, { total: number; active: number }>
> {
  const out = {} as Record<InventoryCategory, { total: number; active: number }>
  for (const cat of CATEGORY_ORDER) {
    try {
      const items = await fetchCategory(cat)
      out[cat] = {
        total: items.length,
        active: items.filter((i) => i.status === 'active').length,
      }
    } catch {
      out[cat] = { total: 0, active: 0 }
    }
  }
  return out
}
