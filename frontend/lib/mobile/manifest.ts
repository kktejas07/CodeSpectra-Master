/**
 * Mobile bootstrap manifest (pure, client-safe).
 *
 * The app shell renders NOTHING from compiled-in policy: tabs are selected
 * here from the caller's role + DB denied list (same sources as web —
 * page-permissions.ts role maps and /api/user/my-permissions), and theme
 * tokens are snapshots of globals.css variables served as data.
 *
 * Catalog entries (id/label/icon/route) are a closed registry — lookup, not
 * policy. Visibility is decided solely by minRole + denied filtering below.
 */
import type { UserRole } from '@/lib/types/rbac-types'

export type MobileRole = UserRole

export interface MobileTabDef {
  id: string
  label: string
  /** Closed icon registry key — client maps to a lucide component. */
  icon: string
  /** In-app route (Expo Router path). */
  route: string
  /** Web route this tab mirrors — used for DB denied-list filtering. */
  webRoute: string
  minRole: MobileRole
}

export interface MobileTab extends MobileTabDef {
  badge: number | null
}

export interface MobileThemeTokens {
  mode: 'dark' | 'light'
  primary: string
  background: string
  card: string
  text: string
  muted: string
  border: string
}

export interface BootstrapUser {
  id: string
  email: string
  name: string | null
  role: MobileRole
  tenantId?: string | null
}

export interface BootstrapDoc {
  user: BootstrapUser
  tabs: MobileTab[]
  theme: MobileThemeTokens
  flags: { faceEnrollmentRequired: boolean; maintenanceMode: boolean }
}

const ROLE_RANK: Record<MobileRole, number> = {
  user: 0,
  judge: 1,
  tenant_admin: 2,
  superadmin: 3,
}

/** Full tab catalog. Order = tab bar order for roles that see them all. */
export const MOBILE_TAB_CATALOG: MobileTabDef[] = [
  { id: 'home', label: 'Home', icon: 'home', route: '/(tabs)/home', webRoute: '/dashboard', minRole: 'user' },
  { id: 'problems', label: 'Problems', icon: 'code-2', route: '/(tabs)/problems', webRoute: '/dashboard/problems', minRole: 'user' },
  { id: 'courses', label: 'Courses', icon: 'book-open', route: '/(tabs)/courses', webRoute: '/dashboard/courses', minRole: 'user' },
  { id: 'assessments', label: 'Assess', icon: 'clipboard-list', route: '/(tabs)/assessments', webRoute: '/dashboard/assessments', minRole: 'user' },
  { id: 'leaderboard', label: 'Ranks', icon: 'trophy', route: '/(tabs)/leaderboard', webRoute: '/dashboard/leaderboard', minRole: 'user' },
  { id: 'judge', label: 'Judge', icon: 'gavel', route: '/(tabs)/judge', webRoute: '/dashboard/events', minRole: 'judge' },
  { id: 'admin', label: 'Admin', icon: 'shield', route: '/(tabs)/admin', webRoute: '/dashboard/admin', minRole: 'superadmin' },
  { id: 'profile', label: 'Profile', icon: 'user', route: '/(tabs)/profile', webRoute: '/dashboard/profile', minRole: 'user' },
]

/**
 * Theme snapshots of globals.css design tokens (hsl → hex, dark first —
 * the app is dark-first like web). Served as data so a web rebrand flows
 * to mobile; the client falls back to these when offline.
 */
export const MOBILE_THEMES: Record<'dark' | 'light', MobileThemeTokens> = {
  dark: {
    mode: 'dark',
    primary: '#00D681',
    background: '#080D17',
    card: '#0E1626',
    text: '#F1F5F9',
    muted: '#94A3B8',
    border: '#1E293B',
  },
  light: {
    mode: 'light',
    primary: '#00C777',
    background: '#FAFCFB',
    card: '#FFFFFF',
    text: '#0F172A',
    muted: '#64748B',
    border: '#E2E8F0',
  },
}

/**
 * Select visible tabs for a role, minus DB-denied web routes.
 * Denied entries match by exact webRoute (same granularity as the
 * permissions UI, which toggles per-page read access).
 */
export function buildTabs(
  role: MobileRole,
  denied: string[] = [],
  badges: Record<string, number> = {},
): MobileTab[] {
  const rank = ROLE_RANK[role] ?? 0
  const deniedSet = new Set(denied)
  return MOBILE_TAB_CATALOG.filter(
    (t) => ROLE_RANK[t.minRole] <= rank && !deniedSet.has(t.webRoute),
  ).map((t) => ({ ...t, badge: badges[t.id] ?? null }))
}

export function buildBootstrap(args: {
  user: BootstrapUser
  denied?: string[]
  badges?: Record<string, number>
  mode?: 'dark' | 'light'
  faceEnrollmentRequired?: boolean
  maintenanceMode?: boolean
}): BootstrapDoc {
  const mode = args.mode ?? 'dark'
  return {
    user: args.user,
    tabs: buildTabs(args.user.role, args.denied ?? [], args.badges ?? {}),
    theme: MOBILE_THEMES[mode],
    flags: {
      faceEnrollmentRequired: args.faceEnrollmentRequired ?? false,
      maintenanceMode: args.maintenanceMode ?? false,
    },
  }
}
