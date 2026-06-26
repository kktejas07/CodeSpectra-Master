'use client'

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
import {
  Loader2,
  ShieldCheck,
  Trophy,
  Sparkles,
  ScanLine,
  ArrowRight,
  Users,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type Variant = 'user' | 'admin' | 'tenant' | 'recruiter'

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
    members: Array<{ name: string; role: 'captain' | 'member' }>
    created_at: string
  }
  hackathon: { id: string; name: string; slug: string; status: string; ends_at: string } | null
}

type ScanResp = UserResp | TeamResp

const VARIANT_GRADIENT: Record<string, string> = {
  user: 'from-emerald-500/30 via-emerald-500/5 to-transparent',
  admin: 'from-fuchsia-500/30 via-fuchsia-500/5 to-transparent',
  tenant: 'from-sky-500/30 via-sky-500/5 to-transparent',
  recruiter: 'from-amber-500/30 via-amber-500/5 to-transparent',
}

const VARIANT_RING: Record<string, string> = {
  user: 'ring-emerald-500/60',
  admin: 'ring-fuchsia-500/60',
  tenant: 'ring-sky-500/60',
  recruiter: 'ring-amber-500/60',
}

export default function QrScanPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)
  const [data, setData] = useState<ScanResp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<number>(0)

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
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Resolving QR…
      </div>
    )
  }

  if (error || !data) {
    const isRevoked = status === 410
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="max-w-md space-y-3 rounded-2xl border border-border bg-card p-8 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="text-xl font-bold">
            {isRevoked ? 'This QR has been revoked' : 'QR not recognised'}
          </h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Link href="/" className="text-sm text-primary hover:underline">
            ← Back to CodeSpectra
          </Link>
        </div>
      </div>
    )
  }

  const accentClass = VARIANT_GRADIENT[data.role_variant] || VARIANT_GRADIENT.user
  const ringClass = VARIANT_RING[data.role_variant] || VARIANT_RING.user

  return (
    <div className="min-h-screen bg-background" data-testid="qr-scan-page">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-gradient-to-br ${accentClass}`}
      />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-6 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs uppercase tracking-wider text-muted-foreground">
            <ScanLine className="h-3 w-3" /> Scanned
          </span>
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
            CodeSpectra ↗
          </Link>
        </div>

        {data.kind === 'user' ? (
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
      className={`overflow-hidden rounded-3xl bg-card p-8 ring-2 ${ringClass} shadow-xl`}
      data-testid="qr-user-card"
    >
      <header className="mb-6 flex items-start gap-4">
        <img
          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(u.email || u.id)}`}
          alt=""
          className="h-20 w-20 rounded-2xl border-4 border-border/60"
        />
        <div className="flex-1 space-y-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {data.theme.label} ID
          </p>
          <h1 className="text-2xl font-bold" data-testid="qr-user-name">
            {u.name}
          </h1>
          <p className="text-sm text-muted-foreground">{u.email}</p>
        </div>
        <Badge variant="outline" className="uppercase">
          {u.role}
        </Badge>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={<Trophy className="h-4 w-4" />} label="XP" value={u.xp.toLocaleString()} />
        <Stat icon={<Sparkles className="h-4 w-4" />} label="Level" value={`Lv ${u.level}`} />
        <Stat icon={<ShieldCheck className="h-4 w-4" />} label="Solved" value={u.solved} />
      </div>

      <p className="mt-5 text-xs text-muted-foreground">
        Member since {new Date(u.joined_at).toLocaleDateString()}
      </p>

      <Link href={data.dashboard_url} className="mt-6 block">
        <Button className="w-full" data-testid="qr-open-dashboard">
          Open {data.theme.label} dashboard <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </Link>
    </article>
  )
}

function TeamCard({ data, ringClass }: { data: TeamResp; ringClass: string }) {
  const t = data.team
  const ends = data.hackathon?.ends_at ? new Date(data.hackathon.ends_at) : null
  const live = data.hackathon?.status === 'live'

  return (
    <article
      className={`overflow-hidden rounded-3xl bg-card p-8 ring-2 ${ringClass} shadow-xl`}
      data-testid="qr-team-card"
    >
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {data.hackathon?.name || 'Hackathon team'}
        </p>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" data-testid="qr-team-name">
            {t.name}
          </h1>
          {data.hackathon?.status && (
            <Badge
              variant={live ? 'default' : 'secondary'}
              className="uppercase"
            >
              {data.hackathon.status}
            </Badge>
          )}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat icon={<Trophy className="h-4 w-4" />} label="XP" value={t.xp.toLocaleString()} />
        <Stat icon={<Sparkles className="h-4 w-4" />} label="Level" value={`Lv ${t.level}`} />
        <Stat icon={<Users className="h-4 w-4" />} label="Members" value={t.members.length} />
        <Stat icon={<ScanLine className="h-4 w-4" />} label="Submissions" value={t.submissions} />
      </div>

      {ends && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          Event ends {ends.toLocaleString()}
        </div>
      )}

      <div className="mt-6 space-y-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Roster</p>
        <ul className="space-y-1 text-sm">
          {t.members.map((m, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className={m.role === 'captain' ? 'text-primary' : ''}>{m.name}</span>
              <span className="text-[10px] uppercase text-muted-foreground">{m.role}</span>
            </li>
          ))}
        </ul>
      </div>

      {t.achievements.length > 0 && (
        <div className="mt-6 space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Achievements</p>
          <div className="flex flex-wrap gap-2">
            {t.achievements.map((a) => (
              <Badge key={a.id} variant="outline" className="gap-1">
                <Sparkles className="h-3 w-3" /> {a.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <Link href={data.dashboard_url} className="mt-6 block">
        <Button className="w-full" data-testid="qr-open-team-dashboard">
          Open team scoreboard <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </Link>
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
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )
}
