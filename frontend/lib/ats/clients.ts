/** Client (staffing customer) input sanitising. Pure. */
import { safeHttpUrl } from '@/lib/safe-html'
import type { AtsClient } from './contract'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function sanitizeClient(b: Record<string, unknown>): Partial<AtsClient> {
  const name = typeof b.name === 'string' ? b.name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120) : ''
  const contacts = Array.isArray(b.contacts)
    ? b.contacts
        .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
        .slice(0, 20)
        .map((c) => ({
          name: typeof c.name === 'string' ? c.name.trim().slice(0, 120) : '',
          email: typeof c.email === 'string' ? c.email.trim().toLowerCase().slice(0, 254) : '',
          ...(typeof c.phone === 'string' && c.phone.trim() ? { phone: c.phone.trim().slice(0, 40) } : {}),
        }))
        .filter((c) => EMAIL.test(c.email))
    : undefined
  return { name, logo_url: typeof b.logo_url === 'string' ? safeHttpUrl(b.logo_url) : null, ...(contacts ? { contacts } : {}) }
}
