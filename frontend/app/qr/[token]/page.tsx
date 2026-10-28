'use client'
import { formatDateTime, formatDate } from '@/lib/format-datetime'

/**
 * Public QR scan landing page.
 *
 * URL pattern: `/qr/{token}` — embedded inside every CodeSpectra QR code.
 * The page fetches `/api/qr/{token}` and renders a role-themed dashboard
 * preview for users, or a team scorecard for hackathon team QRs.
 *
 * No auth required to view; revoked tokens show a friendly 410 message.
 */
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Loader2,
  ShieldCheck,
  Trophy,
  Sparkles,
  ScanLine,
  ArrowRight,
  Users,
  Clock,
  LogIn,
  UserPlus,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePageGuard } from '@/lib/use-page-guard'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Panel } from '@/components/app/page-kit'
import { SoftGlow } from '@/components/visuals/stage'
import { Illustration } from '@/components/illustrations/spot'

type Variant = 'user' | 'admin' | 'tenant'

interface UserResp {
  kind: 'user'
  role_variant: Variant
  theme: { label: string; accent: string; dashboard: string }
  dashboard_url: string
  user: {
    id: string
    name: string
    email: string
    role: string
    xp: number
    level: number
    solved: number
    joined_at: string
  }
}

interface TeamResp {
  kind: 'team'
  role_variant: 'user'
  theme: { label: string; accent: string; dashboard: string }
  dashboard_url: string
  team: {
    id: string
    name: string
    slug: string
    xp: number
    level: number
    achievements: Array<{ id: string; name: string; awarded_at: string }>
    submissions: number
    members: Array<{ name: string; role: 'captain' | 'member'; user_id: string }>
    created_at: string
  }
  hackathon: { id: string; name: string; slug: string; status: string; ends_at: string } | null
}

type ScanResp = UserResp | TeamResp

const VARIANT_GRADIENT: Record<string, string> = {
  user: 'from-primary/20 via-primary/10 to-transparent',
  admin: 'from-primary/30 via-primary/15 to-transparent',
  tenant: 'from-muted via-muted/60 to-transparent',
}

const VARIANT_RING: Record<string, string> = {
  user: 'ring-primary/60',
  admin: 'ring-primary',
  tenant: 'ring-border',
}

export default function QrScanPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)
  const router = useRouter()
  const gate = usePageGuard('user')
  const { user: authUser } = useAuth()
  const [data, setData] = useState<ScanResp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<number>(0)

  const teamData = data?.kind === 'team' ? (data as TeamResp) : null
  const isMember = teamData && authUser?.uid
    ? teamData.team.members.some((m) => m.user_id === authUser.uid)
    : false

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const res = await fetch(`/api/qr/${encodeURIComponent(token)}`, { cache: 'no-store' })
        if (cancelled) return
        setStatus(res.status)
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || `Scan failed (${res.status})`)
        }
        setData((await res.json()) as ScanResp)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [token])

  if (!data && !error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Opening QR code…
      </div>
    )
  }

  if (!gate.allowed) {
    return (
      <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-background p-8">
        <SoftGlow />
        <Panel className="max-w-md space-y-3 p-8 text-center">
          <LogIn aria-hidden className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-xl font-semibold text-foreground">Sign in required</h1>
          <p className="text-sm text-muted-foreground">
            Please sign in to scan this QR code and view the content.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button className="w-full gap-2" asChild>
              <Link href={`/auth/login?redirect=${encodeURIComponent(`/qr/${token}`)}`}><LogIn className="h-4 w-4" /> Sign in</Link>
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/auth/signup">Create account</Link>
            </Button>
          </div>
          <Link href="/" className="text-sm text-primary hover:underline pt-2 block">
            ← Back to CodeSpectra
          </Link>
        </Panel>
      </div>
    )
  }

  if (error || !data) {
    const isRevoked = status === 410
    return (
      <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-background p-8">
        <SoftGlow />
        <Panel className="max-w-md space-y-3 p-8 text-center">
          <Illustration name={isRevoked ? 'locked' : 'error'} className="mx-auto w-40" />
          <h1 className="text-xl font-semibold text-foreground">
            {isRevoked ? 'This QR has been revoked' : 'QR not recognised'}
          </h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Link href="/" className="text-sm text-primary hover:underline">
            ← Back to CodeSpectra
          </Link>
        </Panel>
      </div>
    )
  }

  const accentClass = VARIANT_GRADIENT[data.role_variant] || VARIANT_GRADIENT.user
  const ringClass = VARIANT_RING[data.role_variant] || VARIANT_RING.user

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-background" data-testid="qr-scan-page">
      <SoftGlow className="h-[480px]" />
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => router.back()} className="rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              ← Back
            </button>
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <ScanLine aria-hidden className="h-3 w-3" /> Scanned
            </span>
          </div>
        </div>

        {data.kind === 'team' && !authUser?.uid ? (
          <article className="overflow-hidden rounded-3xl bg-card p-8 ring-2 ring-primary/40 shadow-sm dark:shadow-none">
            <p className="text-sm font-medium text-muted-foreground">
              {teamData?.hackathon?.name || 'Hackathon team'}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-foreground" data-testid="qr-team-name">
              {teamData!.team.name}
            </h1>
            {teamData?.hackathon?.status === 'live' || teamData?.hackathon?.status === 'closed' ? (
              <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
                <p className="text-sm font-medium">Event is {teamData.hackathon.status === 'live' ? 'in progress' : 'closed'}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {teamData.hackathon.status === 'live' ? 'You can\'t join while the event is running.' : 'You can\'t join because the event has ended.'}
                </p>
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm font-medium">Join this team to start competing</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sign in or create an account to register and access the hackathon problems.
                </p>
                <Button className="mt-3 w-full gap-2" asChild>
                  <Link href={`/auth/login?redirect=${encodeURIComponent(`/hackathons/${teamData!.hackathon?.slug}/join/${token}`)}`}>
                    <LogIn className="h-4 w-4" />
                    Sign in to join team
                  </Link>
                </Button>
                <Button variant="outline" className="mt-2 w-full gap-2" asChild>
                  <Link href={`/auth/signup?redirect=${encodeURIComponent(`/hackathons/${teamData!.hackathon?.slug}/join/${token}`)}`}>
                    Create account
                  </Link>
                </Button>
              </div>
            )}
          </article>
        ) : data.kind === 'team' && !isMember ? (
          <article className="overflow-hidden rounded-3xl bg-card p-8 ring-2 ring-amber-500/40 shadow-sm dark:shadow-none">
            <p className="text-sm font-medium text-muted-foreground">
              {teamData?.hackathon?.name || 'Hackathon team'}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{teamData!.team.name}</h1>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat icon={<Trophy className="h-4 w-4" />} label="XP" value={teamData!.team.xp.toLocaleString()} />
              <Stat icon={<Sparkles className="h-4 w-4" />} label="Level" value={`Lv ${teamData!.team.level}`} />
              <Stat icon={<Users className="h-4 w-4" />} label="Members" value={teamData!.team.members.length} />
              <Stat icon={<ScanLine className="h-4 w-4" />} label="Submissions" value={teamData!.team.submissions} />
            </div>
            {teamData?.hackathon?.ends_at && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Event ends {formatDateTime(teamData.hackathon.ends_at)}
              </div>
            )}
            {teamData?.hackathon?.status === 'live' || teamData?.hackathon?.status === 'closed' ? (
              <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
                <p className="text-sm font-medium">Event is {teamData.hackathon.status === 'live' ? 'in progress' : 'closed'}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {teamData.hackathon.status === 'live' ? 'You can\'t join while the event is running.' : 'You can\'t join because the event has ended.'}
                </p>
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-sm font-medium flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  You&apos;re not on this team yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Join this team to compete in the hackathon.
                </p>
                <Button className="mt-3 w-full gap-2" asChild>
                  <Link href={`/hackathons/${teamData!.hackathon?.slug}/join/${token}`}>
                    <UserPlus className="h-4 w-4" />
                    Join this team
                  </Link>
                </Button>
              </div>
            )}
          </article>
        ) : data.kind === 'user' ? (
          <UserCard data={data} ringClass={ringClass} />
        ) : (
          <TeamCard data={data} ringClass={ringClass} />
        )}
      </main>
    </div>
  )
}

function UserCard({ data, ringClass }: { data: UserResp; ringClass: string }) {
  const u = data.user
  return (
    <article
      className={`overflow-hidden rounded-3xl bg-card p-8 ring-2 ${ringClass} shadow-sm dark:shadow-none`}
      data-testid="qr-user-card"
    >
      <header className="mb-6 flex flex-wrap items-start gap-4">
        <UserAvatar
          seed={u.email || u.id}
          name={u.name}
          className="h-20 w-20 rounded-2xl border-4 border-border/60"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-muted-foreground">
            {data.theme.label} ID
          </p>
          <h1 className="text-2xl font-bold text-foreground" data-testid="qr-user-name">
            {u.name}
          </h1>
          <p className="truncate text-sm text-muted-foreground">{u.email}</p>
        </div>
        <Badge variant="outline" className="capitalize">
          {u.role}
        </Badge>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={<Trophy className="h-4 w-4" />} label="XP" value={u.xp.toLocaleString()} />
        <Stat icon={<Sparkles className="h-4 w-4" />} label="Level" value={`Lv ${u.level}`} />
        <Stat icon={<ShieldCheck className="h-4 w-4" />} label="Solved" value={u.solved} />
      </div>

      <p className="mt-5 text-xs text-muted-foreground">
        Member since {formatDate(u.joined_at)}
      </p>

      <Button className="w-full" data-testid="qr-open-dashboard" asChild>
        <Link href={data.dashboard_url} className="mt-6 block">
          Open {data.theme.label} dashboard <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </Button>
    </article>
  )
}

function TeamCard({ data, ringClass }: { data: TeamResp; ringClass: string }) {
  const t = data.team
  const ends = data.hackathon?.ends_at ? new Date(data.hackathon.ends_at) : null
  const live = data.hackathon?.status === 'live'

  return (
    <article
      className={`overflow-hidden rounded-3xl bg-card p-8 ring-2 ${ringClass} shadow-sm dark:shadow-none`}
      data-testid="qr-team-card"
    >
      <header className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">
          {data.hackathon?.name || 'Hackathon team'}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground" data-testid="qr-team-name">
            {t.name}
          </h1>
          {data.hackathon?.status && (
            <Badge
              variant={live ? 'default' : 'secondary'}
              className={live ? 'capitalize border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-400' : 'capitalize'}
            >
              {data.hackathon.status}
            </Badge>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={<Trophy className="h-4 w-4" />} label="XP" value={t.xp.toLocaleString()} />
        <Stat icon={<Sparkles className="h-4 w-4" />} label="Level" value={`Lv ${t.level}`} />
        <Stat icon={<Users className="h-4 w-4" />} label="Members" value={t.members.length} />
        <Stat icon={<ScanLine className="h-4 w-4" />} label="Submissions" value={t.submissions} />
      </div>

      {ends && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          Event ends {formatDateTime(ends)}
        </div>
      )}

      <div className="mt-6 space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Roster</p>
        <ul className="space-y-1 text-sm">
          {t.members.map((m, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className={m.role === 'captain' ? 'text-primary' : ''}>{m.name}</span>
              <span className="text-[11px] capitalize text-muted-foreground">{m.role}</span>
            </li>
          ))}
        </ul>
      </div>

      {t.achievements.length > 0 && (
        <div className="mt-6 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Achievements</p>
          <div className="flex flex-wrap gap-2">
            {t.achievements.map((a) => (
              <Badge key={a.id} variant="outline" className="gap-1">
                <Sparkles className="h-3 w-3" /> {a.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <Button className="w-full" data-testid="qr-open-team-dashboard" asChild>
        <Link href={data.dashboard_url} className="mt-6 block">
          Open team scoreboard <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </Button>
    </article>
  )
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/30 p-3">
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  )
}
