import { GuardianUnsubscribeView } from './unsubscribe-view'

/** /guardian/unsubscribe?l=…&t=… — stop weekly reports (link from every report email). */
export default async function GuardianUnsubscribePage({ searchParams }: { searchParams: Promise<{ l?: string; t?: string }> }) {
  const { l, t } = await searchParams
  return <GuardianUnsubscribeView linkId={typeof l === 'string' ? l : ''} token={typeof t === 'string' ? t : ''} />
}
