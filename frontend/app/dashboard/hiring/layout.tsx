import { redirect } from 'next/navigation'
import { getAPIUser } from '@/lib/route-auth'
import { atsMembers, listMyMemberships } from '@/lib/ats/access'
import { EmptyState } from '@/components/ui/empty-state'
import { getAreaI18n } from '@/lib/i18n/area-server'
import { AreaI18n } from '@/components/i18n/area-i18n'

/**
 * Server gate for /dashboard/hiring/**: only hiring-team members (any ATS role),
 * tenant admins and superadmins get in. Everyone else sees a friendly page
 * (the proxy already let them through as signed-in users). Per-tenant role
 * checks happen in each page's API via requireAts.
 */
export default function HiringLayout({ children }: { children: React.ReactNode }) {
  return <AreaI18n ns={['hiring']}><HiringGate>{children}</HiringGate></AreaI18n>
}

async function HiringGate({ children }: { children: React.ReactNode }) {
  const { t } = await getAreaI18n()
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
        <EmptyState illustration="error" title={t('hiring.weCouldntCheckYourHiringAccess')} description={t('hiring.pleaseRefreshThePageInA615')} actionLabel={t('hiring.backToDashboard')} actionHref="/dashboard" />
      </div>
    )
  }

  if (!memberships.length) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState
          illustration="team"
          title={t('hiring.youreNotOnAHiringTeam957')}
          description={
            pendingInvite
              ? t('hiring.youveBeenInvitedToAHiringec7', { email: user.email })
              : t('hiring.hiringIsForRecruitersInterviewersAndc6a')
          }
          actionLabel={t('hiring.backToDashboard')}
          actionHref="/dashboard"
        />
      </div>
    )
  }
  return <>{children}</>
}
