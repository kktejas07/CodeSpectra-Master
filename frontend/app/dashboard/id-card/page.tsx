'use client'

/**
 * /dashboard/id-card — personal QR ID card.
 *
 * Shows the signed-in user's role-themed ID card with embedded QR, level,
 * XP, achievements, and a download link. Tabs let the user preview each of
 * the 4 role variants (when their account role permits).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Loader2,
  Download,
  Sparkles,
  Trophy,
  ShieldCheck,
  IdCard,
  Copy,
  CheckCircle2,
} from 'lucide-react'

type Variant = 'user' | 'admin' | 'tenant' | 'recruiter'

interface IdCardResponse {
  token: string
  url: string
  qr_svg: string
  role_variant: Variant
  payload: {
    user_id: string
    name: string
    email: string
    role: string
    xp: number
    level: number
    solved: number
    achievements: string[]
  }
}

const VARIANTS: Array<{ key: Variant; label: string; ring: string; bg: string }> = [
  { key: 'user', label: 'Builder', ring: 'ring-emerald-500/60', bg: 'from-emerald-500/20' },
  { key: 'admin', label: 'Superadmin', ring: 'ring-fuchsia-500/60', bg: 'from-fuchsia-500/20' },
  { key: 'tenant', label: 'Tenant admin', ring: 'ring-sky-500/60', bg: 'from-sky-500/20' },
  { key: 'recruiter', label: 'Recruiter', ring: 'ring-amber-500/60', bg: 'from-amber-500/20' },
]

export default function IdCardPage() {
  const [variant, setVariant] = useState<Variant>('user')
  const [data, setData] = useState<IdCardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async (v: Variant) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/id-card?variant=${v}`, { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'failed to load')
      setData(j as IdCardResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(variant)
  }, [load, variant])

  const theme = useMemo(
    () => VARIANTS.find((v) => v.key === variant) || VARIANTS[0],
    [variant],
  )

  function downloadSvg() {
    if (!data) return
    const blob = new Blob([data.qr_svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `codespectra-${variant}-${data.token.slice(0, 8)}.svg`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function copyUrl() {
    if (!data) return
    void navigator.clipboard.writeText(data.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="space-y-6" data-testid="id-card-page">
      <header>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <IdCard className="h-7 w-7 text-primary" /> Your CodeSpectra ID card
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          One scannable identity. Print it on a lanyard, share the URL, or
          embed it in your résumé. Scanning resolves to a role-themed public
          dashboard with live XP/level data.
        </p>
      </header>

      <div className="flex flex-wrap gap-2" data-testid="id-card-variant-picker">
        {VARIANTS.map((v) => (
          <Button
            key={v.key}
            variant={variant === v.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setVariant(v.key)}
            data-testid={`id-card-variant-${v.key}`}
          >
            {v.label}
          </Button>
        ))}
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </Card>
      )}

      {loading && !data ? (
        <Card className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Building card…
        </Card>
      ) : data ? (
        <Card
          className={`relative overflow-hidden p-8 ring-2 ${theme.ring} shadow-xl`}
        >
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 -z-10 h-44 bg-gradient-to-br ${theme.bg} via-transparent to-transparent`}
          />
          <div className="grid gap-8 md:grid-cols-[260px_1fr]">
            <div className="space-y-3">
              <div
                className="rounded-2xl border border-border bg-white p-3"
                dangerouslySetInnerHTML={{ __html: data.qr_svg }}
              />
              <div className="flex gap-2">
                <Button onClick={downloadSvg} variant="outline" size="sm" className="flex-1" data-testid="id-card-download">
                  <Download className="mr-1 h-3 w-3" /> SVG
                </Button>
                <Button onClick={copyUrl} variant="outline" size="sm" className="flex-1" data-testid="id-card-copy-url">
                  {copied ? (
                    <>
                      <CheckCircle2 className="mr-1 h-3 w-3 text-primary" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3 w-3" /> URL
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Badge variant="outline" className="uppercase">
                  {theme.label} variant
                </Badge>
                <h2 className="mt-2 text-2xl font-bold" data-testid="id-card-name">
                  {data.payload.name || 'Unnamed builder'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {data.payload.email} ·{' '}
                  <span className="uppercase">{data.payload.role}</span>
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Stat icon={<Trophy className="h-4 w-4" />} label="XP" value={data.payload.xp.toLocaleString()} />
                <Stat icon={<Sparkles className="h-4 w-4" />} label="Level" value={`Lv ${data.payload.level}`} />
                <Stat icon={<ShieldCheck className="h-4 w-4" />} label="Solved" value={data.payload.solved} />
              </div>

              {data.payload.achievements.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Achievements
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {data.payload.achievements.map((a) => (
                      <Badge key={a} variant="outline" className="gap-1">
                        <Sparkles className="h-3 w-3" /> {a}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] text-muted-foreground break-all">
                {data.url}
              </p>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
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
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )
}
