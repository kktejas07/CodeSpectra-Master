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
  }) => Promise<void>
}

export function AddUserDialog({ open, onOpenChange, onSubmit }: AddUserDialogProps) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('user')
  const [targetUrl, setTargetUrl] = useState('/assessment')
  const [loading, setLoading] = useState(false)

  const reset = () => {
    setEmail('')
    setFullName('')
    setPassword('')
    setRole('user')
    setTargetUrl('/assessment')
    setLoading(false)
  }

  const handleClose = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onSubmit({
        email: email.trim(),
        full_name: fullName.trim() || email.trim().split('@')[0] || 'User',
        password: password.trim(),
        role,
        target_url: targetUrl,
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
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Provision Candidate / User</DialogTitle>
            <DialogDescription>
              Creates a user account and generates a <strong>single-use secure candidate assessment link</strong> bound to their profile and assigned assessment pipeline.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="add-user-email">Email</Label>
              <Input
                id="add-user-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-user-name">Full name</Label>
              <Input
                id="add-user-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-user-target">Assigned Assessment Pipeline</Label>
              <select
                id="add-user-target"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="/assessment">General AI Assessment (/assessment)</option>
                <option value="/dashboard/identity-verify">Identity & Proctoring Check (/dashboard/identity-verify)</option>
                <option value="/assessment/demo/cad">CAD Technical Assessment (/assessment/demo/cad)</option>
                <option value="/dashboard/problems">Coding Challenge IDE (/dashboard/problems)</option>
              </select>
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
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Generating Link…' : 'Generate Candidate Link & Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
