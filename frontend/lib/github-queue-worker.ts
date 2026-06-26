/**
 * GitHub webhook scan queue worker (MongoDB native).
 *
 * Pulls one `pending` row at a time using an atomic `findOneAndUpdate`,
 * runs an AI code review over the head-commit diff, persists the result
 * to `ai_code_reviews`, and posts an inline review comment to GitHub when
 * a user-installed integration is available.
 *
 * The worker is intentionally tolerant: any failure marks the row `failed`
 * with the last error rather than throwing, so a `processGithubScanQueueBatch`
 * loop can keep draining the queue. Trigger the worker via
 *   POST /api/github/queue/run   (superadmin only).
 */
import { backendComplete } from '@/lib/ai/backend'
import { aiCodeReviews, newId, nowIso } from '@/lib/db/ai'
import {
  githubWebhookScanQueue,
  type GithubScanQueueDoc,
} from '@/lib/db/leaderboard'
import { integrations as integrationsCollection } from '@/lib/db/misc'

export type QueueProcessResult = {
  processed: boolean
  status?: 'completed' | 'failed' | 'skipped'
  message?: string
  scanId?: string | null
  itemId?: string
}

interface RepoCommitFiles {
  files?: Array<{ filename?: string; patch?: string; status?: string }>
  commit?: { message?: string; author?: { name?: string } }
}

const GITHUB_API = 'https://api.github.com'
const MAX_PATCH_BYTES = 12_000

async function fetchCommitFiles(
  repo: string,
  sha: string,
  token: string | null,
): Promise<RepoCommitFiles | null> {
  const url = `${GITHUB_API}/repos/${repo}/commits/${sha}`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'User-Agent': 'codespectra-bot',
    },
  })
  if (!res.ok) return null
  return (await res.json()) as RepoCommitFiles
}

function buildPrompt(repo: string, files: RepoCommitFiles): string {
  const lines = [
    `Repository: ${repo}`,
    `Commit message: ${files.commit?.message?.slice(0, 200) || ''}`,
    '',
    'Below is the unified diff (truncated where necessary). Provide a concise',
    'code review: 3 strengths and 3 concrete improvement suggestions. Return',
    'plain markdown – no preamble.',
    '',
  ]
  let used = 0
  for (const f of files.files ?? []) {
    if (!f.patch) continue
    const header = `### ${f.filename}\n\`\`\`diff\n`
    const footer = '\n```\n'
    const remaining = MAX_PATCH_BYTES - used
    if (remaining <= 200) break
    const slice = f.patch.length > remaining ? f.patch.slice(0, remaining) : f.patch
    lines.push(header + slice + footer)
    used += slice.length + header.length + footer.length
  }
  return lines.join('\n')
}

/**
 * Atomically claim the next pending row.
 */
async function claimNext(): Promise<GithubScanQueueDoc | null> {
  const queue = await githubWebhookScanQueue()
  const res = await queue.findOneAndUpdate(
    { status: 'pending' },
    {
      $set: { status: 'running', locked_at: nowIso(), updated_at: nowIso() },
      $inc: { attempts: 1 },
    },
    { sort: { created_at: 1 }, returnDocument: 'after' },
  )
  // Driver typing: `findOneAndUpdate` returns the doc directly in v6+.
  if (!res) return null
  if ('value' in res) return (res as { value: GithubScanQueueDoc | null }).value
  return res as GithubScanQueueDoc
}

async function markStatus(
  itemId: string,
  status: GithubScanQueueDoc['status'],
  extra: Partial<GithubScanQueueDoc> = {},
) {
  const queue = await githubWebhookScanQueue()
  await queue.updateOne(
    { id: itemId },
    { $set: { status, updated_at: nowIso(), ...extra } },
  )
}

/**
 * Resolve a GitHub access token for the repository owner (if the user has
 * connected an integration). Returns `null` for anonymous webhook events.
 */
async function tokenForOwner(ownerLogin: string | null): Promise<string | null> {
  if (!ownerLogin) return null
  try {
    const col = await integrationsCollection()
    const row = await col.findOne({ provider: 'github', github_login: ownerLogin })
    const t = (row?.access_token as string | undefined) || null
    return t
  } catch {
    return null
  }
}

export async function processGithubScanQueueItem(): Promise<QueueProcessResult> {
  const item = await claimNext()
  if (!item) return { processed: false, message: 'queue empty' }

  try {
    const token = await tokenForOwner(item.owner_login)
    const files = await fetchCommitFiles(item.repository_full_name, item.head_commit_sha, token)
    if (!files || !files.files?.length) {
      await markStatus(item.id, 'skipped', { last_error: 'No files in commit' })
      return { processed: true, status: 'skipped', itemId: item.id, message: 'no files' }
    }

    const prompt = buildPrompt(item.repository_full_name, files)
    const ai = await backendComplete({
      sessionId: `gh-${item.id}`,
      systemMessage:
        'You are a senior staff engineer doing a tight, no-nonsense PR review. Be specific. Cite filenames and line ranges when helpful.',
      userMessage: prompt,
      modelRole: 'reasoning',
    })

    const reviewText = ai.text || ai.raw || 'Review generation failed.'

    const reviewsCol = await aiCodeReviews()
    const reviewId = newId()
    await reviewsCol.insertOne({
      id: reviewId,
      user_id: 'github-webhook',
      language: 'multi',
      result: {
        source: 'github_webhook',
        repository: item.repository_full_name,
        ref: item.ref,
        head_sha: item.head_commit_sha,
        review_markdown: reviewText,
      },
      created_at: nowIso(),
    })

    await markStatus(item.id, 'completed', { scan_id: reviewId, last_error: null })
    return { processed: true, status: 'completed', itemId: item.id, scanId: reviewId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await markStatus(item.id, 'failed', { last_error: msg })
    return { processed: true, status: 'failed', itemId: item.id, message: msg }
  }
}

export async function processGithubScanQueueBatch(
  max: number,
): Promise<QueueProcessResult[]> {
  const cap = Math.min(50, Math.max(1, max))
  const results: QueueProcessResult[] = []
  for (let i = 0; i < cap; i += 1) {
    const r = await processGithubScanQueueItem()
    if (!r.processed) break
    results.push(r)
  }
  return results
}
