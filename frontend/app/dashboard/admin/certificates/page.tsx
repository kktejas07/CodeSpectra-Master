'use client'
import { formatDate } from '@/lib/format-datetime'

import { useEffect, useState } from 'react'
import { PageHeader, Panel, StatCard } from '@/components/app/page-kit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import {
  Award,
  Plus,
  Loader2,
  ExternalLink,
  Search,
  Eye,
  CheckCircle2,
  Trophy,
  FileText,
  Ban,
} from 'lucide-react'
import { SkeletonStats, SkeletonTable } from '@/components/ui/skeleton-boneyard'
import { EmptyState } from '@/components/ui/empty-state'
import {
  CertificateRenderer,
  TEMPLATES,
  type CertificateData,
  type TemplateKey,
} from '@/components/cert/CertificateTemplates'
import { useAdminT } from '@/lib/i18n/admin'

interface IssuedCert {
  id: string
  user: { name: string; email: string }
  title: string
  level: string
  source: string
  score: number
  scoreLabel?: string
  template: string
  eventTitle?: string | null
  issuedBy?: string | null
  issuedAt: string
  verifyToken: string
  certificationId: string
  revokedAt?: string | null
  revokedBy?: string | null
  revokeReason?: string | null
}

const REVOKE_REASON_MIN = 5
const REVOKE_REASON_MAX = 500

const PREVIEW_DATA: CertificateData = {
  candidateName: 'Alex Johnson',
  certificationTitle: 'Full-Stack Web Development',
  level: 'Advanced',
  source: 'CodeSpectra Open Curriculum',
  score: 92,
  issuedAt: new Date().toISOString(),
  verifyUrl: 'https://codespectra.ai/cert/verify/CERT-ABC123',
  verifyToken: 'CERT-ABC123',
}

const TEMPLATE_KEYS = TEMPLATES.map(t => t.key)

interface UserSearchResult {
  _id: string
  name: string
  email: string
}

export default function CertificatesPage() {
  const { t: ta } = useAdminT()
  const gate = usePageGuard('superadmin')
  const addToast = useToast()

  const [issued, setIssued] = useState<IssuedCert[]>([])
  const [loading, setLoading] = useState(true)
  const [issueDialogOpen, setIssueDialogOpen] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [previewTemplate, setPreviewTemplate] = useState<TemplateKey>(TEMPLATE_KEYS[0])
  const [previewData, setPreviewData] = useState<CertificateData>(PREVIEW_DATA)
  const [auditSearch, setAuditSearch] = useState('')
  const [issuing, setIssuing] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<IssuedCert | null>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const [revoking, setRevoking] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const [formTemplate, setFormTemplate] = useState<TemplateKey>(TEMPLATE_KEYS[0])
  const [formTitle, setFormTitle] = useState('')
  const [formLevel, setFormLevel] = useState('Certified')
  const [formSource, setFormSource] = useState('CodeSpectra')
  const [formScore, setFormScore] = useState('100')
  const [formScoreLabel, setFormScoreLabel] = useState('')
  const [formEventTitle, setFormEventTitle] = useState('')
  const [formUserSearch, setFormUserSearch] = useState('')
  const [formUserResults, setFormUserResults] = useState<UserSearchResult[]>([])
  const [formSelectedUser, setFormSelectedUser] = useState<UserSearchResult | null>(null)
  const [formUserSearching, setFormUserSearching] = useState(false)

  useEffect(() => {
    if (!gate.ready) return
    fetchIssued()
  }, [gate.ready])

  useEffect(() => {
    if (!formUserSearch.trim()) {
      setFormUserResults([])
      setFormSelectedUser(null)
      return
    }
    const timer = setTimeout(() => {
      searchUsers(formUserSearch)
    }, 300)
    return () => clearTimeout(timer)
  }, [formUserSearch])

  async function fetchIssued() {
    try {
      setLoading(true)
      const res = await csrfFetch('/api/admin/certifications/issued')
      if (res.ok) {
        const data = await res.json()
        setIssued(data.data || data.certs || (Array.isArray(data) ? data : []))
      }
    } catch {
      addToast({ title: 'Failed to load certificates', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function searchUsers(query: string) {
    try {
      setFormUserSearching(true)
      const res = await csrfFetch(`/api/admin/users?search=${encodeURIComponent(query)}&limit=10`)
      if (res.ok) {
        const data = await res.json()
        setFormUserResults(data.users || data || [])
      }
    } catch {
      setFormUserResults([])
    } finally {
      setFormUserSearching(false)
    }
  }

  async function handleIssue() {
    if (!formSelectedUser || !formTitle.trim()) {
      addToast({ title: 'Please select a user and enter a title', type: 'error' })
      return
    }
    try {
      setIssuing(true)
      const res = await csrfFetch('/api/admin/certifications/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: formSelectedUser._id,
          template: formTemplate,
          title: formTitle,
          level: formLevel,
          source: formSource,
          score: Number(formScore),
          scoreLabel: formScoreLabel || undefined,
          eventTitle: formEventTitle || undefined,
        }),
      })
      if (res.ok) {
        addToast({ title: 'Certificate issued successfully', type: 'success' })
        setIssueDialogOpen(false)
        resetForm()
        fetchIssued()
      } else {
        const data = await res.json()
        addToast({ title: data.error || 'Failed to issue certificate', type: 'error' })
      }
    } catch {
      addToast({ title: 'Failed to issue certificate', type: 'error' })
    } finally {
      setIssuing(false)
    }
  }

  function openRevoke(cert: IssuedCert) {
    setRevokeTarget(cert)
    setRevokeReason('')
    setRevokeError(null)
  }

  async function handleRevoke() {
    if (!revokeTarget) return
    const reason = revokeReason.trim()
    if (reason.length < REVOKE_REASON_MIN) {
      setRevokeError(`Give a reason (at least ${REVOKE_REASON_MIN} characters).`)
      return
    }
    try {
      setRevoking(true)
      setRevokeError(null)
      const res = await csrfFetch(`/api/admin/certifications/${encodeURIComponent(revokeTarget.id)}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRevokeError(typeof data.error === 'string' ? data.error : 'Could not revoke the certificate. Try again.')
        if (res.status === 409) fetchIssued()
        return
      }
      addToast({ title: 'Certificate revoked', type: 'success' })
      setRevokeTarget(null)
      fetchIssued()
    } catch {
      setRevokeError('Could not revoke the certificate. Try again.')
    } finally {
      setRevoking(false)
    }
  }

  function resetForm() {
    setFormTemplate(TEMPLATE_KEYS[0])
    setFormTitle('')
    setFormLevel('Certified')
    setFormSource('CodeSpectra')
    setFormScore('100')
    setFormScoreLabel('')
    setFormEventTitle('')
    setFormUserSearch('')
    setFormUserResults([])
    setFormSelectedUser(null)
  }

  function openPreview(cert: IssuedCert) {
    const data: CertificateData = {
      candidateName: cert.user.name,
      certificationTitle: cert.title,
      level: cert.level,
      source: cert.source,
      score: cert.score,
      issuedAt: cert.issuedAt,
      verifyUrl: `https://codespectra.ai/cert/verify/${cert.verifyToken}`,
      verifyToken: cert.verifyToken,
    }
    setPreviewTemplate(cert.template as TemplateKey)
    setPreviewData(data)
    setPreviewDialogOpen(true)
  }

  function openTemplatePreview(template: TemplateKey) {
    setPreviewTemplate(template)
    setPreviewData(PREVIEW_DATA)
    setPreviewDialogOpen(true)
  }

  const now = new Date()
  const thisMonthCount = issued.filter((c) => {
    const d = new Date(c.issuedAt)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  const filteredCerts = issued.filter((c) => {
    const q = auditSearch.toLowerCase()
    return (
      (c.user.name || '').toLowerCase().includes(q) ||
      (c.user.email || '').toLowerCase().includes(q) ||
      (c.title || '').toLowerCase().includes(q) ||
      (c.verifyToken || '').toLowerCase().includes(q) ||
      (c.certificationId || '').toLowerCase().includes(q)
    )
  })

  if (!gate.ready) {
    return (
      <div className="space-y-6">
        <SkeletonStats />
        <SkeletonTable rows={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        illustration="certificate"
        icon={<Award />}
        title={ta('certAdm.certificates')}
        description={ta('certAdm.issueCertificatesPreviewThemAndCheck')}
        actions={
          <Button size="sm" onClick={() => setIssueDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {ta('certAdm.issueCertificate')}
          </Button>
        }
        className="mb-0"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={ta('certAdm.totalIssued')} value={issued.length} icon={<CheckCircle2 />} />
        <StatCard label={ta('certAdm.thisMonth')} value={thisMonthCount} icon={<Trophy />} />
        <StatCard label={ta('certAdm.templates')} value={TEMPLATE_KEYS.length} icon={<FileText />} />
      </div>

      <Panel className="overflow-hidden p-0">
        <div className="border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={ta('certAdm.searchByNameEmailTitleOr')}
              aria-label={ta('certAdm.searchIssuedCertificates')}
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[760px]">
            <thead className="bg-muted/50">
              <tr className="border-b border-border/60 text-left text-muted-foreground">
                <th className="py-2.5 px-4 font-medium">{ta('certAdm.recipient')}</th>
                <th className="py-2.5 px-4 font-medium">{ta('certAdm.certificate')}</th>
                <th className="py-2.5 px-4 font-medium">{ta('certAdm.template')}</th>
                <th className="py-2.5 px-4 font-medium">{ta('certAdm.score')}</th>
                <th className="py-2.5 px-4 font-medium">{ta('certAdm.issued')}</th>
                <th className="py-2.5 px-4 font-medium">{ta('certAdm.issuedBy')}</th>
                <th className="py-2.5 px-4 font-medium">{ta('certAdm.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : filteredCerts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-0">
                    {auditSearch ? (
                      <EmptyState variant="search" title={ta('certAdm.noCertificatesMatchYourSearch')} description={ta('certAdm.tryADifferentNameEmailOr')} className="border-0 bg-transparent py-6 md:py-8" />
                    ) : (
                      <EmptyState illustration="certificate" title={ta('certAdm.noCertificatesIssuedYet')} description={ta('certAdm.useIssueCertificateToCreateThe')} className="border-0 bg-transparent py-6 md:py-8" />
                    )}
                  </td>
                </tr>
              ) : (
                filteredCerts.map((cert) => (
                  <tr key={cert.id} className="border-b border-border/40 last:border-0 hover:bg-muted/40">
                    <td className="py-2.5 px-4">
                      <p className="font-medium">{cert.user.name}</p>
                      <p className="text-[11px] text-muted-foreground">{cert.user.email}</p>
                    </td>
                    <td className="py-2.5 px-4">
                      <p className="font-medium">{cert.title}</p>
                      <p className="text-[11px] text-muted-foreground">{cert.level}</p>
                      {cert.revokedAt && (
                        <Badge variant="destructive" className="mt-1 text-[10px]" title={cert.revokeReason || undefined}>{ta('certAdm.revoked', { formatDate: formatDate(cert.revokedAt) })}</Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {cert.template}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="font-medium tabular-nums">{cert.score}</span>
                      {cert.scoreLabel && (
                        <p className="text-[11px] text-muted-foreground">{cert.scoreLabel}</p>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-[11px] tabular-nums text-muted-foreground">
                      {formatDate(cert.issuedAt)}
                    </td>
                    <td className="py-2.5 px-4 text-[11px] text-muted-foreground">
                      {cert.issuedBy || 'System'}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={ta('certAdm.previewCertificate')}
                          onClick={() => openPreview(cert)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={ta('certAdm.openVerificationPage')}
                          onClick={() => window.open(`/cert/verify/${cert.verifyToken}`, '_blank')}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        {!cert.revokedAt && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            aria-label={ta('certAdm.revokeCertificate')}
                            title={ta('certAdm.revokeCertificate')}
                            onClick={() => openRevoke(cert)}
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{ta('certAdm.issueCertificate')}</DialogTitle>
            <DialogDescription>
              {ta('certAdm.searchForAUserAndFill')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">{ta('certAdm.recipient')}</Label>
              {formSelectedUser ? (
                <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium">{formSelectedUser.name}</p>
                    <p className="text-[11px] text-muted-foreground">{formSelectedUser.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => {
                      setFormSelectedUser(null)
                      setFormUserSearch('')
                    }}
                  >
                    {ta('certAdm.change')}
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Input aria-label={ta('certAdm.searchByNameOrEmail')}
                    placeholder={ta('certAdm.searchByNameOrEmail2')}
                    value={formUserSearch}
                    onChange={(e) => setFormUserSearch(e.target.value)}
                    className="h-8 text-xs"
                  />
                  {formUserSearching && (
                    <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                  {formUserResults.length > 0 && !formSelectedUser && (
                    <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-border/60 bg-popover shadow-md">
                      {formUserResults.map((u) => (
                        <button
                          key={u._id}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent"
                          onClick={() => {
                            setFormSelectedUser(u)
                            setFormUserSearch('')
                            setFormUserResults([])
                          }}
                        >
                          <div>
                            <p className="font-medium">{u.name}</p>
                            <p className="text-[11px] text-muted-foreground">{u.email}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{ta('certAdm.template')}</Label>
              <Select value={formTemplate} onValueChange={(v) => setFormTemplate(v as TemplateKey)}>
                <SelectTrigger aria-label={ta('certAdm.template')} className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATES.map((t) => (
                    <SelectItem key={t.key} value={t.key} className="text-xs capitalize">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{ta('certAdm.title')}</Label>
              <Input aria-label={ta('certAdm.title')}
                placeholder={ta('certAdm.eGFullStackWebDevelopment')}
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">{ta('certAdm.level')}</Label>
                <Input aria-label={ta('certAdm.level')}
                  value={formLevel}
                  onChange={(e) => setFormLevel(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{ta('certAdm.score')}</Label>
                <Input aria-label={ta('certAdm.score')}
                  type="number"
                  value={formScore}
                  onChange={(e) => setFormScore(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{ta('certAdm.source')}</Label>
              <Input aria-label={ta('certAdm.source')}
                value={formSource}
                onChange={(e) => setFormSource(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{ta('certAdm.scoreLabelOptional')}</Label>
              <Input aria-label={ta('certAdm.scoreLabelOptional')}
                placeholder={ta('certAdm.eG420XpEarned')}
                value={formScoreLabel}
                onChange={(e) => setFormScoreLabel(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{ta('certAdm.eventTitleOptional')}</Label>
              <Input aria-label={ta('certAdm.eventTitleOptional')}
                placeholder={ta('certAdm.eGSpring2026Codeathon')}
                value={formEventTitle}
                onChange={(e) => setFormEventTitle(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIssueDialogOpen(false)}>
              {ta('certAdm.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleIssue}
              disabled={issuing || !formSelectedUser || !formTitle.trim()}
            >
              {issuing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {ta('certAdm.issueCertificate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revokeTarget} onOpenChange={(open) => { if (!open && !revoking) setRevokeTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{ta('certAdm.revokeCertificate')}</DialogTitle>
            <DialogDescription>
              {revokeTarget
                ? `"${revokeTarget.title}" issued to ${revokeTarget.user.name} will show as revoked on its public verification page. This can't be undone.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="revoke-reason" className="text-xs">{ta('certAdm.reason')}</Label>
            <Textarea
              id="revoke-reason"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value.slice(0, REVOKE_REASON_MAX))}
              placeholder={ta('certAdm.eGIssuedToTheWrong')}
              rows={3}
              aria-describedby="revoke-reason-hint"
              className="text-xs"
            />
            <p id="revoke-reason-hint" className="text-[11px] text-muted-foreground">
              {ta('certAdm.requiredKeptInTheAuditLog')}
            </p>
            {revokeError && <p role="alert" className="text-xs text-destructive">{revokeError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRevokeTarget(null)} disabled={revoking}>
              {ta('certAdm.cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRevoke}
              disabled={revoking || revokeReason.trim().length < REVOKE_REASON_MIN}
            >
              {revoking && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {ta('certAdm.revokeCertificate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{ta('certAdm.certificatePreview')}</DialogTitle>
            <DialogDescription>{ta('certAdm.previewOfTheSelectedCertificateTemplate')}</DialogDescription>
          </DialogHeader>
          <div className="w-full overflow-hidden rounded-lg border shadow-sm my-4 bg-muted/20">
            <CertificateRenderer template={previewTemplate} data={previewData} />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPreviewDialogOpen(false)}>
              {ta('certAdm.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
