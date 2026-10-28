import { notFound } from 'next/navigation'

// Any /hi/… or /te/… path without a translated page: the localized 404
// (app/[lang]/not-found.tsx). Not a marketing path, so it gets the nonce CSP
// and must render per request.
export const dynamic = 'force-dynamic'

export default function LocalizedCatchAll() {
  notFound()
}
