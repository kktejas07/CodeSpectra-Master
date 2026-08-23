'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { Button } from '@/components/ui/button'
import { FlipbookViewer } from '@/components/resources/flipbook-viewer'
import type { EbookPage } from '@/lib/db/ebooks'

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
  const gate = usePageGuard('user')
  const params = useParams()
  const slug = String(params?.slug || '')
  const [ebook, setEbook] = useState<EbookDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gate.ready || !slug) return
    setLoading(true)
    fetch(`/api/resources/ebooks/${encodeURIComponent(slug)}`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Not found')
        return r.json()
      })
      .then((d) => setEbook(d.item))
      .catch((e) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [gate.ready, slug])

  if (!gate.ready || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }

  if (error || !ebook) {
    return (
      <div className="flex w-full flex-col items-center space-y-4 py-16 text-center">
        <p className="font-medium">{error || 'Ebook not found'}</p>
        <Button asChild variant="outline">
          <Link href="/dashboard/resources">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Resources
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/dashboard/resources">
            <ArrowLeft className="mr-1 h-4 w-4" /> Resources
          </Link>
        </Button>

        {ebook.coverImageUrl ? (
          <div className="relative overflow-hidden rounded-xl shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ebook.coverImageUrl}
              alt=""
              className="h-56 w-full object-cover sm:h-72"
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/35 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">
                {ebook.topic || 'Guide'}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight drop-shadow-sm sm:text-3xl">
                {ebook.title}
              </h1>
              {ebook.subtitle ? (
                <p className="mt-1 max-w-3xl text-sm text-white/85">{ebook.subtitle}</p>
              ) : null}
              <p className="mt-2 text-xs text-white/70">
                {ebook.readMinutes ? `${ebook.readMinutes} min read` : ''}
              </p>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight">{ebook.title}</h1>
            {ebook.subtitle ? (
              <p className="mt-1 text-sm text-muted-foreground">{ebook.subtitle}</p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              {ebook.topic || 'Guide'}
              {ebook.readMinutes ? ` · ${ebook.readMinutes} min read` : ''}
            </p>
          </>
        )}
      </div>

      <FlipbookViewer pages={ebook.pages || []} />

      {ebook.sourceNote ? (
        <p className="text-center text-[11px] text-muted-foreground">{ebook.sourceNote}</p>
      ) : null}
    </div>
  )
}
