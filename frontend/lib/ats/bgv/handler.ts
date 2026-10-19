/**
 * Stage handler for 'bgv' (registered by the side-effect import in
 * lib/ats/handlers/index.ts). On entry: resolve the region, create the case
 * with the configured checks (idempotent on the stage-entry key) and send the
 * candidate the signed portal link. The overall result later goes to
 * recordStageResult (service.ts afterChange / decisions).
 */
import { registerStageHandler } from '@/lib/ats/handlers'
import type { StageHandler } from '@/lib/ats/contract'
import { createCaseForStage } from './service'

export const bgvHandler: StageHandler = {
  type: 'bgv',
  async onEnter(ctx) {
    await createCaseForStage(ctx)
  },
}

registerStageHandler(bgvHandler)
