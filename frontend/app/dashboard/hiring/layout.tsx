import { redirect } from 'next/navigation'
import { getAPIUser } from '@/lib/route-auth'
import { atsMembers, listMyMemberships } from '@/lib/ats/access'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Server gate for /dashboard/hiring/**: only hiring-team members (any ATS role),
 * tenant admins and superadmins get in. Everyone else sees a friendly page
 * (the proxy already let them through as signed-in users). Per-tenant role
 * checks happen in each page's API via requireAts.
 */
export default async function HiringLayout({ children }: { children: React.ReactNode }) {
  const user = await getAPIUser()
  if (!user) redirect('/auth/login?redirectTo=/dashboard/hiring')
  if (user.role === 'superadmin') return <>{children}</>

  let memberships: Awaited<ReturnType<typeof listMyMemberships>> = []
  let pendingInvite = false
  try {
    memberships = await listMyMemberships(user)
    if (!memberships.length && user.email) {
      pendingInvite = !!(await (await atsMembers()).findOne({ email: user.email.toLowerCase(), status: 'invited' }, { projection: { id: 1 } }))
    }
  } catch (e) {
    console.error('[hiring/layout] membership check failed:', e)
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState illustration="error" title="We couldn't check your hiring access" description="Please refresh the page in a moment." actionLabel="Back to dashboard" actionHref="/dashboard" />
      </div>
    )
  }

  if (!memberships.length) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState
          illustration="team"
          title="You're not on a hiring team yet"
          description={
            pendingInvite
              ? "You've been invited to a hiring team. Open the invite link in your email to join — it's sent to " + user.email + '.'
              : 'Hiring is for recruiters, interviewers and clients that an organization adds to its team. Ask your organization admin to invite you.'
          }
          actionLabel="Back to dashboard"
          actionHref="/dashboard"
        />
      </div>
    )
  }
  return <>{children}</>
}
