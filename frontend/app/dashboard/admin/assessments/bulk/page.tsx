'use client'
import { formatDateTime } from '@/lib/format-datetime'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
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
import { SkeletonCard, SkeletonText } from '@/components/ui/skeleton-boneyard'

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

const STEPS = ['Select Assessment', 'Upload CSV', 'Preview', 'Schedule', 'Confirm']

export default function BulkSchedulePage() {
  const gate = usePageGuard('superadmin')
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
  const [result, setResult] = useState<{ created: number; failed: number; errors: { email: string; reason: string }[] } | null>(null)

  useEffect(() => {
    fetch('/api/exams', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setExams(d.data || []))
      .catch(() => {})
      .finally(() => setLoadingExams(false))
  }, [])

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  const parseCsv = useCallback((text: string, fileName: string) => {
    // Strip BOM
    const clean = text.replace(/^\uFEFF/, '').trim()
    if (!clean) {
      addToast({ type: 'error', title: 'Empty file' })
      return
    }

    const lines = clean.split(/\r?\n/).filter(l => l.trim())
    if (lines.length === 0) {
      addToast({ type: 'error', title: 'No rows found' })
      return
    }

    // Detect header: first row contains 'email' (case-insensitive)
    const firstLine = lines[0].toLowerCase()
    const hasHeader = firstLine.includes('email')
    const startIdx = hasHeader ? 1 : 0

    // Parse header columns if present
    const headerCols = hasHeader
      ? lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''))
      : []

    const emailIdx = headerCols.findIndex(c => c === 'email')
    const nameIdx = headerCols.findIndex(c => c === 'name')
    const companyIdx = headerCols.findIndex(c => c === 'company')
    const roleIdx = headerCols.findIndex(c => c === 'role' || c === 'jobtitle' || c === 'position')

    const parsed: ParsedCandidate[] = []
    const seenEmails = new Set<string>()

    for (let i = startIdx; i < lines.length; i++) {
      const cells = lines[i].split(',').map(c => c.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1'))
      if (cells.length === 0 || cells.every(c => !c)) continue

      let email = '', name = '', company = '', role = ''

      if (emailIdx >= 0) {
        email = (cells[emailIdx] || '').trim()
        name = nameIdx >= 0 ? (cells[nameIdx] || '').trim() : ''
        company = companyIdx >= 0 ? (cells[companyIdx] || '').trim() : ''
        role = roleIdx >= 0 ? (cells[roleIdx] || '').trim() : ''
      } else {
        // Fallback: first cell with @ is email
        const atIdx = cells.findIndex(c => c.includes('@'))
        if (atIdx >= 0) {
          email = cells[atIdx].trim()
          name = cells[atIdx === 0 ? 1 : 0]?.trim() || ''
          company = cells[atIdx === 0 ? 2 : (atIdx === 1 ? 2 : 1)]?.trim() || ''
          role = ''
        } else {
          email = cells[0]?.trim() || ''
        }
      }

      const isValidEmail = EMAIL_RE.test(email)
      const isDuplicate = seenEmails.has(email.toLowerCase())
      const error = !isValidEmail ? 'Invalid email format' : isDuplicate ? 'Duplicate email' : undefined
      seenEmails.add(email.toLowerCase())

      parsed.push({
        id: `row-${i}`,
        email,
        name: name || email.split('@')[0],
        company,
        role,
        status: !isValidEmail || isDuplicate ? 'invalid' : 'valid',
        error,
      })
    }

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
      addToast({
        type: data.failed === 0 ? 'success' : 'warning',
        title: `${data.created} invite(s) sent, ${data.failed} failed`,
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
        ? <Badge variant="success" className="gap-1"><Check className="h-3 w-3" />Valid</Badge>
        : <Badge variant="danger" className="gap-1"><XCircle className="h-3 w-3" />{r.error}</Badge>,
    },
  ]

  if (!gate.ready) return null

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Upload className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Bulk Schedule Assessments</h1>
          <p className="text-sm text-muted-foreground">Upload a CSV of candidates and invite them in bulk</p>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-2">
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
      <Card className="p-6">
        {/* Step 0: Select Assessment */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Select Assessment</h2>
            <p className="text-sm text-muted-foreground">Choose which assessment to schedule for your candidates. Search by title or role.</p>
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
                  <CommandInput placeholder="Search assessments..." />
                  <CommandList>
                    <CommandEmpty>No assessment found.</CommandEmpty>
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
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Upload CSV */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Upload CSV</h2>
            <p className="text-sm text-muted-foreground">
              CSV columns: <code className="bg-muted px-1 rounded">email</code> (required),
              <code className="bg-muted px-1 rounded">name</code>,
              <code className="bg-muted px-1 rounded">company</code>,
              <code className="bg-muted px-1 rounded">role</code> (optional).
              Header row is auto-detected. BOM is stripped.
            </p>

            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors cursor-pointer ${
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">Drag & drop a CSV file or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Supports .csv and .txt files</p>
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

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(0)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Preview Candidates</h2>
                <p className="text-sm text-muted-foreground">
                  File: {csvFileName}
                </p>
              </div>
              <div className="flex gap-3 text-sm">
                <Badge variant="success">{validCount} valid</Badge>
                {invalidCount > 0 && <Badge variant="danger">{invalidCount} invalid</Badge>}
              </div>
            </div>

            {invalidCount > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <span className="text-amber-700">
                  {invalidCount} row(s) will be skipped. Invalid rows are highlighted below.
                </span>
              </div>
            )}

            <DataTable
              columns={previewColumns}
              data={candidates}
              searchPlaceholder="Search candidates..."
              searchKeys={['email', 'name', 'company']}
              pageSize={20}
              emptyMessage="No candidates parsed"
            />

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => { setStep(1); setCandidates([]); setCsvFileName('') }}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button disabled={validCount === 0} onClick={() => setStep(3)}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Schedule Settings */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Schedule Settings</h2>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="deadline">Deadline (optional)</Label>
                <Input
                  id="deadline"
                  type="datetime-local"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Candidates must complete before this date. Default: 7 days.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="duration">Duration Override (optional)</Label>
                <Input
                  id="duration"
                  type="number"
                  min="1"
                  placeholder="Use assessment default"
                  value={durationMinutes}
                  onChange={e => setDurationMinutes(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Override the assessment's default duration in minutes.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="message">Custom Email Message (optional)</Label>
                <Textarea
                  id="message"
                  rows={3}
                  placeholder="Add a personal note to the invitation email..."
                  value={customMessage}
                  onChange={e => setCustomMessage(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={() => setStep(4)}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 4 && !result && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Confirm & Send</h2>
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
              <p><strong>Assessment:</strong> {selectedExam?.title}</p>
              <p><strong>Candidates:</strong> {validCount} valid candidates will be invited</p>
              {deadline && <p><strong>Deadline:</strong> {formatDateTime(deadline)}</p>}
              {durationMinutes && <p><strong>Duration override:</strong> {durationMinutes} minutes</p>}
              {customMessage && <p><strong>Custom message:</strong> Yes</p>}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={handleSend} disabled={sending} className="gap-2">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? 'Sending...' : `Send ${validCount} Invite(s)`}
              </Button>
            </div>
          </div>
        )}

        {/* Result */}
        {step === 4 && result && (
          <div className="space-y-4">
            <div className={`rounded-lg border p-6 ${result.failed === 0 ? 'border-green-500/20 bg-green-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
              <div className="flex items-center gap-3 mb-3">
                {result.failed === 0 ? (
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-amber-600" />
                )}
                <div>
                  <p className="font-semibold text-lg">{result.created} invite(s) sent successfully</p>
                  {result.failed > 0 && <p className="text-amber-600">{result.failed} failed</p>}
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="mt-3 space-y-1 text-sm">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-red-600">
                      <strong>{e.email}:</strong> {e.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => router.push('/dashboard/admin/assessments')}>
                Back to Assessments
              </Button>
              <Button onClick={() => router.push('/dashboard/admin/assessments/pipeline')}>
                View Pipeline
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
