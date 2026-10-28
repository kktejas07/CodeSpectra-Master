/**
 * AI credits for the copilot (AGT-001): charged for the tokens actually used
 * (lib/agent/metering.ts) — every status, including stopped or failed turns,
 * pays for what ran; a turn that used no tokens costs nothing. The old flat
 * "1 credit + 1 per 4 tool calls" rule is gone.
 */
export { chargeFor, creditsForUsage, pricingText, DEFAULT_METER, type MeterConfig, type TurnCharge, type UsageEntry } from './metering'
