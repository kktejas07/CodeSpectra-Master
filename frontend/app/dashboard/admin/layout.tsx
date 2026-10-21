/**
 * Admin console segment: provides the admin catalog (lib/i18n/admin.tsx) in
 * the admin's interface language. Access control stays where it was (proxy +
 * page guards); this layout only adds text.
 */
import { AdminI18n } from '@/components/i18n/admin-i18n'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminI18n>{children}</AdminI18n>
}
