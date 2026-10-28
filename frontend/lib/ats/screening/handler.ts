/**
 * bot_screen stage handler: on stage entry, create the ScreeningCall for the
 * first usable channel and start it. The engine runs onEnter once per entry
 * (ats_stage_runs ledger) and startBotScreen is itself idempotent per entry.
 * Imported for its side effect from lib/ats/handlers/index.ts.
 */
import { registerStageHandler } from '@/lib/ats/handlers'
import { startBotScreen } from './machine'

registerStageHandler({
  type: 'bot_screen',
  async onEnter(ctx) {
    await startBotScreen(ctx)
  },
})
