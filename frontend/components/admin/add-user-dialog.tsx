'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { UserRole } from '@/lib/rbac'

export interface AddUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: {
    email: string
    full_name: string
    password: string
    role: UserRole
    target_url?: string
    assigned_assessments?: import('@/lib/db/admin').AssessmentStep[]
    allowed_languages?: string[]
  }) => Promise<void>
}

const AVAILABLE_PIPELINES = [
  { id: 'identity', title: 'Identity & Proctoring Verification', url: '/dashboard/identity-verify', type: 'identity' },
  { id: 'general', title: 'General AI Assessment', url: '/assessment', type: 'general' },
  { id: 'coding', title: 'Coding Challenge IDE', url: '/dashboard/problems', type: 'coding' },
  { id: 'codeathon', title: 'Codeathon Challenge Event', url: '/dashboard/codeathons', type: 'codeathon' },
  { id: 'hackathon', title: 'Hackathon Event', url: '/dashboard/hackathons', type: 'hackathon' },
  { id: 'cad', title: 'CAD Technical Assessment', url: '/assessment/demo/cad', type: 'cad' },
]

const ALL_LANGUAGES = ['python', 'javascript', 'typescript', 'cpp', 'java', 'go', 'rust']

export function AddUserDialog({ open, onOpenChange, onSubmit }: AddUserDialogProps) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('user')
  const [selectedPipelines, setSelectedPipelines] = useState<string[]>(['/assessment'])
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([...ALL_LANGUAGES])
  const [loading, setLoading] = useState(false)

  const reset = () => {
    setEmail('')
    setFullName('')
    setPassword('')
    setRole('user')
    setSelectedPipelines(['/assessment'])
    setSelectedLanguages([...ALL_LANGUAGES])
    setLoading(false)
  }

  const handleClose = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const togglePipeline = (url: string) => {
    setSelectedPipelines((prev) =>
      prev.includes(url) ? (prev.length > 1 ? prev.filter((p) => p !== url) : prev) : [...prev, url]
    )
  }

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const assigned_assessments = selectedPipelines.map((url) => {
        const item = AVAILABLE_PIPELINES.find((p) => p.url === url)
        return {
          id: crypto.randomUUID(),
          title: item?.title || 'Assessment Step',
          target_url: url,
          type: (item?.type || 'general') as any,
          allowed_languages: selectedLanguages,
          status: 'pending' as const,
        }
      })

      await onSubmit({
        email: email.trim(),
        full_name: fullName.trim() || email.trim().split('@')[0] || 'User',
        password: password.trim(),
        role,
        target_url: selectedPipelines[0] || '/assessment',
        assigned_assessments,
        allowed_languages: selectedLanguages,
      })
      reset()
      onOpenChange(false)
    } catch {
      /* parent shows toast; keep dialog open */
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Provision Candidate / User</DialogTitle>
            <DialogDescription>
              Creates a candidate account and generates a <strong>multi-assessment invite link</strong> supporting Codeathons, Hackathons, CAD tests, and language restrictions.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 text-xs">
            <div className="grid gap-2">
              <Label htmlFor="add-user-email">Email Address</Label>
              <Input
                id="add-user-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="candidate@company.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-user-name">Full Name</Label>
              <Input
                id="add-user-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="add-user-password">Password (optional)</Label>
              <Input
                id="add-user-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to auto-generate"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-user-role">Role</Label>
              <select
                id="add-user-role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="user">Candidate / User</option>
                <option value="tenant_admin">Organization admin</option>
                <option value="superadmin">Platform admin</option>
              </select>
            </div>

            {role === 'user' && (
              <>

            <div className="grid gap-2">
              <Label className="font-semibold text-foreground">Assigned Assessment Pipeline (Select Multiple)</Label>
              <div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/20 p-3">
                {AVAILABLE_PIPELINES.map((p) => {
                  const active = selectedPipelines.includes(p.url)
                  return (
                    <label
                      key={p.url}
                      className={`flex items-center gap-2.5 p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                        active
                          ? 'border-primary bg-primary/10 font-medium text-foreground'
                          : 'border-border bg-card text-muted-foreground hover:bg-accent/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => togglePipeline(p.url)}
                        className="rounded text-primary focus:ring-primary h-3.5 w-3.5"
                      />
                      <span>{p.title}</span>
                      <span className="ml-auto font-mono text-[10px] opacity-70">{p.url}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="font-semibold text-foreground">Allowed Code Assessment Languages</Label>
              <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/20 p-3">
                {ALL_LANGUAGES.map((lang) => {
                  const active = selectedLanguages.includes(lang)
                  return (
                    <label
                      key={lang}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs cursor-pointer capitalize transition-colors ${
                        active
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold'
                          : 'border-border bg-card text-muted-foreground hover:bg-accent/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleLanguage(lang)}
                        className="rounded text-emerald-500 focus:ring-emerald-500 h-3 w-3"
                      />
                      <span>{lang}</span>
                    </label>
                  )
                })}
              </div>
            </div>
              </>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Generating Link…' : 'Generate Multi-Assessment Candidate Link'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
