/**
 * India BGV vendors. Both are off until a hiring admin configures and turns
 * them on in Hiring settings → Background checks; until then manual
 * verification works for every India check.
 *
 *  - IDfy (./idfy.ts): Eve v3 tasks API — PAN, government ID (driving licence,
 *    voter ID, passport), and UAN / court record when your IDfy plan gives
 *    you those task paths. Other checks stay with your verifiers.
 *  - AuthBridge (./authbridge.ts): configurable adapter (base URLs, auth mode,
 *    per-check paths + codes, response mapping, webhook HMAC) — every value
 *    comes from your AuthBridge onboarding pack.
 */
export { idfyVendor } from './idfy'
export { authBridgeVendor } from './authbridge'
