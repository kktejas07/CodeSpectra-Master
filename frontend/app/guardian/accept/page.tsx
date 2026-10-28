import { GuardianAcceptView } from './accept-view'

/** /guardian/accept?token=… — a guardian accepts (or declines) a learner's weekly-report invite. */
export default async function GuardianAcceptPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  return <GuardianAcceptView token={typeof token === 'string' ? token : ''} />
}
