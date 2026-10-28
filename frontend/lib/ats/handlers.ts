/**
 * Stage handler registry (contract: StageHandler). Parts register handlers by
 * side-effect import in lib/ats/handlers/index.ts; the engine looks them up.
 */
import type { StageHandler, StageType } from './contract'

const registry = new Map<StageType, StageHandler>()

export function registerStageHandler(h: StageHandler): void {
  registry.set(h.type, h)
}

export function getStageHandler(type: StageType): StageHandler | undefined {
  return registry.get(type)
}

/** Tests only. */
export function __clearStageHandlers(): void {
  registry.clear()
}
