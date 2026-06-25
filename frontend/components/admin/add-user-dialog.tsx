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
  }) => Promise<void>
}

export function AddUserDialog({ open, onOpenChange, onSubmit }: AddUserDialogProps) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('user')
  const [loading, setLoading] = useState(false)

  const reset = () => {
    setEmail('')
    setFullName('')
    setPassword('')
    setRole('user')
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
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              Creates a Supabase Auth account and a matching row in <code className="text-xs">profiles</code>. Leave
              the password empty to use the platform&apos;s <strong>Admin user invitations</strong> setting (Supabase
              invite or a secure link via Resend/SendGrid — no plaintext password by email). If you set a password
              here, that exact value is used and no invitation email is sent.
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
                <option value="user">User</option>
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
              {loading ? 'Creating…' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
