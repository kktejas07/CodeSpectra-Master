'use client'

import { formatDate } from '@/lib/i18n/format'
import { useCallback, useEffect, useState } from 'react'
import { useBrowserValue } from '@/hooks/use-browser-value'
import { Mail, Phone, Search, Send, UserSearch, X } from 'lucide-react'
import { HiringShell, QueryGate } from '@/components/hiring/shell'
import { ChipInput, Field, InlineError, NativeSelect, Segmented } from '@/components/hiring/ui'
import { atsSend, useAts, AtsError } from '@/components/hiring/lib/api'
import { LevelPill } from '@/components/passport/skill-list'
import { Panel } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/lib/toast-context'
import { PASSPORT_LEVELS, LEVEL_LABELS, type PassportLevel } from '@/lib/passport/core'
import { AVAILABILITY, AVAILABILITY_LABELS, INVITE_TARGET_LABELS, type InviteTarget, type TalentResult } from '@/lib/talent/core'
import { cn } from '@/lib/utils'
import { useT, activeLocale } from '@/lib/i18n/client'

interface Quota { used: number; limit: number; month: string }
interface SearchResponse { total: number; page: number; results: TalentResult[]; quota: Quota }
interface SentInvite { id: string; handle: string; learner_name: string; target_type: InviteTarget; target_title: string; status: string; created_at: string; contact: { email: string | null; phone: string | null } | null }
interface Targets { tests: Array<{ id: string; title: string }>; jobs: Array<{ id: string; title: string }> }

const day = (iso: string) => formatDate(activeLocale(), iso, { day: 'numeric', month: 'short', year: 'numeric' })

export default function TalentSearchPage() {
  const { t } = useT()
  const initial = useBrowserValue(() => (new URLSearchParams(window.location.search).get('tab') === 'invites' ? 'invites' : 'search'), 'search' as 'search' | 'invites')
  const [tab, setTab] = useState<'search' | 'invites'>('search')
  useEffect(() => setTab(initial), [initial])
  return (
    <HiringShell
      title={t('hiring.talentSearch')}
      description={t('hiring.findLearnersWhoChoseToBecac')}
      icon={<UserSearch />}
    >
      <div className="mb-5">
        <Segmented label={t('hiring.talentSearchView')} value={tab} onChange={setTab} options={[{ value: 'search', label: t('common.search') }, { value: 'invites', label: t('hiring.sentInvites') }]} />
      </div>
      {tab === 'search' ? <SearchTab /> : <InvitesTab />}
    </HiringShell>
  )
}

function SearchTab() {
  const { td, t } = useT()
  const addToast = useToast()
  const [skills, setSkills] = useState<string[]>([])
  const [level, setLevel] = useState<PassportLevel>('intermediate')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [yearMin, setYearMin] = useState('')
  const [yearMax, setYearMax] = useState('')
  const [availability, setAvailability] = useState('')
  const [page, setPage] = useState(1)
  const [res, setRes] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteFor, setInviteFor] = useState<TalentResult | null>(null)

  const run = useCallback(async (p = 1) => {
    setLoading(true)
    setError(null)
    try {
      const body = {
        skills,
        min_level: level,
        ...(country.trim().length === 2 ? { country: country.trim().toUpperCase() } : {}),
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(yearMin ? { graduation_year_min: Number(yearMin) } : {}),
        ...(yearMax ? { graduation_year_max: Number(yearMax) } : {}),
        ...(availability ? { availability: [availability] } : {}),
        page: p,
        limit: 20,
      }
      setRes(await atsSend<SearchResponse>('/api/ats/talent/search', 'POST', body))
      setPage(p)
    } catch (e) {
      setError(e instanceof AtsError ? e.message : t('hiring.searchFailedTryAgain'))
    } finally {
      setLoading(false)
    }
  }, [skills, level, country, city, yearMin, yearMax, availability])

  const pages = res ? Math.max(1, Math.ceil(res.total / 20)) : 1
  return (
    <div className="space-y-5">
      <Panel className="space-y-4">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run(1) }}>
          <ChipInput label={t('hiring.verifiedSkills')} value={skills} onChange={(v) => setSkills(v.slice(0, 5))} placeholder={t('hiring.eGPythonSqlReact')} hint={t('hiring.upToFiveLearnersMustHave47c')} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('hiring.minimumLevel')} htmlFor="ts-level">
              <NativeSelect id="ts-level" value={level} onChange={(v) => setLevel(v as PassportLevel)} options={PASSPORT_LEVELS.map((l) => ({ value: l, label: td(`hiring.levelLabels:${l}`, LEVEL_LABELS[l]) }))} />
            </Field>
            <Field label={t('hiring.countryCode')} htmlFor="ts-country" hint={t('hiring.twoLettersEGIn')}><Input id="ts-country" value={country} maxLength={2} onChange={(e) => setCountry(e.target.value.replace(/[^a-z]/gi, ''))} /></Field>
            <Field label={t('hiring.city')} htmlFor="ts-city"><Input id="ts-city" value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} /></Field>
            <Field label={t('hiring.availability')} htmlFor="ts-avail">
              <NativeSelect id="ts-avail" value={availability} onChange={setAvailability} placeholder={t('hiring.any')} options={AVAILABILITY.map((a) => ({ value: a, label: td(`hiring.availabilityLabels:${a}`, AVAILABILITY_LABELS[a]) }))} />
            </Field>
            <Field label={t('hiring.graduatedFrom')} htmlFor="ts-ymin"><Input id="ts-ymin" inputMode="numeric" maxLength={4} value={yearMin} onChange={(e) => setYearMin(e.target.value.replace(/\D/g, ''))} placeholder={t('hiring.year')} /></Field>
            <Field label={t('hiring.graduatedBy')} htmlFor="ts-ymax"><Input id="ts-ymax" inputMode="numeric" maxLength={4} value={yearMax} onChange={(e) => setYearMax(e.target.value.replace(/\D/g, ''))} placeholder={t('hiring.year')} /></Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" className="h-11 rounded-xl" disabled={loading}><Search className="h-4 w-4" aria-hidden /> {loading ? t('hiring.searching') : t('common.search')}</Button>
            {res?.quota && <p className="text-sm text-muted-foreground tabular-nums">{t('hiring.invitesThisMonthUsedOfLimit', { used: res.quota.used, limit: res.quota.limit })}</p>}
          </div>
        </form>
        <InlineError message={error} />
      </Panel>

      {res && (
        res.results.length === 0 ? (
          <EmptyState variant="search" title={t('hiring.noDiscoverableLearnersMatch')} description={t('hiring.tryFewerSkillsALowerLevelfb4')} />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">{t('hiring.countLearnersFound', { count: res.total })}</p>
            <ul className={cn('grid gap-3 md:grid-cols-2', loading && 'opacity-70')}>
              {res.results.map((r) => (
                <li key={r.handle}>
                  <Panel className="space-y-3 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{r.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {[r.city, r.country].filter(Boolean).join(', ') || t('hiring.locationNotShared')}
                          {r.graduation_year ? t('hiring.classOfGraduationYear', { graduation_year: r.graduation_year }) : ''}
                          {r.availability ? ` · ${td(`hiring.availabilityLabels:${r.availability as keyof typeof AVAILABILITY_LABELS}`, AVAILABILITY_LABELS[r.availability as keyof typeof AVAILABILITY_LABELS]) ?? r.availability}` : ''}
                        </p>
                      </div>
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium tabular-nums text-primary" title={t('hiring.matchScoreFromVerifiedLevels')}>{r.match}</span>
                    </div>
                    <ul className="flex flex-wrap gap-1.5">
                      {r.skills.map((s) => (
                        <li key={s.skill} className="flex items-center gap-1.5 rounded-full border border-border/70 px-2 py-0.5 text-xs">
                          <span className="capitalize text-foreground">{s.skill}</span>
                          <LevelPill level={s.level as PassportLevel} className="px-1.5 py-0" />
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" className="h-11 rounded-xl" onClick={() => setInviteFor(r)}><Send className="h-4 w-4" aria-hidden />{' '}{t('hiring.invite')}</Button>
                    </div>
                  </Panel>
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" disabled={page <= 1 || loading} onClick={() => void run(page - 1)}>{t('common.previous')}</Button>
                <span className="text-sm tabular-nums text-muted-foreground">{t('hiring.pagePageOfPages', { page, pages })}</span>
                <Button type="button" variant="outline" disabled={page >= pages || loading} onClick={() => void run(page + 1)}>{t('common.next')}</Button>
              </div>
            )}
          </div>
        )
      )}
      {!res && !loading && (
        <EmptyState illustration="search" title={t('hiring.searchVerifiedTalent')} description={t('hiring.addASkillAndAMinimum14f')} />
      )}
      <InviteDialog target={inviteFor} onClose={() => setInviteFor(null)} onSent={() => { addToast({ type: 'success', title: t('hiring.inviteSent') }); setInviteFor(null); void run(page) }} />
    </div>
  )
}

function InviteDialog({ target, onClose, onSent }: { target: TalentResult | null; onClose: () => void; onSent: () => void }) {
  const { td, t } = useT()
  const targets = useAts<Targets>(target ? '/api/ats/talent/targets' : null)
  const [type, setType] = useState<InviteTarget>('job')
  const [targetId, setTargetId] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (target) { setTargetId(''); setMessage(''); setError(null) } }, [target])
  const options = type === 'test' ? targets.data?.tests ?? [] : targets.data?.jobs ?? []
  const send = async () => {
    if (!target || !targetId) return
    setBusy(true)
    setError(null)
    try {
      await atsSend('/api/ats/talent/invites', 'POST', { handle: target.handle, target_type: type, target_id: targetId, ...(message.trim() ? { message: message.trim() } : {}) })
      onSent()
    } catch (e) {
      setError(e instanceof AtsError ? e.message : t('hiring.couldntSendTheInvite'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('hiring.inviteName', { name: target?.name })}</DialogTitle>
          <DialogDescription>{t('hiring.theyllGetANotificationTheirEmail5b9')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Segmented label={t('hiring.inviteTo')} value={type} onChange={(v) => { setType(v); setTargetId('') }} options={(['job', 'test', 'interview'] as const).map((v) => ({ value: v, label: td(`hiring.inviteTargetLabels:${v}`, INVITE_TARGET_LABELS[v]) }))} />
          <Field label={type === 'test' ? t('hiring.test') : t('hiring.job')} htmlFor="ti-target" hint={type === 'interview' ? t('hiring.acceptingAddsThemToThisJobs16d') : undefined}>
            <NativeSelect id="ti-target" value={targetId} onChange={setTargetId} placeholder={targets.loading ? t('common.loading') : options.length ? t('hiring.chooseOne') : type === 'test' ? t('hiring.noPublishedTests') : t('hiring.noOpenJobs')} options={options.map((o) => ({ value: o.id, label: o.title }))} />
          </Field>
          <Field label={t('hiring.messageOptional')} htmlFor="ti-msg">
            <Textarea id="ti-msg" value={message} maxLength={1000} rows={4} onChange={(e) => setMessage(e.target.value)} placeholder={t('hiring.whyYoureReachingOut')} />
          </Field>
          <InlineError message={error || targets.error?.message} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="button" disabled={!targetId || busy} onClick={() => void send()}><Send className="h-4 w-4" aria-hidden /> {busy ? t('hiring.sending') : t('hiring.sendInvite')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InvitesTab() {
  const { td, t } = useT()
  const addToast = useToast()
  const q = useAts<{ invites: SentInvite[]; quota: Quota }>('/api/ats/talent/invites')
  const withdraw = async (id: string) => {
    try {
      await atsSend(`/api/ats/talent/invites/${encodeURIComponent(id)}`, 'DELETE')
      addToast({ type: 'success', title: t('hiring.inviteWithdrawn') })
      q.reload()
    } catch (e) {
      addToast({ type: 'error', title: e instanceof AtsError ? e.message : t('hiring.couldntWithdraw') })
    }
  }
  const invites = q.data?.invites ?? []
  return (
    <div className="space-y-4">
      <QueryGate loading={q.loading} error={q.error} hasData={!!q.data} onRetry={q.reload} />
      {q.data && (invites.length === 0 ? (
        <EmptyState illustration="inbox" title={t('hiring.noInvitesSentYet')} description={t('hiring.searchForTalentAndInvitePeoplefc4')} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/70">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr><th className="px-4 py-2.5 font-medium">{t('hiring.learner2')}</th><th className="px-4 py-2.5 font-medium">{t('hiring.invitedTo')}</th><th className="px-4 py-2.5 font-medium">{t('hiring.status')}</th><th className="px-4 py-2.5 font-medium">{t('hiring.contact')}</th><th className="px-4 py-2.5 font-medium"><span className="sr-only">{t('hiring.actions')}</span></th></tr>
            </thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id} className="border-t border-border/60">
                  <td className="px-4 py-2.5"><span className="font-medium text-foreground">{i.learner_name}</span><span className="block text-xs text-muted-foreground">{day(i.created_at)}</span></td>
                  <td className="px-4 py-2.5">{td(`hiring.inviteTargetLabels:${i.target_type}`, INVITE_TARGET_LABELS[i.target_type])}: {i.target_title}</td>
                  <td className="px-4 py-2.5 capitalize">{i.status}</td>
                  <td className="px-4 py-2.5">
                    {i.contact ? (
                      <span className="space-y-0.5">
                        {i.contact.email && <a href={`mailto:${i.contact.email}`} className="flex items-center gap-1 text-primary underline-offset-2 hover:underline"><Mail className="h-3.5 w-3.5" aria-hidden />{i.contact.email}</a>}
                        {i.contact.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" aria-hidden />{i.contact.phone}</span>}
                      </span>
                    ) : <span className="text-muted-foreground">{t('hiring.sharedOnAccept')}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {i.status === 'pending' && <Button type="button" size="sm" variant="ghost" onClick={() => void withdraw(i.id)} aria-label={t('hiring.withdrawInviteToLearnerName', { learner_name: i.learner_name })}><X className="h-4 w-4" aria-hidden />{' '}{t('hiring.withdraw')}</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
