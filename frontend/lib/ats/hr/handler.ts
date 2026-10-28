/**
 * Stage handler for 'hr_round' (registered by the side-effect import in
 * lib/ats/handlers/index.ts). See lib/ats/hr/service.ts.
 */
import { registerStageHandler } from '@/lib/ats/handlers'
import type { StageHandler } from '@/lib/ats/contract'
import { onHrRoundEnter } from './service'

export const hrRoundHandler: StageHandler = {
  type: 'hr_round',
  async onEnter(ctx) {
    await onHrRoundEnter(ctx)
  },
}

registerStageHandler(hrRoundHandler)
