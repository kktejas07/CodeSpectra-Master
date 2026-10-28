/**
 * Stage handlers for virtual_interview and f2f_interview (registered by the
 * side-effect import in lib/ats/handlers/index.ts). On entry: create the
 * interview (awaiting_schedule) with the stage panel, then either email/WhatsApp
 * the candidate a self-schedule link or ask the recruiter to schedule. The
 * panel's scorecards later call recordStageResult (service.ts maybeFinalize).
 */
import { registerStageHandler } from '@/lib/ats/handlers'
import type { StageHandler } from '@/lib/ats/contract'
import { createForStage } from './service'

export const virtualInterviewHandler: StageHandler = {
  type: 'virtual_interview',
  async onEnter(ctx) {
    await createForStage(ctx)
  },
}

export const f2fInterviewHandler: StageHandler = {
  type: 'f2f_interview',
  async onEnter(ctx) {
    await createForStage(ctx)
  },
}

registerStageHandler(virtualInterviewHandler)
registerStageHandler(f2fInterviewHandler)
