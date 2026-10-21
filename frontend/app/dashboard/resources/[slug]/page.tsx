'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, BookOpen, HelpCircle } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { useTour, autoPlayPageTour, type TourStep } from '@/components/tour/tour-context'
import { Button } from '@/components/ui/button'
import { FlipbookViewer } from '@/components/resources/flipbook-viewer'
import { EbookQuiz } from '@/components/resources/ebook-quiz'
import { SkeletonCard, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { PageHeader } from '@/components/app/page-kit'
import { EmptyState } from '@/components/ui/empty-state'
import { SoftGlow } from '@/components/visuals/stage'
import type { EbookPage } from '@/lib/db/ebooks'
import { useT } from '@/lib/i18n/client'
import { useApiError } from '@/lib/i18n/use-api-error'

type EbookDetail = {
  slug: string
  title: string
  subtitle?: string
  description?: string
  topic?: string
  readMinutes?: number
  coverImageUrl?: string | null
  pages: EbookPage[]
  sourceNote?: string
}

export default function EbookReaderPage() {
  const apiError = useApiError()
  const { t } = useT()
  const gate = usePageGuard('user')
  const { startTour, setTourSeen } = useTour()
  const params = useParams()
  const slug = String(params?.slug || '')
  const [ebook, setEbook] = useState<EbookDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showQuiz, setShowQuiz] = useState(false)

  // Extract quiz questions from ebook pages
  const quizQuestions = ebook?.pages
    ?.filter(p => p.type === 'quiz' && p.questions)
    .flatMap(p => p.questions || []) || []

  useEffect(() => {
    if (!gate.ready || !slug) return
    setLoading(true)
    fetch(`/api/resources/ebooks/${encodeURIComponent(slug)}`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error(apiError(await r.json().catch(() => ({})), t('learning.notFound')))
        return r.json()
      })
      .then((d) => setEbook(d.item))
      .catch((e) => setError(e.message || t('learning.failedToLoad')))
      .finally(() => setLoading(false))
  }, [gate.ready, slug])

  const handleExportPdf = useCallback(async () => {
    if (!ebook?.pages?.length) return

    // Dynamically import html2canvas and jspdf
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ])

    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()

    // Create a temporary container for rendering each page
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.left = '-9999px'
    container.style.top = '0'
    container.style.width = '800px'
    container.style.background = 'white'
    container.style.padding = '40px'
    container.style.fontFamily = 'system-ui, -apple-system, sans-serif'
    document.body.appendChild(container)

    for (let i = 0; i < ebook.pages.length; i++) {
      const page = ebook.pages[i]

      // Build HTML for this page
      let html = `<div style="max-width:720px;margin:0 auto;">`
      html += `<h1 style="font-size:24px;font-weight:bold;margin-bottom:16px;">${ebook.title}</h1>`

      if (page.title && page.type !== 'cover') {
        html += `<h2 style="font-size:20px;font-weight:600;margin-bottom:12px;color:#2F5BE7;">${page.title}</h2>`
      }

      if (page.body) {
        html += `<p style="font-size:14px;line-height:1.7;color:#374151;margin-bottom:12px;">${page.body}</p>`
      }

      if (page.bullets?.length) {
        html += `<ul style="margin:8px 0;padding-left:20px;">`
        for (const b of page.bullets) {
          html += `<li style="font-size:14px;line-height:1.6;margin-bottom:6px;color:#374151;">${b}</li>`
        }
        html += `</ul>`
      }

      if (page.items?.length) {
        html += `<ul style="margin:8px 0;padding-left:20px;">`
        for (const it of page.items) {
          html += `<li style="font-size:14px;line-height:1.6;margin-bottom:6px;"><strong>${it.label}</strong> ${it.text}</li>`
        }
        html += `</ul>`
      }

      if (page.steps?.length) {
        for (const s of page.steps) {
          html += `<div style="margin-bottom:12px;"><strong style="color:#2F5BE7;">${s.n}. ${s.title}</strong><br/><span style="font-size:13px;color:#6b7280;">${s.text}</span></div>`
        }
      }

      if (page.stats?.length) {
        html += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:12px 0;">`
        for (const s of page.stats) {
          html += `<div style="text-align:center;padding:12px;border:1px solid #e5e7eb;border-radius:8px;"><div style="font-size:24px;font-weight:bold;color:#2F5BE7;">${s.value}</div><div style="font-size:12px;color:#6b7280;">${s.label}</div></div>`
        }
        html += `</div>`
      }

      if (page.left && page.right) {
        html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0;">`
        html += `<div style="padding:12px;border:1px solid #c5d4ff;border-radius:8px;background:#eef2fe;"><strong style="color:#2F5BE7;">${page.left.title}</strong><ul style="margin-top:8px;padding-left:16px;">`
        for (const pt of page.left.points) html += `<li style="font-size:13px;margin-bottom:4px;">${pt}</li>`
        html += `</ul></div>`
        html += `<div style="padding:12px;border:1px solid #fecdd3;border-radius:8px;background:#fff1f2;"><strong style="color:#e11d48;">${page.right.title}</strong><ul style="margin-top:8px;padding-left:16px;">`
        for (const pt of page.right.points) html += `<li style="font-size:13px;margin-bottom:4px;">${pt}</li>`
        html += `</ul></div></div>`
      }

      if (page.quote) {
        html += `<blockquote style="border-left:4px solid #2F5BE7;padding-left:16px;font-style:italic;color:#6b7280;margin:12px 0;">${page.quote}${page.quoteBy ? `<br/><cite style="font-size:12px;">— ${page.quoteBy}</cite>` : ''}</blockquote>`
      }

      html += `</div>`

      container.innerHTML = html

      try {
        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
        })

        const imgData = canvas.toDataURL('image/png')
        const imgWidth = pageWidth - 20 // 10mm margins
        const imgHeight = (canvas.height * imgWidth) / canvas.width

        if (i > 0) pdf.addPage()
        pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, Math.min(imgHeight, pageHeight - 20))
      } catch {
        // Skip failed pages
      }
    }

    document.body.removeChild(container)

    // Download the PDF
    const filename = (ebook.title || 'ebook').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
    pdf.save(`${filename}.pdf`)
  }, [ebook])

  // First-visit guided tour (same pattern as the other dashboard pages).
  useEffect(() => {
    if (gate.ready) {
      const resourceReaderTour: TourStep[] = [
        {
          target: '[data-tour="resource-reader-header"]',
          title: t('learning.guideReaderOverview'),
          description: t('learning.thisPageOpensOneSavedResourcea38'),
          position: 'bottom',
        },
        {
          target: '[data-tour="resource-reader-actions"]',
          title: t('learning.returnToLibrary'),
          description: t('learning.clickResourcesToReturnToThe8f9'),
          position: 'bottom',
        },
        {
          target: '[data-tour="resource-reader-viewer"]',
          title: t('learning.readThenExport'),
          description: t('learning.tipFlipThroughEveryPageFirst825'),
          position: 'top',
        },
      ]
      autoPlayPageTour('resource-reader', resourceReaderTour)}
  }, [gate.ready, startTour, setTourSeen])

  if (!gate.ready || loading) {
    return (
      <div className="w-full space-y-6">
        <SkeletonText lines={3} />
        <SkeletonCard />
      </div>
    )
  }

  if (error || !ebook) {
    return (
      <div className="w-full py-8">
        <EmptyState illustration="error"
          variant="search"
          title={t('learning.weCouldntOpenThisGuide')}
          description={error && error !== 'Not found' ? error : t('learning.itMayHaveBeenMovedOr7ce')}
          actionLabel={t('learning.backToResources')}
          actionHref="/dashboard/resources"
        />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div data-tour="resource-reader-header">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2" data-tour="resource-reader-actions">
          <Link href="/dashboard/resources">
            <ArrowLeft className="mr-1 h-4 w-4" />{' '}{t('learning.resources')}</Link>
        </Button>

        {ebook.coverImageUrl ? (
          <div className="relative overflow-hidden rounded-3xl shadow-lg dark:shadow-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ebook.coverImageUrl}
              alt=""
              className="h-56 w-full object-cover sm:h-72"
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/35 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-7">
              <p className="text-xs font-semibold text-white/85">
                {ebook.topic || t('learning.guide')}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight drop-shadow-sm sm:text-3xl">
                {ebook.title}
              </h1>
              {ebook.subtitle ? (
                <p className="mt-1 max-w-3xl text-sm text-white/85">{ebook.subtitle}</p>
              ) : null}
              <p className="mt-2 text-xs text-white/70">
                {ebook.readMinutes ? t('learning.readminutesMinRead', { readMinutes: ebook.readMinutes }) : ''}
              </p>
            </div>
          </div>
        ) : (
          <div className="relative isolate">
            <SoftGlow className="-inset-x-6 -top-6" />
            <PageHeader
              className="mb-0"
              icon={<BookOpen />}
              title={ebook.title}
              description={
                <>
                  {ebook.subtitle ? <span className="block">{ebook.subtitle}</span> : null}
                  <span className="mt-1 block text-xs">
                    {ebook.topic || t('learning.guide')}
                    {ebook.readMinutes ? t('learning.readminutesMinRead2', { readMinutes: ebook.readMinutes }) : ''}
                  </span>
                </>
              }
            />
          </div>
        )}
      </div>

      <div data-tour="resource-reader-viewer">
        <FlipbookViewer pages={ebook.pages || []} title={ebook.title} onExportPdf={handleExportPdf} />
      </div>

      {/* Quiz Section */}
      {quizQuestions.length > 0 && !showQuiz && (
        <div className="text-center py-6">
          <Button onClick={() => setShowQuiz(true)} size="lg" className="gap-2">
            <HelpCircle aria-hidden className="h-5 w-5" />{t('learning.takeTheQuiz')}<span className="tabular-nums">{quizQuestions.length}</span>{' '}{t('learning.questions')}</Button>
          <p className="text-xs text-muted-foreground mt-2">{t('learning.testYourUnderstandingOfThisEbook')}</p>
        </div>
      )}

      {showQuiz && quizQuestions.length > 0 && (
        <div>
          {/* The quiz shows its own score screen on completion. */}
          <EbookQuiz questions={quizQuestions} />
        </div>
      )}

      {ebook.sourceNote ? (
        <p className="text-center text-[11px] text-muted-foreground">{ebook.sourceNote}</p>
      ) : null}
    </div>
  )
}
