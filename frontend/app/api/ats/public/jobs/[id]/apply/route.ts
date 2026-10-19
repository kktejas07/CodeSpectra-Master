import { NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { getAPIUser } from '@/lib/route-auth'
import { atsJobs } from '@/lib/ats/db'
import { ApplyError, applyToJob } from '@/lib/ats/apply'
import { FileRejected, readResumeFile } from '@/lib/ats/files'
import { normEmail } from '@/lib/ats/intake'
import { idOk, json } from '@/lib/ats/http'
import { limitRequest } from '@/lib/rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { verifyTurnstileToken } from '@/lib/captcha/turnstile'
import type { AtsJob } from '@/lib/ats/contract'

export const runtime = 'nodejs'

const text = (f: FormData, k: string, n: number) => {
  const v = f.get(k)
  return typeof v === 'string' ? v.trim().slice(0, n) : ''
}
const num = (f: FormData, k: string, max: number): number | undefined => {
  const raw = text(f, k, 20).replace(/[,\s]/g, '')
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n) : undefined
}
const yes = (f: FormData, k: string) => ['true', 'on', '1', 'yes'].includes(text(f, k, 8).toLowerCase())

/**
 * POST /api/ats/public/jobs/[id]/apply (multipart)
 *   name, email, phone, country (ISO-2), location, cover_letter,
 *   notice_days, current_salary, expected_salary (annual, optional),
 *   consent_whatsapp, consent_calls, resume (file), captcha (Turnstile token),
 *   website (honeypot — must be empty).
 * Signed in: identity comes from the session; résumé falls back to the primary one.
 * Guests: email + phone + résumé required, captcha checked, rate limited per IP and email.
 */
export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const { id } = await params
  if (!idOk(id)) return json({ error: 'This job is no longer open' }, 404)
  const user = await getAPIUser()
  const limited = await limitRequest(req, 'ats-apply', user?.id ?? null, user ? 20 : 5, 10 * 60_000)
  if (limited) return limited
  try {
    const form = await req.formData().catch(() => null)
    if (!form) return json({ error: 'Send the application as a form' }, 400)
    // Honeypot: bots fill every field. Pretend success, store nothing.
    if (text(form, 'website', 200)) return json({ ok: true })

    const job = (await (await atsJobs()).findOne({ id, is_public: true, status: 'open' }, { projection: { _id: 0 } })) as AtsJob | null
    if (!job) return json({ error: 'This job is no longer open' }, 404)

    if (!user) {
      const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || undefined
      const cap = await verifyTurnstileToken(text(form, 'captcha', 4000) || null, ip)
      if (!cap.ok) return json({ error: 'Please complete the verification and try again', captcha_required: true }, 400)
      const email = normEmail(text(form, 'email', 254))
      if (email) {
        const rl = await rateLimitRedis(`ats-apply-email:${email}`, 5, 60 * 60_000)
        if (!rl.ok) return json({ error: 'Too many applications from this email. Try again later.' }, 429)
      }
    }

    let resume: { file_name: string; text: string } | null = null
    const file = form.get('resume')
    if (file && typeof file === 'object' && 'arrayBuffer' in file && (file as File).size > 0) {
      resume = await readResumeFile((file as File).name, new Uint8Array(await (file as File).arrayBuffer()))
    }

    const r = await applyToJob(job, {
      user: user ? { id: user.id, email: user.email, name: user.fullName || user.name } : null,
      name: text(form, 'name', 120),
      email: text(form, 'email', 254),
      phone: text(form, 'phone', 40),
      country: text(form, 'country', 2).toUpperCase() || null,
      location: text(form, 'location', 120) || null,
      cover_letter: text(form, 'cover_letter', 5000) || null,
      consent: { whatsapp: yes(form, 'consent_whatsapp'), calls: yes(form, 'consent_calls') },
      resume,
      overrides: {
        notice_days: num(form, 'notice_days', 365),
        current_salary: num(form, 'current_salary', 1e10),
        expected_salary: num(form, 'expected_salary', 1e10),
      },
    })
    // Guests get the same answer either way, so the form can't be used to probe who applied.
    if (!user) return json({ ok: true }, 201)
    return json({ ok: true, already_applied: !r.created }, r.created ? 201 : 200)
  } catch (e) {
    if (e instanceof ApplyError || e instanceof FileRejected) return json({ error: e.message }, e.status)
    console.error('[ats/apply] failed:', e)
    return json({ error: 'Could not submit your application. Try again.' }, 500)
  }
}
