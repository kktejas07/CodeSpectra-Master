import { LeaguesView, type LeaguesSP } from './leagues-view'

// Metadata: ./layout.tsx. Hindi / Telugu: app/[lang]/leagues.
export const dynamic = 'force-dynamic'

export default function LeaguesPage({ searchParams }: { searchParams: LeaguesSP }) {
  return <LeaguesView searchParams={searchParams} locale="en" />
}
