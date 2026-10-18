'use client'

import { EmptyState } from '@/components/ui/empty-state'

/** Shown on admin event pages when the signed-in admin doesn't run this event (another organization's). */
export function NotEventStaff({ backHref = '/dashboard/admin/hackathons' }: { backHref?: string }) {
  return (
    <EmptyState
      illustration="locked"
      title="You can't manage this event"
      description="It belongs to another organization. You can manage events your organization created."
      actionLabel="Back to your events"
      actionHref={backHref}
    />
  )
}
