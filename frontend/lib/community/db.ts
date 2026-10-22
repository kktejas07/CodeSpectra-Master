/**
 * Community collections (indexes built lazily):
 *  community_categories, community_threads, community_replies, community_votes,
 *  community_follows, community_reports, community_profiles, community_rep_events,
 *  community_groups, community_group_members, community_group_messages,
 *  community_settings, community_ai_usage
 */
import 'server-only'
import { lazyCollection } from './lazy'
import type { CategoryKind, CommunitySettings, ContentLang, ReportReason, ThreadKind } from './pure'

export type PostStatus = 'visible' | 'pending' | 'hidden' | 'removed'

export interface CategoryDoc {
  id: string
  slug: string
  name: string
  description: string
  kind: CategoryKind
  /** course id, cohort id or company slug */
  ref_id: string | null
  /** Cohort categories: only the cohort's members and staff can read or post. */
  members_only: boolean
  order: number
  locked: boolean
  thread_count: number
  created_at: string
}

export interface ThreadDoc {
  id: string
  category_id: string
  kind: ThreadKind
  problem_id: string | null
  problem_title: string | null
  title: string
  body: string
  lang: ContentLang
  tags: string[]
  author_id: string
  author_name: string
  status: PostStatus
  moderation: { reasons: string[]; ai?: string | null } | null
  locked: boolean
  pinned: boolean
  score: number
  reply_count: number
  accepted_reply_id: string | null
  hash: string
  last_activity_at: string
  created_at: string
  updated_at: string
}

export interface ReplyDoc {
  id: string
  thread_id: string
  body: string
  lang: ContentLang
  author_id: string
  author_name: string
  status: PostStatus
  moderation: { reasons: string[]; ai?: string | null } | null
  score: number
  accepted: boolean
  hash: string
  created_at: string
  updated_at: string
}

export interface VoteDoc { target_type: 'thread' | 'reply'; target_id: string; user_id: string; value: 1 | -1; created_at: string }
export interface FollowDoc { thread_id: string; user_id: string; created_at: string }

export interface ReportDoc {
  id: string
  target_type: 'thread' | 'reply' | 'message'
  target_id: string
  thread_id: string | null
  group_id: string | null
  reporter_id: string
  reason: ReportReason
  note: string
  status: 'open' | 'resolved'
  action: string | null
  resolved_by: string | null
  created_at: string
  resolved_at: string | null
}

export interface ProfileDoc {
  user_id: string
  name: string
  reputation: number
  posts: number
  moderator: boolean
  banned_until: string | null
  created_at: string
  updated_at: string
}

export interface RepEventDoc { key: string; user_id: string; points: number; reason: string; ref: string; xp: number; day: string; created_at: string }

export interface GroupDoc {
  id: string
  name: string
  goal: string
  description: string
  owner_id: string
  member_count: number
  max_members: number
  visibility: 'public' | 'private'
  join_code: string | null
  target_date: string | null
  last_message_at: string | null
  created_at: string
  updated_at: string
}

export interface GroupMemberDoc { group_id: string; user_id: string; name: string; role: 'owner' | 'member'; joined_at: string; last_read_at: string | null }

export interface GroupMessageDoc { id: string; group_id: string; author_id: string; author_name: string; body: string; status: PostStatus; created_at: string }

export interface SettingsDoc extends CommunitySettings { key: 'settings'; updated_at: string; updated_by: string }

export interface AiUsageDoc { day: string; month: string; count: number; cost_usd: number }

export const categoriesCol = lazyCollection<CategoryDoc>('community_categories', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'cc_id' }),
  c.createIndex({ slug: 1 }, { unique: true, name: 'cc_slug' }),
  c.createIndex({ kind: 1, ref_id: 1 }, { name: 'cc_ref' }),
]))

export const threadsCol = lazyCollection<ThreadDoc>('community_threads', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'ct_id' }),
  c.createIndex({ category_id: 1, status: 1, pinned: -1, last_activity_at: -1 }, { name: 'ct_list' }),
  c.createIndex({ status: 1, last_activity_at: -1 }, { name: 'ct_recent' }),
  c.createIndex({ problem_id: 1, kind: 1, status: 1 }, { name: 'ct_problem' }),
  c.createIndex({ author_id: 1, created_at: -1 }, { name: 'ct_author' }),
]))

export const repliesCol = lazyCollection<ReplyDoc>('community_replies', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'cr_id' }),
  c.createIndex({ thread_id: 1, status: 1, created_at: 1 }, { name: 'cr_thread' }),
  c.createIndex({ author_id: 1, created_at: -1 }, { name: 'cr_author' }),
]))

export const votesCol = lazyCollection<VoteDoc>('community_votes', (c) => Promise.all([
  c.createIndex({ target_type: 1, target_id: 1, user_id: 1 }, { unique: true, name: 'cv_unique' }),
  c.createIndex({ user_id: 1, target_id: 1 }, { name: 'cv_user' }),
]))

export const followsCol = lazyCollection<FollowDoc>('community_follows', (c) => Promise.all([
  c.createIndex({ thread_id: 1, user_id: 1 }, { unique: true, name: 'cf_unique' }),
  c.createIndex({ user_id: 1, created_at: -1 }, { name: 'cf_user' }),
]))

export const reportsCol = lazyCollection<ReportDoc>('community_reports', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'crp_id' }),
  c.createIndex({ status: 1, created_at: 1 }, { name: 'crp_queue' }),
  c.createIndex({ target_id: 1, reporter_id: 1 }, { unique: true, name: 'crp_once' }),
]))

export const profilesCol = lazyCollection<ProfileDoc>('community_profiles', (c) => Promise.all([
  c.createIndex({ user_id: 1 }, { unique: true, name: 'cpr_user' }),
  c.createIndex({ reputation: -1 }, { name: 'cpr_rep' }),
]))

export const repEventsCol = lazyCollection<RepEventDoc>('community_rep_events', (c) => Promise.all([
  c.createIndex({ key: 1 }, { unique: true, name: 'cre_key' }),
  c.createIndex({ user_id: 1, day: 1 }, { name: 'cre_user_day' }),
]))

export const groupsCol = lazyCollection<GroupDoc>('community_groups', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'cg_id' }),
  c.createIndex({ visibility: 1, updated_at: -1 }, { name: 'cg_list' }),
  c.createIndex({ join_code: 1 }, { unique: true, partialFilterExpression: { join_code: { $type: 'string' } }, name: 'cg_code' }),
]))

export const groupMembersCol = lazyCollection<GroupMemberDoc>('community_group_members', (c) => Promise.all([
  c.createIndex({ group_id: 1, user_id: 1 }, { unique: true, name: 'cgm_unique' }),
  c.createIndex({ user_id: 1 }, { name: 'cgm_user' }),
]))

export const groupMessagesCol = lazyCollection<GroupMessageDoc>('community_group_messages', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'cgmsg_id' }),
  c.createIndex({ group_id: 1, created_at: -1 }, { name: 'cgmsg_group' }),
]))

export const settingsCol = lazyCollection<SettingsDoc>('community_settings', (c) => c.createIndex({ key: 1 }, { unique: true, name: 'cs_key' }))

export const aiUsageCol = lazyCollection<AiUsageDoc>('community_ai_usage', (c) => Promise.all([
  c.createIndex({ day: 1 }, { unique: true, name: 'cai_day' }),
  c.createIndex({ month: 1 }, { name: 'cai_month' }),
]))
