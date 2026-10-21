/**
 * PUT /api/user/locale — { locale: 'en' | 'hi' | 'te' }.
 * Always sets the `cs_locale` cookie (works signed out, e.g. on the sign-in
 * page); when signed in it also saves `ui_locale` on the profile so the choice
 * follows the account to other devices. GET returns the effective locale.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAPIUser } from '@/lib/route-auth'
import { LOCALES, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '@/lib/i18n/config'

export const dynamic = 'force-dynamic'

const Body = z.object({ locale: z.enum(LOCALES) })

export async function GET() {
  const { getRequestLocale } = await import('@/lib/i18n/server')
  return NextResponse.json({ locale: await getRequestLocale() })
}

export async function PUT(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Choose English, Hindi or Telugu.', code: 'locale_invalid' }, { status: 400 })
  const { locale } = parsed.data
  const user = await getAPIUser()
  if (user) {
    try {
      const { users } = await import('@/lib/db/admin')
      const { ObjectId } = await import('mongodb')
      const { invalidateAuthProfile } = await import('@/lib/session')
      const or: Record<string, unknown>[] = [{ id: user.id }, { _id: user.id }]
      if (ObjectId.isValid(user.id) && /^[0-9a-f]{24}$/i.test(user.id)) or.push({ _id: new ObjectId(user.id) })
      await (await users()).updateOne({ $or: or } as never, { $set: { ui_locale: locale, updatedAt: new Date() } })
      invalidateAuthProfile(user.id)
    } catch (e) {
      console.error('[user/locale] save failed:', (e as Error).message)
      return NextResponse.json({ error: 'Your language couldn’t be saved. Try again.', code: 'locale_save_failed' }, { status: 500 })
    }
  }
  const res = NextResponse.json({ ok: true, locale, saved: !!user })
  res.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false,
  })
  return res
}
