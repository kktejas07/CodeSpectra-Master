'use client'
import { formatDateTime } from '@/lib/format-datetime'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader, Panel } from '@/components/app/page-kit'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { usePageGuard } from '@/lib/use-page-guard'
import { useToast } from '@/lib/toast-context'
import { csrfFetch } from '@/lib/csrf-fetch'
import {
  Upload,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  FileSpreadsheet,
  AlertTriangle,
  Send,
  Check,
  ChevronsUpDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseCandidateText, validateRows } from '@/lib/assessment-invite-rows'
import { SkeletonCard, SkeletonText } from '@/components/ui/skeleton-boneyard'
import { useAdminT } from '@/lib/i18n/admin'

interface ExamOption {
  id: string
  title: string
  subject?: string
}

interface ParsedCandidate {
  id: string
  email: string
  name: string
  company: string
  role: string
  status: 'valid' | 'invalid'
  error?: string
}

const STEPS = ['Select assessment', 'Add candidates', 'Preview', 'Schedule', 'Confirm']
const MAX_ROWS = 500

interface InviteStatus { id: string; email: string; delivery_status: string; delivery_error?: string | null }

export default function BulkSchedulePage() {
  const { t: ta } = useAdminT()
  // Company admins invite to their own organisation's tests (the API enforces it).
  const gate = usePageGuard('tenant_admin')
  const addToast = useToast()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState(0)
  const [exams, setExams] = useState<ExamOption[]>([])
  const [loadingExams, setLoadingExams] = useState(true)
  const [selectedExamId, setSelectedExamId] = useState('')
  const [examPickerOpen, setExamPickerOpen] = useState(false)
  const selectedExam = exams.find(e => e.id === selectedExamId) || null

  const [candidates, setCandidates] = useState<ParsedCandidate[]>([])
  const [csvFileName, setCsvFileName] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const [deadline, setDeadline] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [customMessage, setCustomMessage] = useState('')

  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ created: number; failed: number; batch_id: string; errors: { email: string; reason: string }[] } | null>(null)
  const [statuses, setStatuses] = useState<InviteStatus[]>([])
  const [pasted, setPasted] = useState('')

  // Poll per-invite delivery status until nothing is waiting (max ~3 minutes).
  useEffect(() => {
    if (!result?.batch_id || !selectedExamId) return
    let stop = false
    let tries = 0
    const tick = async () => {
      if (stop) return
      tries++
      try {
        const r = await fetch(`/api/admin/assessments/bulk?examId=${encodeURIComponent(selectedExamId)}&batch=${encodeURIComponent(result.batch_id)}`, { credentials: 'include' })
        const j = await r.json()
        if (r.ok) {
          setStatuses(j.invites || [])
          const waiting = (j.invites || []).some((x: InviteStatus) => x.delivery_status === 'queued' || x.delivery_status === 'sending')
          if (!waiting || tries > 60) return
        }
      } catch { /* retry */ }
      setTimeout(tick, 3000)
    }
    tick()
    return () => { stop = true }
  }, [result?.batch_id, selectedExamId])

  useEffect(() => {
    fetch('/api/exams', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setExams(d.data || []))
      .catch(() => {})
      .finally(() => setLoadingExams(false))
  }, [])

  /** CSV file or pasted list → preview rows (same parser + checks the server uses). */
  const parseCsv = useCallback((text: string, fileName: string) => {
    const rows = parseCandidateText(text)
    if (!rows.length) {
      addToast({ type: 'error', title: 'No candidates found', message: 'Add an email column, or paste one email per line.' })
      return
    }
    const { valid, errors } = validateRows(rows)
    const parsed: ParsedCandidate[] = [
      ...valid.map((c, i) => ({ id: `ok-${i}`, email: c.email, name: c.name || c.email.split('@')[0], company: c.company || '', role: c.role || '', status: 'valid' as const })),
      ...errors.map((e, i) => ({ id: `bad-${i}`, email: e.email, name: '', company: '', role: '', status: 'invalid' as const, error: e.reason })),
    ]
    if (valid.length > MAX_ROWS) addToast({ type: 'warning', title: `Up to ${MAX_ROWS} candidates per batch`, message: 'Only the first ones will be sent; send the rest in another batch.' })
    setCandidates(parsed)
    setCsvFileName(fileName)
    setStep(2)
  }, [addToast])

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      parseCsv(text, file.name)
    }
    reader.readAsText(file)
  }, [parseCsv])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const validCount = candidates.filter(c => c.status === 'valid').length
  const invalidCount = candidates.filter(c => c.status === 'invalid').length

  const handleSend = async () => {
    if (!selectedExamId || validCount === 0) return
    setSending(true)
    try {
      const validCandidates = candidates
        .filter(c => c.status === 'valid')
        .slice(0, MAX_ROWS)
        .map(c => ({ email: c.email, name: c.name, company: c.company, role: c.role }))

      const res = await csrfFetch('/api/admin/assessments/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          examId: selectedExamId,
          candidates: validCandidates,
          deadline: deadline || undefined,
          durationMinutes: durationMinutes ? parseInt(durationMinutes) : undefined,
          message: customMessage || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setResult(data)
      setStatuses(data.invites || [])
      addToast({
        type: data.failed === 0 ? 'success' : 'warning',
        title: `${data.created} invite(s) queued${data.failed ? `, ${data.failed} skipped` : ''}`,
        message: 'Emails are going out now — watch each status below.',
      })
    } catch (err: any) {
      addToast({ type: 'error', title: err.message || 'Failed to send invites' })
    } finally {
      setSending(false)
    }
  }

  const previewColumns: DataTableColumn<ParsedCandidate>[] = [
    {
      key: 'email', header: 'Email', sortable: true,
      cell: r => <span className="font-mono text-sm">{r.email}</span>,
    },
    {
      key: 'name', header: 'Name', sortable: true,
      cell: r => <span>{r.name || '—'}</span>,
    },
    {
      key: 'company', header: 'Company',
      cell: r => <span className="text-muted-foreground">{r.company || '—'}</span>,
    },
    {
      key: 'role', header: 'Role',
      cell: r => <span className="text-muted-foreground">{r.role || '—'}</span>,
    },
    {
      key: 'status', header: 'Status', sortable: true,
      cell: r => r.status === 'valid'
        ? <Badge variant="success" className="gap-1"><Check className="h-3 w-3" />{ta('bulkAdm.valid')}</Badge>
        : <Badge variant="danger" className="gap-1"><XCircle className="h-3 w-3" />{r.error}</Badge>,
    },
  ]

  if (!gate.ready) return null

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <PageHeader
        className="mb-0"
        title={ta('bulkAdm.inviteCandidates')}
        description={ta('bulkAdm.uploadACsvOrPasteEmails')}
        icon={<Upload />}
      />

      {/* Progress indicator */}
      <div className="flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
              i < step ? 'bg-primary text-primary-foreground' :
              i === step ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' :
              'bg-muted text-muted-foreground'
            }`}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={`text-xs font-medium hidden sm:inline ${i === step ? 'text-foreground' : 'text-muted-foreground'}`}>{s}</span>
            {i < STEPS.length - 1 && <div className={`w-6 h-px ${i < step ? 'bg-primary' : 'bg-border'}`} />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <Panel>
        {/* Step 0: Select Assessment */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">{ta('bulkAdm.selectAssessment')}</h2>
            <p className="text-sm text-muted-foreground">{ta('bulkAdm.chooseWhichAssessmentToScheduleFor')}</p>
            <Popover open={examPickerOpen} onOpenChange={setExamPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={examPickerOpen}
                  className="w-full max-w-xl justify-between font-normal"
                  disabled={loadingExams}
                >
                  <span className="truncate">
                    {loadingExams
                      ? 'Loading assessments...'
                      : selectedExam
                        ? `${selectedExam.title}${selectedExam.subject ? ` — ${selectedExam.subject}` : ''}`
                        : 'Select an assessment'}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
                <Command>
                  <CommandInput placeholder={ta('bulkAdm.searchAssessments')} />
                  <CommandList>
                    <CommandEmpty>{ta('bulkAdm.noAssessmentFound')}</CommandEmpty>
                    <CommandGroup>
                      {exams.map(e => (
                        <CommandItem
                          key={e.id}
                          value={`${e.title} ${e.subject || ''} ${e.id}`}
                          onSelect={() => {
                            setSelectedExamId(e.id)
                            setExamPickerOpen(false)
                          }}
                        >
                          <Check className={cn('mr-2 h-4 w-4 shrink-0', selectedExamId === e.id ? 'opacity-100' : 'opacity-0')} />
                          <span className="truncate">{e.title}{e.subject ? ` — ${e.subject}` : ''}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <div className="flex justify-end">
              <Button disabled={!selectedExamId} onClick={() => setStep(1)}>
                {ta('bulkAdm.next')} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Upload CSV */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">{ta('bulkAdm.addCandidates')}</h2>
            <p className="text-sm text-muted-foreground">
              {ta('bulkAdm.csvColumns')} <code className="bg-muted px-1 rounded">email</code> {ta('bulkAdm.required')}
              <code className="bg-muted px-1 rounded">name</code>,
              <code className="bg-muted px-1 rounded">company</code>,
              <code className="bg-muted px-1 rounded">role</code> {ta('bulkAdm.optionalHeaderRowIsAutoDetected')}
            </p>

            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-12 ${
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
              role="button"
              tabIndex={0}
              aria-label={ta('bulkAdm.chooseACsvFileOfCandidates')}
            >
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground mb-3" aria-hidden />
              <p className="text-sm font-medium">{ta('bulkAdm.dragDropACsvFileOr')}</p>
              <p className="text-xs text-muted-foreground mt-1">{ta('bulkAdm.supportsCsvAndTxtFiles')}</p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
                e.target.value = ''
              }}
            />

            <div className="grid gap-2">
              <Label htmlFor="paste-emails">{ta('bulkAdm.orPasteEmails')}</Label>
              <Textarea
                id="paste-emails"
                rows={5}
                value={pasted}
                onChange={e => setPasted(e.target.value)}
                placeholder={'jane@example.com\nRavi Kumar <ravi@example.com>\nalex@example.com, sam@example.com'}
              />
              <p className="text-xs text-muted-foreground">{ta('bulkAdm.onePerLineOrSeparatedBy', { MAX_ROWS: MAX_ROWS })}</p>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(0)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> {ta('bulkAdm.back')}
              </Button>
              <Button disabled={!pasted.trim()} onClick={() => parseCsv(pasted, 'Pasted list')}>
                {ta('bulkAdm.preview')} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{ta('bulkAdm.previewCandidates')}</h2>
                <p className="text-sm text-muted-foreground">
                  File: {csvFileName}
                </p>
              </div>
              <div className="flex gap-3 text-sm">
                <Badge variant="success">{ta('bulkAdm.valid2', { validCount: validCount })}</Badge>
                {invalidCount > 0 && <Badge variant="danger">{ta('bulkAdm.invalid', { invalidCount: invalidCount })}</Badge>}
              </div>
            </div>

            {invalidCount > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <span className="text-amber-700 dark:text-amber-400">{ta('bulkAdm.rowSWillBeSkippedInvalid', { invalidCount: invalidCount })}</span>
              </div>
            )}

            <DataTable
              columns={previewColumns}
              data={candidates}
              searchPlaceholder="Search candidates..."
              searchKeys={['email', 'name', 'company']}
              pageSize={20}
              emptyState={{ illustration: 'upload' }} emptyMessage="No candidates parsed"
            />

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => { setStep(1); setCandidates([]); setCsvFileName('') }}>
                <ArrowLeft className="mr-2 h-4 w-4" /> {ta('bulkAdm.back')}
              </Button>
              <Button disabled={validCount === 0} onClick={() => setStep(3)}>
                {ta('bulkAdm.next')} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Schedule Settings */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">{ta('bulkAdm.scheduleSettings')}</h2>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="deadline">{ta('bulkAdm.deadlineOptional')}</Label>
                <Input
                  id="deadline"
                  type="datetime-local"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{ta('bulkAdm.candidatesMustCompleteBeforeThisDate')}</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="duration">{ta('bulkAdm.durationOverrideOptional')}</Label>
                <Input
                  id="duration"
                  type="number"
                  min="1"
                  placeholder={ta('bulkAdm.useAssessmentDefault')}
                  value={durationMinutes}
                  onChange={e => setDurationMinutes(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{ta('bulkAdm.overrideTheAssessmentSDefaultDuration')}</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="message">{ta('bulkAdm.customEmailMessageOptional')}</Label>
                <Textarea
                  id="message"
                  rows={3}
                  placeholder={ta('bulkAdm.addAPersonalNoteToThe')}
                  value={customMessage}
                  onChange={e => setCustomMessage(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> {ta('bulkAdm.back')}
              </Button>
              <Button onClick={() => setStep(4)}>
                {ta('bulkAdm.next')} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 4 && !result && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">{ta('bulkAdm.confirmAndSend')}</h2>
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 space-y-2 text-sm">
              <p><strong>Assessment:</strong> {selectedExam?.title}</p>
              <p><strong>Candidates:</strong> {validCount} {ta('bulkAdm.validCandidatesWillBeInvited')}</p>
              {deadline && <p><strong>Deadline:</strong> {formatDateTime(deadline)}</p>}
              {durationMinutes && <p><strong>{ta('bulkAdm.durationOverride')}</strong> {durationMinutes} {ta('bulkAdm.minutes')}</p>}
              {customMessage && <p><strong>{ta('bulkAdm.customMessage')}</strong> {ta('bulkAdm.yes')}</p>}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> {ta('bulkAdm.back')}
              </Button>
              <Button onClick={handleSend} disabled={sending} className="gap-2">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? 'Sending...' : `Send ${Math.min(validCount, MAX_ROWS)} invite(s)`}
              </Button>
            </div>
          </div>
        )}

        {/* Result */}
        {step === 4 && result && (
          <div className="space-y-4">
            <div className={`rounded-2xl border p-6 ${result.failed === 0 ? 'border-green-500/20 bg-green-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
              <div className="flex items-center gap-3 mb-3">
                {result.failed === 0 ? (
                  <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                )}
                <div>
                  <p className="font-semibold text-lg">{ta('bulkAdm.inviteSCreated', { created: result.created })}</p>
                  {result.failed > 0 && <p className="text-amber-700 dark:text-amber-400">{ta('bulkAdm.skipped', { failed: result.failed })}</p>}
                </div>
              </div>
              {statuses.length > 0 && (
                <div className="mt-4 max-h-80 overflow-y-auto rounded-xl border border-border bg-card">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-muted-foreground"><th className="px-3 py-2">{ta('bulkAdm.email')}</th><th className="px-3 py-2">{ta('bulkAdm.emailStatus')}</th></tr></thead>
                    <tbody>
                      {statuses.map(s => (
                        <tr key={s.id} className="border-t border-border/60">
                          <td className="px-3 py-2 font-mono text-xs">{s.email}</td>
                          <td className="px-3 py-2">
                            <Badge variant={s.delivery_status === 'sent' || s.delivery_status === 'delivered' || s.delivery_status === 'opened' ? 'success' : s.delivery_status === 'failed' ? 'danger' : 'outline'}>
                              {({ queued: 'Waiting', sending: 'Sending', sent: 'Sent', retrying: 'Retrying', failed: 'Failed', delivered: 'Delivered', opened: 'Opened' } as Record<string, string>)[s.delivery_status] || s.delivery_status}
                            </Badge>
                            {s.delivery_error && <span className="ml-2 text-xs text-muted-foreground">{s.delivery_error}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="mt-3 space-y-1 text-sm">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-red-600 dark:text-red-400">
                      <strong>{e.email}:</strong> {e.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => router.push('/dashboard/admin/assessments')}>
                {ta('bulkAdm.backToAssessments')}
              </Button>
              <Button onClick={() => router.push(`/dashboard/admin/assessments/${selectedExamId}/results`)}>
                {ta('bulkAdm.viewResults')}
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  )
}
