/**
 * Admin agent tool registry. Read tools run immediately; write tools only
 * propose — execute() runs from the confirm endpoint (lib/agent/actions.ts).
 * No payment or user-deletion tools, by design.
 */
import type { AgentCaller, AgentTool } from '@/lib/agent/contract'
import type { AnyTool } from './types'
import { searchKnowledgeTool } from './read/knowledge'
import { listTestsTool, getTestTool, getTestResultsTool, getCandidateTool, listInvitesTool } from './read/tests'
import { listHackathonsTool, getHackathonTool, listCodeathonsTool, getCodeathonTool } from './read/events'
import { searchQuestionBankTool, searchProblemsTool } from './read/library'
import { getAnalyticsTool, getPlanUsageTool } from './read/insights'
import { createTestTool, updateTestTool, publishTestTool } from './write/tests'
import {
  inviteCandidatesTool, sendRemindersTool, releaseScoresTool, recordOutcomesTool, shortlistCandidatesTool, revokeCertificateTool,
} from './write/candidates'
import {
  createHackathonTool, updateHackathonTool, publishHackathonTool, assignJudgesTool, releaseHackathonResultsTool,
  createCodeathonTool, releaseCodeathonResultsTool,
} from './write/events'
import { createProblemTool } from './write/problems'

export const ALL_TOOLS: AnyTool[] = [
  // read
  searchKnowledgeTool,
  listTestsTool, getTestTool, getTestResultsTool, getCandidateTool, listInvitesTool,
  listHackathonsTool, getHackathonTool, listCodeathonsTool, getCodeathonTool,
  searchQuestionBankTool, searchProblemsTool,
  getAnalyticsTool, getPlanUsageTool,
  // write
  createTestTool, updateTestTool, publishTestTool,
  inviteCandidatesTool, sendRemindersTool,
  releaseScoresTool, recordOutcomesTool, shortlistCandidatesTool,
  createHackathonTool, updateHackathonTool, publishHackathonTool, assignJudgesTool, releaseHackathonResultsTool,
  createCodeathonTool, releaseCodeathonResultsTool,
  createProblemTool,
  revokeCertificateTool,
]

const BY_NAME = new Map<string, AnyTool>(ALL_TOOLS.map((t) => [t.name, t]))

/** Tools this caller may use (role + tenant). */
export function toolsFor(caller: AgentCaller): AgentTool[] {
  if (caller.role !== 'superadmin' && caller.role !== 'tenant_admin') return []
  if (caller.role === 'tenant_admin' && !caller.tenantId) return []
  return ALL_TOOLS.filter((t) => t.roles.includes(caller.role)) as AgentTool[]
}

export function getTool(name: string): AgentTool | undefined {
  return BY_NAME.get(name) as AgentTool | undefined
}
