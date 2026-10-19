import { PublicPageWrapper } from '@/app/public-layout'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Route-level loading UI for data-backed public pages (blog, jobs, events,
 * marketplace, learn, …). Keeps the real header/footer so nothing jumps when
 * the page streams in.
 */
export function PublicPageSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <PublicPageWrapper>
      <div role="status" aria-live="polite" className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <span className="sr-only">Loading…</span>
        <Skeleton className="h-4 w-28 rounded-full" />
        <Skeleton className="mt-4 h-10 w-full max-w-xl" />
        <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
        <Skeleton className="mt-2 h-4 w-2/3 max-w-lg" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border p-5">
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="mt-4 h-5 w-3/4" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </PublicPageWrapper>
  )
}
