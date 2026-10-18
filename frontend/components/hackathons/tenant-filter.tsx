'use client'

/**
 * Superadmin-only organization filter for the hackathon / codeathon admin
 * lists. Values: '' (all), 'global' (platform events, no organization) or a
 * tenant id — passed to the list API as `?tenant=`. Company admins never see
 * this: their lists are always scoped to their own organization server-side.
 */
import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

interface TenantOption { id: string; name?: string }

const ALL = '__all__'

export function TenantFilter({ value, onChange, id = 'tenant-filter' }: { value: string; onChange: (v: string) => void; id?: string }) {
  const [tenants, setTenants] = useState<TenantOption[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/tenants', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => { if (!cancelled) setTenants(Array.isArray(j?.data) ? j.data : []) })
      .catch(() => { if (!cancelled) setTenants([]) })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground whitespace-nowrap">Organization</Label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
        <SelectTrigger id={id} className="h-9 w-56">
          <SelectValue placeholder="All organizations" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All organizations</SelectItem>
          <SelectItem value="global">Platform events (no organization)</SelectItem>
          {tenants.map((t) => (
            <SelectItem key={t.id} value={t.id}>{t.name || t.id}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Query-string suffix for the list APIs. */
export function tenantQuery(value: string): string {
  return value ? `tenant=${encodeURIComponent(value)}` : ''
}
