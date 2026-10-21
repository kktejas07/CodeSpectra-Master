/**
 * Admin agent tool registry. Read tools run immediately; write tools only
 * propose — execute() runs from the confirm endpoint (lib/agent/actions.ts).
 * No user-deletion tools; money decisions (marketplace refunds / payouts) are
 * superadmin-only proposals with the 'money' risk.
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
import { createContestTool, publishContestTool, releaseContestResultsTool } from './write/contests'
import { getQuestionCoverageTool } from './read/question-bot'
import { runQuestionBotTool } from './write/question-bot'
import { buildCompanyTestTool } from './write/company-tests'
import {
  listJobsTool, getJobTool, listApplicantsTool, getApplicationTool, getInterviewScorecardsTool, getHiringFunnelTool, getBgvStatusTool,
} from './read/ats'
import {
  createJobTool, updateJobTool, setJobStatusTool, moveApplicationStageTool, rejectApplicationTool, shortlistApplicantsTool,
  scheduleInterviewTool, startBotScreeningTool, recordHrDecisionTool,
} from './write/ats'
import {
  listMarketplaceProductsTool, listMarketplaceOrdersTool, listMarketplaceSellersTool, listMarketplacePayoutsTool, getMarketplaceSalesTool,
  listLearnTopicsTool, listLearnPostsTool, searchFeedEventsTool, getFeedStatsTool,
  listWorkflowsTool, listWorkflowRunsTool, listWorkflowTemplatesTool, getCopilotUsageTool, getPlatformKpisTool,
} from './read/modules'
import {
  moderateProductTool, decideRefundTool, decidePayoutTool, generateLearnDraftTool, setLearnPostStatusTool, setFeedEventVisibilityTool,
  createWorkflowFromTemplateTool, setWorkflowEnabledTool, rerunWorkflowRunTool, scheduleAgentTaskTool,
  updateCodeathonTool, publishCodeathonTool, updateProblemTool, publishProblemTool, addQuestionsToBankTool,
} from './write/modules'

export const ALL_TOOLS: AnyTool[] = [
  // read
  searchKnowledgeTool,
  listTestsTool, getTestTool, getTestResultsTool, getCandidateTool, listInvitesTool,
  listHackathonsTool, getHackathonTool, listCodeathonsTool, getCodeathonTool,
  searchQuestionBankTool, searchProblemsTool, getQuestionCoverageTool,
  getAnalyticsTool, getPlanUsageTool,
  // hiring pipeline (ATS)
  listJobsTool, getJobTool, listApplicantsTool, getApplicationTool, getInterviewScorecardsTool, getHiringFunnelTool, getBgvStatusTool,
  // marketplace, Learn, events feed, automations, usage
  listMarketplaceProductsTool, listMarketplaceOrdersTool, listMarketplaceSellersTool, listMarketplacePayoutsTool, getMarketplaceSalesTool,
  listLearnTopicsTool, listLearnPostsTool, searchFeedEventsTool, getFeedStatsTool,
  listWorkflowsTool, listWorkflowRunsTool, listWorkflowTemplatesTool, getCopilotUsageTool, getPlatformKpisTool,
  // write
  createTestTool, updateTestTool, publishTestTool,
  buildCompanyTestTool,
  inviteCandidatesTool, sendRemindersTool,
  releaseScoresTool, recordOutcomesTool, shortlistCandidatesTool,
  createHackathonTool, updateHackathonTool, publishHackathonTool, assignJudgesTool, releaseHackathonResultsTool,
  createCodeathonTool, releaseCodeathonResultsTool,
  createContestTool, publishContestTool, releaseContestResultsTool,
  createProblemTool,
  revokeCertificateTool,
  createJobTool, updateJobTool, setJobStatusTool, moveApplicationStageTool, rejectApplicationTool, shortlistApplicantsTool,
  scheduleInterviewTool, startBotScreeningTool, recordHrDecisionTool,
  moderateProductTool, decideRefundTool, decidePayoutTool, generateLearnDraftTool, setLearnPostStatusTool, setFeedEventVisibilityTool,
  createWorkflowFromTemplateTool, setWorkflowEnabledTool, rerunWorkflowRunTool, scheduleAgentTaskTool,
  updateCodeathonTool, publishCodeathonTool, updateProblemTool, publishProblemTool, addQuestionsToBankTool,
  runQuestionBotTool,
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
