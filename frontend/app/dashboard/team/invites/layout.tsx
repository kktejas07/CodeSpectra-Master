import { privateMetadata } from '@/lib/seo/metadata'

// SEO-051: personal team invitation links (/dashboard/team/invites/<token>) are
// public so invitees can open them signed out, and they show the org name and
// invitee email. noindex,nofollow + no-referrer like every other token page.
export const metadata = privateMetadata('Team invitation')

export default function TeamInvitesLayout({ children }: { children: React.ReactNode }) {
  return children
}
