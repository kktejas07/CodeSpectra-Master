import { redirect } from 'next/navigation'

// Keep the query (e.g. ?error= from the SSO callback, ?redirect=) when forwarding.
export default async function LoginRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(v) ? v : v === undefined ? [] : [v]) params.append(k, item)
  }
  const qs = params.toString()
  redirect(qs ? `/auth/login?${qs}` : '/auth/login')
}
