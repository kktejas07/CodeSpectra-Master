/**
 * CORE-038: store rules (Apple 3.1.1, Google Play payments) — the phone apps
 * may not sell digital goods outside in-app purchase. The UI hides every buy
 * button in the app (components/native/native-purchase-gate.tsx); this is the
 * server half, so a checkout started from inside the app shell is refused
 * even if a button slipped through.
 *
 * The shell appends `CodeSpectraAndroid/1` / `CodeSpectraIOS/1` to its user
 * agent (mobile/capacitor/capacitor.config.json); an IAP-enabled iOS build
 * adds `CSIAP/1`. A checkout from the app is allowed only when the build says
 * IAP is on AND the operator turned it on server-side (NATIVE_IAP_ENABLED=1,
 * only once a real StoreKit / Play Billing flow exists).
 *
 * ponytail: the user agent is client-controlled — this blocks the app shell
 * (the store-review risk), not a determined user, which is all it needs to do.
 */
import { apiErrorFor } from '@/lib/api-errors'

const NATIVE_UA = /\bCodeSpectra(Android|IOS)\//
const IAP_UA = /\bCSIAP\/1\b/

/** Pure: may this request start a web checkout? */
export function webCheckoutAllowed(userAgent: string, serverIapEnabled: boolean): boolean {
  if (!NATIVE_UA.test(userAgent || '')) return true
  return serverIapEnabled && IAP_UA.test(userAgent)
}

export function serverIapEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.NATIVE_IAP_ENABLED || '').trim() === '1'
}

/** 403 Response for a checkout from the app shell, or null to continue. */
export function nativeCheckoutBlock(req: Request): Response | null {
  const ua = req.headers.get('user-agent') || ''
  if (webCheckoutAllowed(ua, serverIapEnabled())) return null
  return Response.json(apiErrorFor('native_purchase_blocked'), { status: 403 })
}
