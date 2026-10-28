/**
 * Mentor collections with lazily built indexes.
 *
 *  mentor_profiles      MentorProfile — one per user (and per marketplace seller)
 *  mentor_session_meta  SessionMeta — per marketplace booking: attachment, reschedules, dispute
 */
import 'server-only'
import type { Collection, Document } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import type { MentorProfile, SessionMeta } from './types'

const ready = new Map<string, Promise<unknown> | null>()

function lazy<T extends Document>(name: string, build: (c: Collection<T>) => Promise<unknown>) {
  return async (): Promise<Collection<T>> => {
    const col = (await getMongoDb()).collection<T>(name)
    if (!ready.get(name)) {
      ready.set(name, build(col).catch((e) => {
        ready.set(name, null)
        console.error(`[mentors] ${name} index build failed`, (e as Error)?.message)
      }))
    }
    await ready.get(name)
    return col
  }
}

export const mentorProfilesCol = lazy<MentorProfile>('mentor_profiles', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'mentor_profiles_id' }),
  c.createIndex({ user_id: 1 }, { unique: true, name: 'mentor_profiles_user' }),
  c.createIndex({ seller_id: 1 }, { unique: true, name: 'mentor_profiles_seller' }),
  c.createIndex({ slug: 1 }, { unique: true, name: 'mentor_profiles_slug' }),
  c.createIndex({ listed: 1, status: 1, updated_at: -1 }, { name: 'mentor_profiles_listed' }),
  c.createIndex({ status: 1, created_at: -1 }, { name: 'mentor_profiles_status' }),
]))

export const sessionMetaCol = lazy<SessionMeta>('mentor_session_meta', (c) => Promise.all([
  c.createIndex({ booking_id: 1 }, { unique: true, name: 'mentor_session_booking' }),
  c.createIndex({ seller_id: 1, created_at: -1 }, { name: 'mentor_session_seller' }),
  c.createIndex({ buyer_id: 1, created_at: -1 }, { name: 'mentor_session_buyer' }),
]))
