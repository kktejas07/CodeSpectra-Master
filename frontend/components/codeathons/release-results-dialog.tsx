'use client'

/**
 * Staff release step for a codeathon: review the final leaderboard, choose
 * who gets a certificate, then release. Talks to /api/codeathons/[id]/release
 * (GET preview, POST release / re-issue). The server enforces who may do this.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Award, CheckCircle2, ExternalLink, Loader2, RefreshCw, Trophy } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { NumberField } from '@/components/ui/number-field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { EmptyState } from '@/components/ui/empty-state'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useConfirm } from '@/lib/confirm-context'
import { formatDateTime } from '@/lib/format-datetime'
import {
  certificateKindFor,
  sanitizeCertificatePolicy,
  type CertificatePolicy,
  type CertificateAudience,
} from '@/lib/codeathon-results'

interface StandingRow {
  entrant_id: string
  kind: 'user' | 'team'
  name: string
  rank: number | null
  tied: boolean
  total_score: number
  problems_solved: number
  member_ids: string[]
}

interface Preview {
  released: boolean
  released_at?: string | null
  ended?: boolean
  unscored?: number
  certificate_policy: CertificatePolicy
  standings: StandingRow[]
  ranked_count: number
  participant_count: number
  warnings: string[]
  snapshot_missing?: boolean
}

const SHOWN_ROWS = 100

export function ReleaseResultsDialog({
  codeathon,
  onOpenChange,
  onReleased,
}: {
  codeathon: { id: string; title: string } | null
  onOpenChange: (open: boolean) => void
  onReleased?: () => void
}) {
  const addToast = useToast()
  const confirm = useConfirm()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [policy, setPolicy] = useState<CertificatePolicy>({ audience: 'all', top_n: 3 })
  const [busy, setBusy] = useState(false)

  const id = codeathon?.id || ''

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/codeathons/${encodeURIComponent(id)}/release`, { cache: 'no-store', credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j?.error === 'string' ? j.error : 'Could not load the results preview')
      setPreview(j as Preview)
      setPolicy(sanitizeCertificatePolicy((j as Preview).certificate_policy))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the results preview')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    setPreview(null)
    if (id) void load()
  }, [id, load])

  const post = async (body: Record<string, unknown>) => {
    const res = await csrfFetch(`/api/codeathons/${encodeURIComponent(id)}/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    const j = await res.json().catch(() => ({}))
    return { res, j: j as Record<string, unknown> }
  }

  const release = async () => {
    if (!preview || preview.released) return
    const warnings = preview.warnings || []
    const certLine = policy.audience === 'none'
      ? 'No certificates will be issued.'
      : policy.audience === 'top_n'
        ? `Places 1–${policy.top_n} get a ranked certificate; nobody else gets one.`
        : `Places 1–${policy.top_n} get a ranked certificate; everyone else who submitted gets a participation certificate.`
    const ok = await confirm({
      title: 'Release results?',
      description: [
        'Scores are frozen, XP is awarded, participants are notified and the public results page goes live. This cannot be undone.',
        certLine,
        ...warnings,
      ].join(' '),
      confirmText: 'Release results',
      destructive: warnings.length > 0,
    })
    if (!ok) return
    setBusy(true)
    try {
      const { res, j } = await post({ force: true, certificate_policy: policy })
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Could not release results')
      addToast({
        type: 'success',
        title: 'Results released',
        message: `${Number(j.certificates_issued) || 0} certificates issued, ${Number(j.notified) || 0} participants notified.`,
      })
      onReleased?.()
      await load()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Could not release results' })
    } finally {
      setBusy(false)
    }
  }

  const reissue = async () => {
    setBusy(true)
    try {
      const { res, j } = await post({ reissue: true })
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Could not re-issue certificates')
      addToast({
        type: 'success',
        title: 'Certificates checked',
        message: `${Number(j.certificates_issued) || 0} new, ${Number(j.certificates_existing) || 0} already issued.`,
      })
      await load()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof Error ? e.message : 'Could not re-issue certificates' })
    } finally {
      setBusy(false)
    }
  }

  const released = !!preview?.released
  const rows = preview?.standings || []

  return (
    <Dialog open={!!codeathon} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" aria-hidden="true" />
            Results for {codeathon?.title || 'codeathon'}
          </DialogTitle>
          <DialogDescription>
            {released
              ? 'These results are public and final.'
              : 'Check the final leaderboard, choose who gets a certificate, then release.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading && !preview ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Loading results…</div>
          ) : loadError ? (
            <EmptyState compact illustration="error" title="Couldn't load results" description={loadError} actionLabel="Try again" onAction={() => void load()} />
          ) : preview ? (
            <>
              {released ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-700 dark:text-green-400" aria-hidden="true" />
                  <span>Released {preview.released_at ? formatDateTime(preview.released_at) : ''}</span>
                  <span className="text-muted-foreground tabular-nums">· {preview.ranked_count} ranked · {preview.participant_count} took part</span>
                </div>
              ) : preview.warnings.length > 0 ? (
                <div role="alert" className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                  {preview.warnings.map((w) => (
                    <p key={w} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />{w}</p>
                  ))}
                </div>
              ) : null}

              <fieldset className="space-y-3 rounded-2xl border border-border p-4" disabled={released || busy}>
                <legend className="px-1 text-sm font-semibold flex items-center gap-1.5"><Award className="h-4 w-4 text-primary" aria-hidden="true" /> Certificates</legend>
                <RadioGroup
                  value={policy.audience}
                  onValueChange={(v) => setPolicy((p) => ({ ...p, audience: v as CertificateAudience }))}
                  className="gap-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="all" id="cert-all" />
                    <Label htmlFor="cert-all" className="font-normal">Everyone who submitted (ranked wording for the top places)</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="top_n" id="cert-top" />
                    <Label htmlFor="cert-top" className="font-normal">Only the top places</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="none" id="cert-none" />
                    <Label htmlFor="cert-none" className="font-normal">No certificates</Label>
                  </div>
                </RadioGroup>
                {policy.audience !== 'none' && (
                  <NumberField
                    label="Ranked certificates for places 1 to"
                    value={policy.top_n}
                    min={1}
                    max={100}
                    onChange={(n) => setPolicy((p) => ({ ...p, top_n: n }))}
                    disabled={released || busy}
                    className="max-w-xs"
                  />
                )}
                <p className="text-xs text-muted-foreground">Certificates can be checked by anyone on the verify page. Emails are never shown.</p>
              </fieldset>

              {rows.length === 0 ? (
                <EmptyState compact illustration="hackathon" title="No submissions yet" description="Results appear here once participants submit solutions." />
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-border">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Final leaderboard</caption>
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-medium">Rank</th>
                        <th scope="col" className="px-3 py-2 font-medium">{rows[0]?.kind === 'team' ? 'Team' : 'Participant'}</th>
                        <th scope="col" className="px-3 py-2 font-medium text-right">Points</th>
                        <th scope="col" className="px-3 py-2 font-medium text-right">Solved</th>
                        <th scope="col" className="px-3 py-2 font-medium">Certificate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, SHOWN_ROWS).map((r) => {
                        const kind = certificateKindFor(r, policy)
                        return (
                          <tr key={r.entrant_id} className="border-t border-border">
                            <td className="px-3 py-2 tabular-nums">{r.rank !== null ? `#${r.rank}${r.tied ? ' (tied)' : ''}` : '—'}</td>
                            <td className="px-3 py-2">{r.name}{r.kind === 'team' ? <span className="text-xs text-muted-foreground"> · {r.member_ids.length} members</span> : null}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.total_score}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.problems_solved}</td>
                            <td className="px-3 py-2">
                              {kind === 'rank' ? <Badge variant="default">Ranked</Badge> : kind === 'participation' ? <Badge variant="secondary">Participation</Badge> : <span className="text-xs text-muted-foreground">None</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {rows.length > SHOWN_ROWS && (
                    <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Showing the top {SHOWN_ROWS} of {rows.length}. Everyone is included in the release.</p>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2 sm:justify-between">
          {released ? (
            <>
              <Button variant="outline" onClick={() => void reissue()} disabled={busy} className="gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <RefreshCw className="h-4 w-4" />}
                Issue missing certificates
              </Button>
              <Button asChild className="gap-2">
                <Link href={`/codeathons/${id}/results`} target="_blank">View public results <ExternalLink className="h-4 w-4" /></Link>
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
              <Button onClick={() => void release()} disabled={busy || loading || !preview || rows.length === 0} className="gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Trophy className="h-4 w-4" />}
                Release results
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
