import { redirect } from 'next/navigation'

// Legacy /dashboard/analytics route — merged into /dashboard/skill-analytics.
export default function LegacyAnalyticsRedirect() {
  redirect('/dashboard/skill-analytics')
}