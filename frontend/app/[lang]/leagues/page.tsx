import { LeaguesView, leaguesMetadata, type LeaguesSP } from '@/app/leagues/leagues-view'
import { langOf, type LangParams } from '@/lib/i18n/public-page'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: LangParams }) {
  return leaguesMetadata(await langOf(params))
}

export default async function Page({ params, searchParams }: { params: LangParams; searchParams: LeaguesSP }) {
  return <LeaguesView searchParams={searchParams} locale={await langOf(params)} />
}
