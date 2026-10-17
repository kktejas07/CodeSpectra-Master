/**
 * Set-password links for accounts an admin creates without a password, and
 * admin "send reset" / "resend credentials". Same token scheme as
 * forgot-password (raw token emailed, sha256 stored) and the same page:
 * /auth/reset-password?code=…  (the old /reset-password link was a 404).
 */
import crypto from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.ai').replace(/\/+$/, '')
}

export function resetPasswordUrl(token: string): string {
  return `${appUrl()}/auth/reset-password?code=${encodeURIComponent(token)}`
}

/** Store a fresh reset token on the user (by Mongo `_id`) and return the link. */
export async function issuePasswordSetupLink(userMongoId: unknown, validHours = 1): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex')
  const hashed = crypto.createHash('sha256').update(token).digest('hex')
  const db = await getMongoDb()
  await db.collection('user').updateOne(
    { _id: userMongoId } as never,
    {
      $set: {
        reset_token_hash: hashed,
        reset_token_expires: new Date(Date.now() + validHours * 3600_000).toISOString(),
        reset_token_used: false,
      },
    },
  )
  return resetPasswordUrl(token)
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

/** "Your account is ready — set your password" (the shared credentials template assumes a password was handed over). */
export function accountSetupEmail(p: { name: string; orgName: string; role: string; setupUrl: string; validHours: number }) {
  const days = p.validHours >= 48 ? `${Math.round(p.validHours / 24)} days` : `${p.validHours} hours`
  return {
    subject: `Your ${p.orgName} account is ready — CodeSpectra`,
    html: `<div style="background:#f3f4f6;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px">
<h1 style="font-size:20px;margin:0 0 12px;font-weight:700;color:#111827">Welcome to CodeSpectra, ${esc(p.name)}</h1>
<p style="margin:0 0 16px;color:#6b7280;font-size:14px">An account has been created for you on <strong>${esc(p.orgName)}</strong> as <strong>${esc(p.role)}</strong>. Set your password to sign in.</p>
<p style="margin:24px 0"><a href="${esc(p.setupUrl)}" style="display:inline-block;background:#16a34a;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Set your password</a></p>
<p style="margin:0;color:#6b7280;font-size:13px">This link works once and expires in ${days}. If it expires, use “Forgot password” on the sign-in page.</p>
</div></div>`,
  }
}
