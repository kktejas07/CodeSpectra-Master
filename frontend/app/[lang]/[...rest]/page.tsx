import { notFound } from 'next/navigation'

// Any /hi/… or /te/… path without a translated page: the localized 404 (app/[lang]/not-found.tsx).
export default function LocalizedCatchAll() {
  notFound()
}
