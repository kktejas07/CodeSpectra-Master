/**
 * Platform sign-up / sign-in switches from Admin → Settings (audit A-025 / A-052):
 *   allow_registration          — off: no new accounts (email or Google/GitHub),
 *                                 except a candidate holding a valid assessment invite.
 *   maintenance_mode            — on: only platform admins (superadmin) can sign in or
 *                                 open signed-in pages; everyone else (tenant admins
 *                                 included — they are customers) sees /maintenance.
 *   require_email_verification  — on (the default since SEC-006): email/password
 *                                 accounts must click the link before they can sign in.
 *                                 Safe migration: only accounts created with the
 *                                 `email_verification_required: true` marker (every
 *                                 signup from now on) are held back. Legacy accounts
 *                                 (no marker / no emailVerified field) keep signing in;
 *                                 their unverified state still blocks Google/GitHub
 *                                 linking (lib/auth-linking.ts).
 * The decisions are pure (unit tested); routes load settings via getGeneralSettingsCached.
 */
import type { GeneralPlatformSettings } from '@/lib/platform-general-settings'

type Policy = Pick<GeneralPlatformSettings, 'allow_registration' | 'maintenance_mode' | 'require_email_verification'>

/** Roles that keep working during maintenance (platform admins). */
export function isMaintenanceBypassRole(role: unknown): boolean {
  return typeof role === 'string' && role.toLowerCase().trim() === 'superadmin'
}

export type PolicyBlock = { status: number; error: string; code: 'registration_closed' | 'maintenance' | 'email_unverified' }

export function registrationBlock(s: Policy, opts: { invited?: boolean } = {}): PolicyBlock | null {
  if (s.maintenance_mode) {
    return { status: 503, code: 'maintenance', error: 'We’re doing some maintenance right now. Please try again a little later.' }
  }
  if (!s.allow_registration && !opts.invited) {
    return { status: 403, code: 'registration_closed', error: 'New sign-ups are closed right now. If you were invited, use the link in your invitation email.' }
  }
  return null
}

export function signInBlock(
  s: Policy,
  user: { role?: unknown; emailVerified?: unknown; email_verification_required?: unknown },
  opts: { method?: 'password' | 'oauth' | 'face' | 'mobile' } = {},
): PolicyBlock | null {
  if (s.maintenance_mode && !isMaintenanceBypassRole(user.role)) {
    return { status: 503, code: 'maintenance', error: 'We’re doing some maintenance right now. Please try again a little later.' }
  }
  if (
    s.require_email_verification &&
    user.emailVerified === false &&
    user.email_verification_required === true &&
    !isMaintenanceBypassRole(user.role)
  ) {
    return {
      status: 403,
      code: 'email_unverified',
      error: 'Verify your email address first — we sent you a link. Didn’t get it? Use “Forgot password” to get a fresh link.',
    }
  }
  return null
}

/** Whether a page request should be shown the maintenance page instead. */
export function maintenanceBlocksPage(s: Pick<Policy, 'maintenance_mode'>, role: unknown): boolean {
  return s.maintenance_mode === true && !isMaintenanceBypassRole(role)
}
