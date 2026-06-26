'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Award, CheckCircle, ArrowRight, BookOpen, ExternalLink } from 'lucide-react'

interface CertCatalog {
  id: string
  slug: string
  title: string
  level: 'Basic' | 'Intermediate' | 'Advanced'
  category: 'skill' | 'role'
  description: string
  icon: string
  duration: number
  passing_score: number
  source: string
  source_url?: string
  license: string
  question_count: number
}

interface MyAttempt {
  attempt_id: string
  certification: CertCatalog | null
  score: number
  passed: boolean
  started_at: string
  submitted_at?: string | null
  verify_token?: string | null
}

interface MyResponse {
  items: MyAttempt[]
  earned_count: number
  attempt_count: number
}

export default function CertificationsPage() {
  const [catalog, setCatalog] = useState<CertCatalog[]>([])
  const [me, setMe] = useState<MyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [catRes, meRes] = await Promise.all([
          fetch('/api/certifications?limit=50', { credentials: 'include' }),
          fetch('/api/certifications/me', { credentials: 'include' }),
        ])
        if (!catRes.ok) throw new Error(`catalog ${catRes.status}`)
        const cat = await catRes.json()
        let mine: MyResponse | null = null
        if (meRes.ok) mine = await meRes.json()
        if (!active) return
        setCatalog(cat.items || [])
        setMe(mine)
      } catch (e) {
        if (active) setError((e as Error).message)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const earnedMap = new Map<string, MyAttempt>()
  for (const a of me?.items || []) {
    if (a.certification && a.passed) {
      const prev = earnedMap.get(a.certification.id)
      if (!prev || (a.score > prev.score)) earnedMap.set(a.certification.id, a)
    }
  }

  const skills = catalog.filter((c) => c.category === 'skill')
  const roles = catalog.filter((c) => c.category === 'role')
  const earnedSkills = skills.filter((c) => earnedMap.has(c.id)).length

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground" data-testid="certifications-loading">
        Loading certifications…
      </div>
    )
  }
  if (error) {
    return (
      <div className="p-8 text-center text-destructive" data-testid="certifications-error">
        Failed to load certifications: {error}
      </div>
    )
  }

  return (
    <div className="space-y-8" data-testid="certifications-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Get Certified</h1>
        <p className="text-muted-foreground">
          Open-source certification modules. Questions sourced from MDN, FreeCodeCamp, exercism and
          OSSU under permissive licenses.
        </p>
      </div>

      {/* Benefits Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 bg-blue-500/5 border-blue-500/20">
          <div className="flex items-start gap-3">
            <Award className="w-5 h-5 text-blue-400 flex-shrink-0 mt-1" />
            <div>
              <p className="font-semibold text-foreground">Stand out</p>
              <p className="text-sm text-muted-foreground mt-1">
                Earn shareable, verifiable certificates backed by open-source curricula.
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-6 bg-purple-500/5 border-purple-500/20">
          <div className="flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-purple-400 flex-shrink-0 mt-1" />
            <div>
              <p className="font-semibold text-foreground">Open content</p>
              <p className="text-sm text-muted-foreground mt-1">
                Every module attributes its source and license — no proprietary lock-in.
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-6 bg-green-500/5 border-green-500/20">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-1" />
            <div>
              <p className="font-semibold text-foreground">Verifiable</p>
              <p className="text-sm text-muted-foreground mt-1">
                Recruiters can hit <code>/cert/verify/&lt;token&gt;</code> to confirm in one click.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Role Certifications */}
      {roles.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-1">Role-based assessments</h2>
            <p className="text-sm text-muted-foreground">For specific job roles.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((cert) => (
              <CertCard key={cert.id} cert={cert} earned={earnedMap.get(cert.id) || null} />
            ))}
          </div>
        </div>
      )}

      {/* Skills Certifications */}
      {skills.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold mb-1">Skill-based assessments</h2>
              <p className="text-sm text-muted-foreground">Languages and frameworks.</p>
            </div>
            <Badge variant="outline" className="text-xs" data-testid="certs-earned-count">
              {earnedSkills}/{skills.length} earned
            </Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {skills.map((cert) => (
              <CertCard key={cert.id} cert={cert} earned={earnedMap.get(cert.id) || null} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CertCard({
  cert,
  earned,
  compact,
}: {
  cert: CertCatalog
  earned: MyAttempt | null
  compact?: boolean
}) {
  return (
    <Card
      data-testid={`cert-card-${cert.slug}`}
      className={`p-6 border-border/40 transition-all ${
        earned ? 'bg-green-500/5 border-green-500/20 hover:border-green-500/40' : 'hover:border-primary/40'
      }`}
    >
      <div className={compact ? 'space-y-3' : 'space-y-4'}>
        <div className="flex items-start justify-between gap-3">
          <div className={`${compact ? 'w-10 h-10 text-sm' : 'w-12 h-12'} rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary`}>
            {cert.icon}
          </div>
          {earned ? (
            <CheckCircle className="w-5 h-5 text-green-500" />
          ) : (
            <Badge variant="outline" className="text-xs">
              {cert.level}
            </Badge>
          )}
        </div>
        <div>
          <h3 className={`font-semibold text-foreground ${compact ? 'text-sm' : ''}`}>{cert.title}</h3>
          <p className="text-xs text-muted-foreground mt-1">{cert.description}</p>
          {cert.source_url ? (
            <a
              href={cert.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1 mt-2"
            >
              Source: {cert.source} ({cert.license}) <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <p className="text-[11px] text-muted-foreground mt-2">
              Source: {cert.source} ({cert.license})
            </p>
          )}
        </div>
        <div className="text-xs text-muted-foreground space-y-1 border-t border-border/40 pt-3">
          <div>Duration: {cert.duration} min</div>
          <div>Questions: {cert.question_count}</div>
          <div>Passing score: {cert.passing_score}%</div>
          {earned && <div className="text-green-500 font-medium">Your score: {earned.score}%</div>}
        </div>
        {earned && earned.verify_token ? (
          <Link href={`/cert/verify/${earned.verify_token}`} className="block">
            <Button
              className="w-full gap-2"
              variant="outline"
              data-testid={`cert-view-${cert.slug}`}
            >
              <CheckCircle className="w-4 h-4" />
              View certificate
            </Button>
          </Link>
        ) : (
          <Link href={`/dashboard/certifications/${cert.slug}`} className="block">
            <Button
              className="w-full gap-2"
              data-testid={`cert-start-${cert.slug}`}
            >
              Start assessment
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        )}
      </div>
    </Card>
  )
}
