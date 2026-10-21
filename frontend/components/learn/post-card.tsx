/** Learn post card (server- and client-safe). */
import Link from 'next/link'
import { Clock } from 'lucide-react'
import { categoryLabel, type LearnPostCard } from '@/lib/learn/types'
import { TEAM_LABEL, teamCategoryLabel } from '@/lib/learn/team-posts'
import type { HubCard, TeamPostCard } from '@/lib/learn/team-queries'
import { cn } from '@/lib/utils'

const LEVEL_STYLE: Record<string, string> = {
  beginner: 'bg-green-500/10 text-green-700 dark:text-green-400',
  intermediate: 'bg-primary/10 text-primary',
  advanced: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
}

export function LevelPill({ level }: { level: string }) {
  return <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', LEVEL_STYLE[level] ?? 'bg-muted text-muted-foreground')}>{level}</span>
}

export function LearnPostCardView({ post, className }: { post: LearnPostCard; className?: string }) {
  return (
    <Link
      href={`/learn/${encodeURIComponent(post.slug)}`}
      className={cn(
        'group flex h-full flex-col rounded-3xl border border-border/70 bg-card p-5 text-card-foreground transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_rgba(47,91,231,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-primary">{categoryLabel(post.category)}</span>
        <LevelPill level={post.level} />
      </div>
      <h3 className="mt-3 text-lg font-semibold leading-snug tracking-tight text-foreground group-hover:text-primary">{post.title}</h3>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{post.summary}</p>
      <div className="mt-auto flex items-center gap-3 pt-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden /><span className="tabular-nums">{post.reading_minutes}</span> min read</span>
        {post.series ? <span className="truncate">Series: {post.series}</span> : null}
      </div>
    </Link>
  )
}

/** A "From the team" post (written in the admin blog editor) as a Learn card. */
export function TeamPostCardView({ post, className }: { post: TeamPostCard; className?: string }) {
  return (
    <Link
      href={`/learn/${encodeURIComponent(post.slug)}`}
      className={cn(
        'group flex h-full flex-col rounded-3xl border border-border/70 bg-card p-5 text-card-foreground transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-20px_rgba(47,91,231,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-primary">{TEAM_LABEL}</span>
        <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 font-medium text-muted-foreground">{teamCategoryLabel(post.category)}</span>
      </div>
      <h3 className="mt-3 text-lg font-semibold leading-snug tracking-tight text-foreground group-hover:text-primary">{post.title}</h3>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{post.summary}</p>
      <div className="mt-auto flex items-center gap-3 pt-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden /><span className="tabular-nums">{post.reading_minutes}</span> min read</span>
        {post.author_name ? <span className="truncate">{post.author_name}</span> : null}
      </div>
    </Link>
  )
}

/** Either kind of post in the Learn hub. */
export function HubCardView({ post, className }: { post: HubCard; className?: string }) {
  return post.kind === 'team' ? <TeamPostCardView post={post} className={className} /> : <LearnPostCardView post={post} className={className} />
}
