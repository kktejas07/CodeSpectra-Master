'use client'

/**
 * Boneyard-style skeleton loaders for better loading UX.
 * These are minimal, performant, and provide good perceived performance.
 */

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-5 space-y-3 animate-pulse">
      <div className="h-4 w-3/4 bg-muted/60 rounded" />
      <div className="space-y-2">
        <div className="h-3 w-full bg-muted/50 rounded" />
        <div className="h-3 w-5/6 bg-muted/50 rounded" />
        <div className="h-3 w-2/3 bg-muted/50 rounded" />
      </div>
      <div className="h-8 w-24 bg-muted/70 rounded mt-4" />
    </div>
  )
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

export function SkeletonText({ lines = 2 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`h-4 bg-muted/50 rounded animate-pulse ${
            i === lines - 1 ? 'w-2/3' : 'w-full'
          }`}
        />
      ))}
    </div>
  )
}

export function SkeletonAvatar() {
  return (
    <div className="h-10 w-10 rounded-full bg-muted/60 animate-pulse" />
  )
}

export function SkeletonButton() {
  return (
    <div className="h-10 w-32 rounded-lg bg-muted/70 animate-pulse" />
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex gap-2">
        <div className="h-6 w-1/4 bg-muted/60 rounded" />
        <div className="h-6 w-1/3 bg-muted/60 rounded" />
        <div className="h-6 w-1/6 bg-muted/60 rounded" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <div className="h-8 w-1/4 bg-muted/50 rounded animate-pulse" />
          <div className="h-8 w-1/3 bg-muted/50 rounded animate-pulse" />
          <div className="h-8 w-1/6 bg-muted/50 rounded animate-pulse" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonStats() {
  return (
    <div className="grid grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-3">
          <div className="h-4 w-16 bg-muted/60 rounded" />
          <div className="h-8 w-24 bg-muted/70 rounded" />
          <div className="h-3 w-12 bg-muted/50 rounded" />
        </div>
      ))}
    </div>
  )
}