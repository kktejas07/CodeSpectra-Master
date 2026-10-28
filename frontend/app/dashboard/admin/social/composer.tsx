'use client'

/**
 * Social studio composer for one queued item: captions per platform and
 * language (AI draft, template, edit, regenerate), share cards, and the
 * manual posting helpers (copy, download, open the network's share page,
 * Web Share on phones, mark as posted). Nothing is posted automatically.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, Download, ExternalLink, ImageIcon, Loader2, RefreshCw, Share2, Sparkles, Wand2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useToast } from '@/lib/toast-context'
import { useAdminT } from '@/lib/i18n/admin'
import { checkCaption, finalCaption, intentCarriesText, shareIntentUrl, socialLink, type CaptionIssue } from '@/lib/social/share'
import { CAPTION_LANGS, PLATFORM_LABELS, SOCIAL_PLATFORMS, type CaptionLang, type CardSize, type SocialPlatform, type SocialQueueDoc } from '@/lib/social/types'
import { cn } from '@/lib/utils'

const LANG_LABEL: Record<CaptionLang, string> = { en: 'English', hi: 'हिन्दी', te: 'తెలుగు' }
const CARD_FOR: Record<SocialPlatform, CardSize> = { linkedin: 'landscape', x: 'landscape', facebook: 'landscape', instagram: 'square', whatsapp: 'story', telegram: 'landscape' }
const CARDS: { size: CardSize; dims: string }[] = [
  { size: 'landscape', dims: '1200×627' },
  { size: 'square', dims: '1080×1080' },
  { size: 'story', dims: '1080×1920' },
]

export const cardUrl = (id: string, size: CardSize, download = false) => `/api/admin/social/card/${encodeURIComponent(id)}?size=${size}${download ? '&download=1' : ''}`

export function SocialComposer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: (item: SocialQueueDoc) => void }) {
  const { t, td, fmt } = useAdminT()
  const addToast = useToast()
  const [item, setItem] = useState<SocialQueueDoc | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [lang, setLang] = useState<CaptionLang>('en')
  const [platform, setPlatform] = useState<SocialPlatform>('linkedin')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [canShareFiles, setCanShareFiles] = useState(false)

  useEffect(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') setCanShareFiles(true)
  }, [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setItem(null)
    setLoadError(false)
    fetch(`/api/admin/social/${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => null)
        if (cancelled) return
        if (!r.ok || !d?.item) setLoadError(true)
        else setItem(d.item)
      })
      .catch(() => { if (!cancelled) setLoadError(true) })
    return () => { cancelled = true }
  }, [id])

  const draft = item?.captions?.[lang]?.[platform]
  useEffect(() => { setText(draft?.text ?? '') }, [draft?.text, lang, platform, item?.id])

  const link = item ? socialLink(item.url, platform, item.type) : ''
  const check = useMemo(() => checkCaption(platform, text, link, lang), [platform, text, link, lang])
  const hasDrafts = !!item?.captions?.[lang] && Object.keys(item.captions[lang] || {}).length > 0
  const dirty = text.trim() !== (draft?.text ?? '').trim()

  const post = useCallback(async (body: Record<string, unknown>, key: string): Promise<{ item?: SocialQueueDoc; fallback?: string | null } | null> => {
    if (!id) return null
    setBusy(key)
    try {
      const r = await csrfFetch(`/api/admin/social/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => null)
      if (!r.ok || !d?.item) {
        addToast({ type: 'error', title: r.status === 429 ? t('social.err.tooMany') : t('social.err.action') })
        return null
      }
      setItem(d.item)
      onChanged(d.item)
      return d
    } catch {
      addToast({ type: 'error', title: t('social.err.action') })
      return null
    } finally {
      setBusy(null)
    }
  }, [id, addToast, t, onChanged])

  const runDraft = async (ai: boolean) => {
    const d = await post({ action: 'draft', lang, ai }, ai ? 'ai' : 'tpl')
    if (!d) return
    if (ai && d.fallback) addToast({ type: 'warning', title: td(`social.fallback.${d.fallback}`, t('social.fallback.ai_failed')) })
    else addToast({ type: 'success', title: t('social.drafted') })
  }

  const save = async () => {
    if (!dirty) return true
    return !!(await post({ action: 'save', lang, platform, text }, 'save'))
  }

  const full = item ? finalCaption(platform, text, link, lang) : ''

  const copy = async (silent = false) => {
    try {
      await navigator.clipboard.writeText(full)
      if (!silent) addToast({ type: 'success', title: t('social.copied') })
      return true
    } catch {
      addToast({ type: 'error', title: t('social.err.copy') })
      return false
    }
  }

  const openIntent = async () => {
    if (!item) return
    await save()
    if (!intentCarriesText(platform)) {
      if (await copy(true)) addToast({ type: 'info', title: t('social.pasteHint') })
    }
    window.open(shareIntentUrl(platform, text, link, lang), '_blank', 'noopener,noreferrer')
  }

  const nativeShare = async () => {
    if (!item) return
    await save()
    try {
      const res = await fetch(cardUrl(item.id, CARD_FOR[platform]), { cache: 'no-store' })
      const blob = res.ok ? await res.blob() : null
      const file = blob ? new File([blob], `codespectra-${item.type}.png`, { type: 'image/png' }) : null
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: full, title: item.title })
      else await navigator.share({ text: full, title: item.title })
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') addToast({ type: 'error', title: t('social.err.share') })
    }
  }

  const mark = item?.posts?.[platform]

  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-3xl overflow-y-auto rounded-3xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="pr-8 text-left">{item?.title || t('social.composer')}</DialogTitle>
          <DialogDescription className="text-left">{t('social.composerHint')}</DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p role="alert" className="text-sm text-destructive">{t('social.err.loadItem')}</p>
        ) : !item ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />{t('common.loading')}</div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">{td(`social.type.${item.type}`, item.type)}</Badge>
              <span>{t('social.sourceLabel', { source: item.source })}</span>
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                {t('social.openItem')}<ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>

            {/* Language + platform */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div role="radiogroup" aria-label={t('social.language')} className="inline-flex rounded-full border border-border bg-muted/40 p-1">
                {CAPTION_LANGS.map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)}
                    className={cn('min-h-9 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', lang === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                    {LANG_LABEL[l]}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {hasDrafts ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => runDraft(true)} disabled={!!busy}>
                    {busy === 'ai' ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <RefreshCw className="mr-2 h-4 w-4" aria-hidden />}{t('social.regenerate')}
                  </Button>
                ) : (
                  <>
                    <Button type="button" size="sm" onClick={() => runDraft(true)} disabled={!!busy}>
                      {busy === 'ai' ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles className="mr-2 h-4 w-4" aria-hidden />}{t('social.draftAi')}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => runDraft(false)} disabled={!!busy}>
                      <Wand2 className="mr-2 h-4 w-4" aria-hidden />{t('social.draftTemplate')}
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div role="tablist" aria-label={t('social.platform')} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
              {SOCIAL_PLATFORMS.map((p) => (
                <button key={p} type="button" role="tab" aria-selected={platform === p} onClick={async () => { await save(); setPlatform(p) }}
                  className={cn('inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    platform === p ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
                  {PLATFORM_LABELS[p]}
                  {item.posts?.[p] ? <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" aria-label={t('social.posted')} /> : null}
                </button>
              ))}
            </div>

            {/* Caption */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="social-caption">{t('social.caption')}</Label>
                <span className={cn('text-xs tabular-nums', check.issues.includes('too_long') ? 'text-destructive' : check.issues.includes('over_target') ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                  {t('social.length', { n: check.length, max: check.max })}
                </span>
              </div>
              <Textarea id="social-caption" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => { void save() }} rows={platform === 'x' ? 4 : 8}
                placeholder={hasDrafts ? '' : t('social.captionEmpty')} className="font-sans" aria-describedby="social-caption-help" />
              <div id="social-caption-help" className="space-y-1 text-xs text-muted-foreground">
                <p>{td(`social.rule.${platform}`, '')}</p>
                {draft ? <p>{draft.ai ? t('social.aiDraftNote') : t('social.templateNote')}{draft.edited ? ` · ${t('social.edited')}` : ''}</p> : null}
                {check.issues.filter((i) => i !== 'over_target' || platform !== 'x').map((i: CaptionIssue) => (
                  <p key={i} className={['empty', 'too_long', 'has_url'].includes(i) ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}>{td(`social.issue.${i}`, i)}</p>
                ))}
              </div>
              <details className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                <summary className="cursor-pointer font-medium">{t('social.preview')}</summary>
                <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{full}</p>
              </details>
            </div>

            {/* Posting helpers */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => copy()} disabled={!text.trim()}>
                <Copy className="mr-2 h-4 w-4" aria-hidden />{t('social.copyCaption')}
              </Button>
              <Button type="button" className="min-h-11" onClick={openIntent} disabled={!text.trim()}>
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden />{t('social.openIn', { platform: PLATFORM_LABELS[platform] })}
              </Button>
              {canShareFiles ? (
                <Button type="button" variant="outline" className="min-h-11" onClick={nativeShare} disabled={!text.trim()}>
                  <Share2 className="mr-2 h-4 w-4" aria-hidden />{t('social.shareNative')}
                </Button>
              ) : null}
              <Button type="button" variant={mark ? 'secondary' : 'outline'} className="min-h-11" disabled={busy === 'posted'}
                onClick={async () => { await save(); await post({ action: 'posted', platform, posted: !mark }, 'posted') }} aria-pressed={!!mark}>
                {busy === 'posted' ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Check className="mr-2 h-4 w-4" aria-hidden />}
                {mark ? t('social.unmarkPosted') : t('social.markPosted', { platform: PLATFORM_LABELS[platform] })}
              </Button>
            </div>
            {mark ? (
              <p className="text-xs text-muted-foreground">{t('social.postedBy', { name: mark.by_name || mark.by, when: fmt.dateTime(mark.at) })}</p>
            ) : null}
            {!intentCarriesText(platform) ? <p className="text-xs text-muted-foreground">{td(`social.intentNote.${platform}`, '')}</p> : null}
            <p className="break-all text-xs text-muted-foreground">{t('social.trackedLink')} <span className="font-mono">{link}</span></p>

            {/* Images */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">{t('social.images')}</h3>
              <div className="grid grid-cols-3 gap-3">
                {CARDS.map((c) => (
                  <div key={c.size} className="flex flex-col gap-2">
                    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted/40">
                      {/* eslint-disable-next-line @next/next/no-img-element -- generated on request, admin only */}
                      <img src={cardUrl(item.id, c.size)} alt={t('social.cardAlt', { size: c.dims })} loading="lazy" className="max-h-full max-w-full object-contain" />
                    </div>
                    <Button asChild variant="outline" size="sm" className="min-h-10">
                      <a href={cardUrl(item.id, c.size, true)} download>
                        <Download className="mr-1.5 h-4 w-4" aria-hidden /><span className="truncate">{td(`social.card.${c.size}`, c.dims)}</span>
                      </a>
                    </Button>
                  </div>
                ))}
              </div>
              {item.image ? (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-3 text-sm">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <a href={item.image} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
                    {item.image_own ? t('social.ownImage') : t('social.publisherImage')}
                  </a>
                  {!item.image_own ? <span className="text-xs text-muted-foreground">{t('social.publisherCredit', { source: item.facts.organiser || item.source })}</span> : null}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
