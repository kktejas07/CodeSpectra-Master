/** League collections + indexes (server only). */
import 'server-only'
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { logger } from '@/lib/logger'
import type { BadgeDoc, LeagueTeamDoc, SeasonDoc } from './types'
import type { CollegeRow, IndividualRow, TeamRow } from './points'

export interface SnapshotDoc {
  season_id: string
  computed_at: string
  final: boolean
  events: number
  individual: Array<IndividualRow & { name: string }>
  colleges: Array<CollegeRow & { name: string; slug: string | null }>
  teams: Array<TeamRow & { name: string; slug: string; college_id: string | null; members: number }>
}

let indexes: Promise<void> | null = null

async function ensureIndexes(db: Db): Promise<void> {
  if (!indexes) {
    indexes = (async () => {
      await Promise.all([
        db.collection('league_seasons').createIndex({ id: 1 }, { unique: true, name: 'ls_id' }),
        db.collection('league_seasons').createIndex({ slug: 1 }, { unique: true, name: 'ls_slug' }),
        db.collection('league_seasons').createIndex({ status: 1, starts_at: -1 }, { name: 'ls_status' }),
        db.collection('league_teams').createIndex({ id: 1 }, { unique: true, name: 'lt_id' }),
        db.collection('league_teams').createIndex({ season_id: 1, slug: 1 }, { unique: true, name: 'lt_season_slug' }),
        db.collection('league_teams').createIndex({ season_id: 1, member_ids: 1 }, { name: 'lt_season_member' }),
        db.collection('league_teams').createIndex({ join_code_hash: 1 }, { name: 'lt_code' }),
        db.collection('league_snapshots').createIndex({ season_id: 1 }, { unique: true, name: 'lsn_season' }),
        db.collection('league_badges').createIndex({ season_id: 1, subject: 1, subject_id: 1, user_id: 1 }, { unique: true, name: 'lb_unique' }),
        db.collection('league_badges').createIndex({ user_id: 1, awarded_at: -1 }, { name: 'lb_user' }),
      ])
    })().catch((e) => {
      indexes = null
      logger.error('[leagues] index build failed', (e as Error).message)
    })
  }
  await indexes
}

async function col<T extends object>(name: string): Promise<Collection<T>> {
  const db = await getMongoDb()
  await ensureIndexes(db)
  return db.collection<T>(name)
}

export const seasonsCol = () => col<SeasonDoc>('league_seasons')
export const teamsCol = () => col<LeagueTeamDoc>('league_teams')
export const snapshotsCol = () => col<SnapshotDoc>('league_snapshots')
export const badgesCol = () => col<BadgeDoc>('league_badges')
