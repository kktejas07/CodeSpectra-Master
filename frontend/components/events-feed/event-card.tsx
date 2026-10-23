'use client'

import Link from 'next/link'
import { useState } from 'react'
import { BellPlus, BellRing, CalendarPlus, Check, Copy, Download, ExternalLink, Globe, GraduationCap, MapPin, MessageCircle, Share2, Sparkles, Trophy, Clock } from 'lucide-react'
import { Linkedin } from '@/components/ui/brand-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { countryName, formatRange, googleCalendarUrl, KIND_LABELS, MODE_LABELS, shareLinks, withUtm } from '@/lib/events-feed/public'
import type { PublicFeedEvent } from '@/lib/events-feed/types'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/client'
import type { Translator } from '@/lib/i18n/catalog'
import { localizedPath } from '@/lib/i18n/public-paths'

/** Deadline line; pass the page translator for Hindi / Telugu (English without it). */
export function deadlineLabel(iso: string | null, now = Date.now(), t?: Translator): { text: string; urgent: boolean } | null {
  if (!iso) return null
  const ms = Date.parse(iso) - now
  if (ms < 0) return { text: t ? t('public.evRegClosed') : 'Registration closed', urgent: false }
  const days = Math.floor(ms / 86_400_000)
  if (days < 1) return { text: t ? t('public.evRegToday') : 'Registration closes today', urgent: true }
  if (days < 7) return { text: t ? t('public.evRegInDays', { count: days }) : `Registration closes in ${days} day${days === 1 ? '' : 's'}`, urgent: days <= 2 }
  const date = new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return { text: t ? t('public.evRegBy', { date }) : `Register by ${date}`, urgent: false }
}

/** "Add to calendar": .ics download (Apple / Outlook) or Google Calendar. */
export function AddToCalendar({ ev, pageUrl, label }: { ev: PublicFeedEvent; pageUrl: string; label?: string }) {
  const { t } = useT()
  const google = googleCalendarUrl(ev, pageUrl)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {label
          ? <Button variant="outline" className="h-11 rounded-xl"><CalendarPlus className="h-4 w-4" /> {label}</Button>
          : <Button size="icon-sm" variant="outline" aria-label={t('public.evAddCalendar')}><CalendarPlus className="h-4 w-4" aria-hidden /></Button>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {google && <DropdownMenuItem asChild><a href={google} target="_blank" rel="noopener noreferrer"><CalendarPlus className="h-4 w-4" /> Google Calendar</a></DropdownMenuItem>}
        <DropdownMenuItem asChild><a href={`/api/events-feed/${ev.id}/ics`} download><Download className="h-4 w-4" aria-hidden /> {t('public.evDownloadIcs')}</a></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function EventCard({ ev, origin, saved, onToggleSave }: { ev: PublicFeedEvent; origin: string; saved?: boolean; onToggleSave?: (id: string, save: boolean) => void }) {
  const [copied, setCopied] = useState(false)
  const { t, td, locale } = useT()
  const page = `${origin}/events/${ev.id}`
  const share = shareLinks(page, ev.title)
  const modeLabel = td(`public.mode:${ev.mode}`, MODE_LABELS[ev.mode])
  const where = ev.mode === 'online' ? modeLabel : [ev.city, ev.country && countryName(ev.country)].filter(Boolean).join(', ') || modeLabel
  const dl = deadlineLabel(ev.registration_deadline, Date.now(), locale === 'en' ? undefined : t)

  async function copy() {
    try { await navigator.clipboard.writeText(page); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* clipboard blocked */ }
  }

  return (
    <article className={cn(
      'group flex h-full flex-col overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-14px_rgba(15,23,41,0.10)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/40 motion-reduce:hover:translate-y-0 dark:shadow-none',
      ev.featured ? 'border-primary/40' : 'border-border/70',
    )}>
      {ev.image && (
        <div className="h-32 w-full overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ev.image} alt="" width={640} height={256} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {ev.featured && <Badge className="gap-1 bg-primary text-primary-foreground"><Sparkles className="h-3 w-3" aria-hidden /> {t('public.featured')}</Badge>}
          <Badge variant="secondary">{td(`public.kind:${ev.kind}`, KIND_LABELS[ev.kind])}</Badge>
          <Badge variant="outline" className="gap-1">{ev.mode === 'online' ? <Globe className="h-3 w-3" aria-hidden /> : <MapPin className="h-3 w-3" aria-hidden />}{modeLabel}</Badge>
          {ev.student_friendly && <Badge variant="outline" className="gap-1"><GraduationCap className="h-3 w-3" aria-hidden /> {t('public.evStudents')}</Badge>}
        </div>
        <div>
          <h3 className="text-base font-semibold leading-snug text-foreground">
            <Link href={localizedPath(`/events/${ev.id}`, locale)} className="hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">{ev.title}</Link>
          </h3>
          {ev.organiser && <p className="mt-0.5 text-xs text-muted-foreground">{t('public.byName', { name: ev.organiser })}</p>}
        </div>
        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{ev.summary}</p>
        <dl className="mt-auto space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5"><CalendarPlus className="h-3.5 w-3.5" aria-hidden /><dt className="sr-only">{t('public.evDates')}</dt><dd className="tabular-nums">{formatRange(ev.starts_at, ev.ends_at)}</dd></div>
          <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" aria-hidden /><dt className="sr-only">{t('public.evWhere')}</dt><dd>{where}</dd></div>
          {ev.prize_text && <div className="flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" aria-hidden /><dt className="sr-only">{t('public.evPrize')}</dt><dd>{ev.prize_text}</dd></div>}
          {dl && <div className={cn('flex items-center gap-1.5', dl.urgent && 'font-medium text-amber-700 dark:text-amber-400')}><Clock className="h-3.5 w-3.5" aria-hidden /><dt className="sr-only">{t('public.evDeadline')}</dt><dd>{dl.text}</dd></div>}
        </dl>
        {ev.themes.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label={t('public.evThemes')}>
            {ev.themes.slice(0, 4).map((x) => <li key={x} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{x.replace(/-/g, ' ')}</li>)}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button asChild size="sm" className="h-9 rounded-xl">
            <a href={withUtm(ev.url, ev.internal)} target={ev.internal ? undefined : '_blank'} rel={ev.internal ? undefined : 'noopener nofollow'}>
              {t('public.evRegister')} {!ev.internal && <ExternalLink className="h-3.5 w-3.5" aria-hidden />}
            </a>
          </Button>
          {ev.starts_at && <AddToCalendar ev={ev} pageUrl={page} />}
          {onToggleSave && ev.registration_deadline && Date.parse(ev.registration_deadline) > Date.now() && (
            <Button size="icon-sm" variant={saved ? 'secondary' : 'outline'} aria-pressed={saved} aria-label={saved ? t('public.evReminderOff') : t('public.evReminderOn')} onClick={() => onToggleSave(ev.id, !saved)}>
              {saved ? <BellRing className="h-4 w-4 text-primary" /> : <BellPlus className="h-4 w-4" />}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="outline" aria-label={t('public.evShare')}><Share2 className="h-4 w-4" aria-hidden /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild><a href={share.linkedin} target="_blank" rel="noopener noreferrer"><Linkedin className="h-4 w-4" /> LinkedIn</a></DropdownMenuItem>
              <DropdownMenuItem asChild><a href={share.whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a></DropdownMenuItem>
              <DropdownMenuItem asChild><a href={share.x} target="_blank" rel="noopener noreferrer"><span aria-hidden className="w-4 text-center font-bold">X</span> X</a></DropdownMenuItem>
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void copy() }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? t('public.evCopied') : t('public.evCopyLink')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </article>
  )
}
