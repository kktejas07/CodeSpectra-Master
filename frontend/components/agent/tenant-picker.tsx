'use client'

import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useAdminT } from '@/lib/i18n/admin'

/** Value used for "Whole platform" (the server treats it like null). */
export const PLATFORM_SCOPE = 'platform'

interface TenantOption {
  id: string
  name: string
  is_active: boolean
}

/** Organisations for the superadmin picker; [] for everyone else (no request made). */
export function useTenantOptions(enabled: boolean) {
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [loading, setLoading] = useState(enabled)
  useEffect(() => {
    if (!enabled) return
    let live = true
    setLoading(true)
    fetch('/api/admin/agent/tenants', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { tenants: [] }))
      .then((d: { tenants?: TenantOption[] }) => { if (live) setTenants(d.tenants ?? []) })
      .catch(() => undefined)
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [enabled])
  return { tenants, loading }
}

/** Superadmin-only scope picker: "Whole platform" or one organisation. */
export function TenantPicker({
  value,
  onChange,
  disabled,
  className,
  id = 'tenant-scope',
}: {
  value: string | null
  onChange: (tenantId: string | null) => void
  disabled?: boolean
  className?: string
  id?: string
}) {
  const { tenants, loading } = useTenantOptions(true)
  const { t } = useAdminT()
  const current = value ?? PLATFORM_SCOPE
  // Keep a stored tenant selectable even if it is not in the list (deleted/renamed).
  const missing = value && !tenants.some((o) => o.id === value)
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <label htmlFor={id} className="sr-only">{t('copilot.scopeLabel')}</label>
      <Select value={current} onValueChange={(v) => onChange(v === PLATFORM_SCOPE ? null : v)} disabled={disabled || loading}>
        <SelectTrigger id={id} className="h-8 w-[14rem] max-w-full rounded-full" aria-label={t('copilot.scopeLabel')}>
          <Building2 aria-hidden className="size-4 text-muted-foreground" />
          <SelectValue placeholder={loading ? t('copilot.loadingOrgs') : t('copilot.wholePlatform')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={PLATFORM_SCOPE}>{t('copilot.wholePlatform')}</SelectItem>
          {missing && <SelectItem value={value!}>{t('copilot.orgId', { id: value })}</SelectItem>}
          {tenants.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.is_active ? o.name : t('copilot.inactive', { name: o.name })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
