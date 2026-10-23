/**
 * Apply or dismiss a loop finding (server only). The only place a loop's
 * proposal turns into a change, always on a platform admin's click (Admin →
 * Agent loops) or a confirmed copilot action. Each action calls the same
 * service the admin pages use; the claim is atomic so a double click applies
 * once; every decision is audited.
 */
import 'server-only'
import { claimFinding, getFinding, settleFinding } from './store'
import type { FindingDoc, Proposal } from './types'

export type DecideOutcome = { ok: true; finding: FindingDoc } | { ok: false; status: 404 | 409 | 422; error: string; finding?: FindingDoc }

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Run one proposal. Returns a short English result for the run log. Throws on failure. */
export async function executeProposal(p: Proposal, actorId: string): Promise<string> {
  const a = p.args
  switch (p.action) {
    case 'learn_unpublish':
    case 'learn_to_draft': {
      const { applyPostAction } = await import('@/lib/learn/posts')
      const r = await applyPostAction(str(a.post_id), 'unpublish', { actorId })
      if (r.error) throw new Error(r.error)
      if (p.action === 'learn_to_draft') {
        const back = await applyPostAction(str(a.post_id), 'reopen', { actorId })
        if (back.error) throw new Error(back.error)
        return 'Unpublished and moved back to drafts for fixing.'
      }
      return 'Unpublished.'
    }
    case 'learn_add_topic': {
      const { addTopic } = await import('@/lib/learn/store')
      const r = await addTopic({ title: a.title, category: a.category, level: a.level, tags: a.tags, enabled: true })
      if (r.error) throw new Error(r.error)
      return 'Added to the Learn topic list; the writer drafts it for review.'
    }
    case 'learn_translate': {
      const { translatePost } = await import('@/lib/learn/translate')
      const loc = str(a.locale)
      if (loc !== 'hi' && loc !== 'te') throw new Error('Unknown language.')
      const r = await translatePost(str(a.post_id), loc, actorId)
      if (r.error) throw new Error(r.error)
      return 'Translation drafted for review.'
    }
    case 'news_unpublish': {
      const [{ signalDrafts }, { blogPosts }, { revalidateContent }] = await Promise.all([import('@/lib/db/signal-drafts'), import('@/lib/db/blog-posts'), import('@/lib/cache/revalidate')])
      const col = await signalDrafts()
      const d = await col.findOne({ id: str(a.draft_id) }, { projection: { _id: 0, id: 1, blog_slug: 1 } })
      if (!d) throw new Error('News draft not found.')
      // Same as Admin → Signals → Unpublish: the article comes down, the draft returns to review.
      if (d.blog_slug) {
        await (await blogPosts()).deleteOne({ slug: d.blog_slug })
        await revalidateContent('news', d.blog_slug)
      }
      await col.updateOne({ id: d.id }, { $set: { status: 'pending', updated_at: new Date().toISOString() }, $unset: { blog_slug: '' } })
      return 'Unpublished; back in the news review queue.'
    }
    case 'question_deactivate': {
      const { questionBank } = await import('@/lib/question-bank')
      const r = await (await questionBank()).updateOne({ id: str(a.question_id) } as never, { $set: { is_active: false, updatedAt: new Date().toISOString() } })
      if (!r.matchedCount) throw new Error('Question not found.')
      return 'Question switched off (no longer drawn into tests).'
    }
    case 'forum_hide':
    case 'forum_restore': {
      const type = a.target_type === 'reply' ? 'reply' : a.target_type === 'thread' ? 'thread' : null
      if (!type) throw new Error('Unknown post type.')
      const { systemSetPostStatus } = await import('@/lib/community/service')
      await systemSetPostStatus(type, str(a.target_id), p.action === 'forum_hide' ? 'hidden' : 'visible', p.action === 'forum_hide' ? ['agent:spam'] : [])
      return p.action === 'forum_hide' ? 'Post hidden.' : 'Post restored.'
    }
  }
}

export async function decideFinding(id: string, decision: 'apply' | 'dismiss', actor: { id: string }): Promise<DecideOutcome> {
  const f = await getFinding(id)
  if (!f) return { ok: false, status: 404, error: 'not_found' }
  const { auditAdmin } = await import('@/lib/admin-audit')
  // Applied findings with a reverse action (auto-hidden spam → restore) can still be applied once.
  const reversible = f.status === 'applied' && f.proposal?.action === 'forum_restore'
  if (decision === 'dismiss') {
    if (f.status !== 'open' && f.status !== 'failed') return { ok: false, status: 409, error: 'already_decided', finding: f }
    const done = await settleFinding(id, 'dismissed', actor.id, null)
    await auditAdmin(actor, 'agent_loop.dismiss', 'agent_loop_finding', id, `${f.loop}:${f.kind}`).catch(() => undefined)
    return { ok: true, finding: done! }
  }
  if (!f.proposal) return { ok: false, status: 422, error: 'no_proposal', finding: f }
  if (reversible) {
    const { findingsCol } = await import('./store')
    await (await findingsCol()).updateOne({ id, status: 'applied' }, { $set: { status: 'open' } })
  } else if (f.status === 'failed') {
    const { findingsCol } = await import('./store')
    await (await findingsCol()).updateOne({ id, status: 'failed' }, { $set: { status: 'open' } })
  }
  const claimed = await claimFinding(id)
  if (!claimed) return { ok: false, status: 409, error: 'already_decided', finding: f }
  try {
    const message = await executeProposal(f.proposal, actor.id)
    const done = await settleFinding(id, 'applied', actor.id, { ok: true, message })
    // A restore leaves nothing to undo.
    if (reversible) {
      const { findingsCol } = await import('./store')
      await (await findingsCol()).updateOne({ id }, { $set: { proposal: null } })
    }
    await auditAdmin(actor, `agent_loop.${f.proposal.action}`, 'agent_loop_finding', id, `${f.target.type}:${f.target.id}`, 'warning').catch(() => undefined)
    return { ok: true, finding: { ...done!, ...(reversible ? { proposal: null } : {}) } as FindingDoc }
  } catch (e) {
    const done = await settleFinding(id, 'failed', actor.id, { ok: false, message: ((e as Error)?.message || 'failed').slice(0, 300) })
    return { ok: false, status: 422, error: 'apply_failed', finding: done ?? f }
  }
}
