'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ArrowLeft, BookOpen, Bookmark, UserRound, Layers, Play, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { learningHref, parseLearningParams } from '@/lib/learning-query'

function NavLinkRow({
  href,
  active,
  collapsed,
  onPick,
  children,
}: {
  href: string
  active: boolean
  collapsed: boolean
  onPick: () => void
  children: ReactNode
}) {
  return (
    <Link href={href} onClick={onPick}>
      <div
        className={cn(
          'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all',
          collapsed && 'lg:justify-center lg:px-2',
          active
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
        )}
      >
        {children}
      </div>
    </Link>
  )
}

export function LearningSidebarNav({
  collapsed,
  homeHref,
  onNavigate,
}: {
  collapsed: boolean
  homeHref: string
  onNavigate: () => void
}) {
  const pathname = usePathname()
  const sp = useSearchParams()
  const { view, level, type } = parseLearningParams(sp)
  const onHub = pathname === '/dashboard/learning'

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          'border-b border-border/40 px-2 py-2',
          collapsed && 'lg:px-1'
        )}
      >
        <Link
          href={homeHref}
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground',
            collapsed && 'lg:justify-center'
          )}
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className={cn('font-medium', collapsed && 'lg:sr-only')}>
            Back to dashboard
          </span>
        </Link>
        <p
          className={cn(
            'mt-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80',
            collapsed && 'lg:sr-only'
          )}
        >
          Learning
        </p>
      </div>

      <div className="space-y-3 px-2 py-2">
        <div>
          <p
            className={cn(
              'mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70',
              collapsed && 'lg:sr-only'
            )}
          >
            View
          </p>
          <div className="space-y-0.5">
            <NavLinkRow
              href={learningHref(sp, { view: 'all' })}
              active={onHub && view === 'all'}
              collapsed={collapsed}
              onPick={onNavigate}
            >
              <BookOpen className="h-4 w-4 shrink-0 opacity-90" />
              <span className={cn('truncate', collapsed && 'lg:sr-only')}>All courses</span>
            </NavLinkRow>
            <NavLinkRow
              href={learningHref(sp, { view: 'my-courses' })}
              active={onHub && view === 'my-courses'}
              collapsed={collapsed}
              onPick={onNavigate}
            >
              <UserRound className="h-4 w-4 shrink-0 opacity-90" />
              <span className={cn('truncate', collapsed && 'lg:sr-only')}>My courses</span>
            </NavLinkRow>
            <NavLinkRow
              href={learningHref(sp, { view: 'saved' })}
              active={onHub && view === 'saved'}
              collapsed={collapsed}
              onPick={onNavigate}
            >
              <Bookmark className="h-4 w-4 shrink-0 opacity-90" />
              <span className={cn('truncate', collapsed && 'lg:sr-only')}>Saved</span>
            </NavLinkRow>
          </div>
        </div>

        <div className="border-t border-border/40 pt-2">
          <p
            className={cn(
              'mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70',
              collapsed && 'lg:sr-only'
            )}
          >
            Level
          </p>
          <div className="space-y-0.5">
            {(['all', 'beginner', 'intermediate', 'advanced'] as const).map((l) => (
              <NavLinkRow
                key={l}
                href={learningHref(sp, { level: l })}
                active={onHub && level === l}
                collapsed={collapsed}
                onPick={onNavigate}
              >
                <Layers className="h-4 w-4 shrink-0 opacity-90" />
                <span className={cn('truncate capitalize', collapsed && 'lg:sr-only')}>
                  {l === 'all' ? 'All levels' : l}
                </span>
              </NavLinkRow>
            ))}
          </div>
        </div>

        <div className="border-t border-border/40 pt-2">
          <p
            className={cn(
              'mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70',
              collapsed && 'lg:sr-only'
            )}
          >
            Type
          </p>
          <div className="space-y-0.5">
            {(['all', 'video', 'audio', 'text'] as const).map((t) => (
              <NavLinkRow
                key={t}
                href={learningHref(sp, { type: t })}
                active={onHub && type === t}
                collapsed={collapsed}
                onPick={onNavigate}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center opacity-90">
                  {t === 'video' && <Play className="h-3.5 w-3.5" />}
                  {t === 'audio' && <Volume2 className="h-3.5 w-3.5" />}
                  {t === 'text' && <BookOpen className="h-3.5 w-3.5" />}
                  {t === 'all' && <Layers className="h-3.5 w-3.5" />}
                </span>
                <span className={cn('truncate capitalize', collapsed && 'lg:sr-only')}>
                  {t === 'all' ? 'All types' : t}
                </span>
              </NavLinkRow>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
