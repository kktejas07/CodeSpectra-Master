/**
 * Signed-in app areas (learner / recruiter / college pages under /dashboard).
 * Each area has its own catalog namespace. Unlike the base namespaces in
 * ./catalog.ts, their English is NOT in the client bundle: the server loads
 * the area's catalog (English or the user's language) in the area's layout
 * (components/i18n/area-i18n.tsx) and hands it to the provider, so a page only
 * ships the strings of the area it belongs to.
 *
 * `exam` is the exception: test-taking components also render on cached public
 * pages (contests, shared interview reports) with no provider, so its English
 * is bundled (see EN_MESSAGES in ./catalog.ts).
 */
import type dash from './messages/en/dash.json'
import type practice from './messages/en/practice.json'
import type compete from './messages/en/compete.json'
import type learning from './messages/en/learning.json'
import type account from './messages/en/account.json'
import type career from './messages/en/career.json'
import type market from './messages/en/market.json'
import type hiring from './messages/en/hiring.json'
import type tools from './messages/en/tools.json'
import type community from './messages/en/community.json'

export const AREA_NAMESPACES = ['dash', 'practice', 'compete', 'learning', 'account', 'career', 'market', 'hiring', 'tools', 'community'] as const
export type AreaNamespace = (typeof AREA_NAMESPACES)[number]

/** Type-only view of the area catalogs (for MessageKey); nothing is bundled. */
export interface AreaEnMessages {
  dash: typeof dash
  practice: typeof practice
  compete: typeof compete
  learning: typeof learning
  account: typeof account
  career: typeof career
  market: typeof market
  hiring: typeof hiring
  tools: typeof tools
  community: typeof community
}

/** Namespaces this wave added (completeness + hard-coded-text tests). */
export const APP_NAMESPACES = [...AREA_NAMESPACES, 'exam'] as const
