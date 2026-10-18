'use client'

import { BotMessageSquare } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'
import { PageHeader } from '@/components/app/page-kit'
import { AgentCopilot, AgentStatusBadges } from '@/components/agent/agent-copilot'
import { useAgentChat } from '@/components/agent/use-agent-chat'

function CopilotScreen() {
  const chat = useAgentChat()
  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="AI copilot"
        description="Ask questions about your tests, candidates and events, or have the copilot draft changes for you to review and confirm."
        icon={<BotMessageSquare />}
        actions={<AgentStatusBadges chat={chat} />}
        className="mb-4"
      />
      <AgentCopilot chat={chat} />
    </div>
  )
}

export default function AdminAgentPage() {
  const gate = usePageGuard('/dashboard/admin/agent')
  if (!gate.ready) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-4" aria-busy="true">
        <div className="h-12 w-64 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        <div className="h-[60dvh] animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />
      </div>
    )
  }
  return <CopilotScreen />
}
