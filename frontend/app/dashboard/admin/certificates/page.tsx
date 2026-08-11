'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
} from 'lucide-react'
import {
  CertificateRenderer,
  TEMPLATES,
  type CertificateData,
  type TemplateKey,
} from '@/components/cert/CertificateTemplates'

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
}

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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Award className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Certificates</h1>
        </div>
        <Button size="sm" onClick={() => setIssueDialogOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Issue Certificate
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Total issued</p>
              <p className="text-2xl font-bold">{issued.length}</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-3">
            <Trophy className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">This month</p>
              <p className="text-2xl font-bold">{thisMonthCount}</p>
            </div>
          </div>
        </Card>
        <Card className="border-border/60 p-4">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">Templates</p>
              <p className="text-2xl font-bold">{TEMPLATE_KEYS.length}</p>
            </div>
          </div>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Templates</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => openTemplatePreview(t.key)}
              className="group rounded-lg border border-border/60 p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                <span className="text-xs font-medium capitalize">{t.label}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <Card className="border-border/60">
        <div className="border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search audit log..."
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              className="h-8 max-w-xs text-xs"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60 text-left text-muted-foreground">
                <th className="py-2.5 px-4 font-medium">Recipient</th>
                <th className="py-2.5 px-4 font-medium">Certificate</th>
                <th className="py-2.5 px-4 font-medium">Template</th>
                <th className="py-2.5 px-4 font-medium">Score</th>
                <th className="py-2.5 px-4 font-medium">Issued</th>
                <th className="py-2.5 px-4 font-medium">Issued By</th>
                <th className="py-2.5 px-4 font-medium">Actions</th>
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
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No certificates found
                  </td>
                </tr>
              ) : (
                filteredCerts.map((cert) => (
                  <tr key={cert.id} className="border-b border-border/30 hover:bg-accent/50">
                    <td className="py-2.5 px-4">
                      <p className="font-medium">{cert.user.name}</p>
                      <p className="text-[10px] text-muted-foreground">{cert.user.email}</p>
                    </td>
                    <td className="py-2.5 px-4">
                      <p className="font-medium">{cert.title}</p>
                      <p className="text-[10px] text-muted-foreground">{cert.level}</p>
                    </td>
                    <td className="py-2.5 px-4">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {cert.template}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="font-medium">{cert.score}</span>
                      {cert.scoreLabel && (
                        <p className="text-[10px] text-muted-foreground">{cert.scoreLabel}</p>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-[10px] text-muted-foreground">
                      {new Date(cert.issuedAt).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-4 text-[10px] text-muted-foreground">
                      {cert.issuedBy || 'System'}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openPreview(cert)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => window.open(`/cert/verify/${cert.verifyToken}`, '_blank')}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Issue Certificate</DialogTitle>
            <DialogDescription>
              Search for a user and fill in the certificate details to issue a new certificate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">Recipient</Label>
              {formSelectedUser ? (
                <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium">{formSelectedUser.name}</p>
                    <p className="text-[10px] text-muted-foreground">{formSelectedUser.email}</p>
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
                    Change
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    placeholder="Search by name or email..."
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
                            <p className="text-[10px] text-muted-foreground">{u.email}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Template</Label>
              <Select value={formTemplate} onValueChange={(v) => setFormTemplate(v as TemplateKey)}>
                <SelectTrigger className="h-8 text-xs">
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
              <Label className="text-xs">Title</Label>
              <Input
                placeholder="e.g. Full-Stack Web Development"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Level</Label>
                <Input
                  value={formLevel}
                  onChange={(e) => setFormLevel(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Score</Label>
                <Input
                  type="number"
                  value={formScore}
                  onChange={(e) => setFormScore(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Source</Label>
              <Input
                value={formSource}
                onChange={(e) => setFormSource(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Score Label (optional)</Label>
              <Input
                placeholder="e.g. +420 XP earned"
                value={formScoreLabel}
                onChange={(e) => setFormScoreLabel(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Event Title (optional)</Label>
              <Input
                placeholder="e.g. Spring 2026 Codeathon"
                value={formEventTitle}
                onChange={(e) => setFormEventTitle(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIssueDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleIssue}
              disabled={issuing || !formSelectedUser || !formTitle.trim()}
            >
              {issuing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Issue Certificate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Certificate Preview</DialogTitle>
            <DialogDescription>Preview of the selected certificate template.</DialogDescription>
          </DialogHeader>
          <div className="w-full overflow-hidden rounded-lg border shadow-sm my-4 bg-muted/20">
            <CertificateRenderer template={previewTemplate} data={previewData} />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPreviewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
