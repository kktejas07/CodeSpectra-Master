'use client'

import Link from 'next/link'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

export type EbookCoverTheme = 'violet' | 'teal' | 'amber' | 'rose' | 'slate'

const THEME: Record<EbookCoverTheme, string> = {
  violet: 'from-violet-700 via-violet-600 to-fuchsia-500',
  teal: 'from-teal-700 via-teal-600 to-cyan-500',
  amber: 'from-amber-700 via-amber-500 to-orange-400',
  rose: 'from-rose-700 via-rose-600 to-pink-500',
  slate: 'from-slate-800 via-slate-700 to-slate-500',
}

export type EbookCardData = {
  slug: string
  title: string
  subtitle?: string
  topic?: string
  coverTheme?: EbookCoverTheme
  coverImageUrl?: string | null
  readMinutes?: number
  status?: string
  pageCount?: number
  id?: string
}

// coverTheme + readMinutes match EbookDoc / API publicShape

/** Unstop-style 3D cover card */
export function EbookCoverCard({
  ebook,
  href,
  showStatus,
}: {
  ebook: EbookCardData
  href?: string
  showStatus?: boolean
}) {
  const theme = (ebook.coverTheme || 'violet') as EbookCoverTheme
  const to = href || `/dashboard/resources/${ebook.slug}`

  return (
    <Link href={to} className="group block perspective-midrange">
      <div
        className={cn(
          'relative aspect-3/4 overflow-hidden rounded-lg shadow-lg transition-transform duration-300',
          'group-hover:-translate-y-1 group-hover:shadow-xl',
          'bg-linear-to-br text-white',
          THEME[theme],
        )}
      >
        {ebook.coverImageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ebook.coverImageUrl}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
            {/* Scrim keeps the title readable over the artwork */}
            <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/25 to-transparent" />
          </>
        ) : null}
        <div className="absolute inset-y-0 left-0 w-2 bg-black/20" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.25),transparent_45%)]" />
        <div className="relative flex h-full flex-col justify-between p-4 pl-5">
          <div>
            {ebook.topic ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80">
                {ebook.topic}
              </p>
            ) : null}
            <h3 className="mt-2 text-lg font-bold leading-snug drop-shadow-sm line-clamp-4">
              {ebook.title}
            </h3>
            {ebook.subtitle ? (
              <p className="mt-2 text-xs text-white/85 line-clamp-3">{ebook.subtitle}</p>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px] text-white/90">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {ebook.readMinutes || 5} min
            </span>
            {showStatus && ebook.status ? (
              <span className="rounded bg-black/25 px-1.5 py-0.5 capitalize">{ebook.status}</span>
            ) : (
              <span className="font-medium opacity-90">Read →</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
