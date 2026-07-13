'use client'

import { LlmSettingsSection } from '@/components/dashboard/settings/llm-section'
import { usePageGuard } from '@/lib/use-page-guard'

export default function LlmSettingsStandalonePage() {
  const gate = usePageGuard('/dashboard/admin/settings')
  if (!gate.ready) return null
  return <LlmSettingsSection />
}