# In-app purchases — policy, build flag, risk

## What the app does today

Both store apps hide every purchase action by default:

| Where | In a browser | In the app (IAP off) |
| --- | --- | --- |
| `/dashboard/pricing`, `/dashboard/checkout` | plans + checkout | "Manage your plan on the web" note (no button, no link, no prices) |
| Billing → *Upgrade / change plan* | button | the same note, short form |
| Problem packs → *Unlock* | button | the same note, short form |

Code: `components/native/native-purchase-gate.tsx` → `nativePurchasesAllowed()`
in `frontend/lib/native-bridge.ts`. Existing plans and purchases keep working in
the app (entitlements come from the server), only *buying* is hidden.

The marketplace (`/marketplace`, mentor sessions / physical items) is **not**
gated: Apple 3.1.3(d)/(e) and Play allow outside payment for person-to-person
real-time services and physical goods. Re-check this if the marketplace starts
selling digital content (courses, packs, recordings) — wrap its `BuyBox` /
`CheckoutClient` in `NativePurchaseGate` then.

### Build flag

The shells add `CSIAP/1` to their user agent **only** when IAP is on:

- **iOS**: build setting `CS_IAP_ENABLED` (default `NO`, project file) →
  Info.plist `CSIAPEnabled` → `CodeSpectraViewController`. CI: repository
  variable `CS_IAP_ENABLED=YES`.
- **Android**: `CS_IAP_ENABLED=1` when running `npm run sync`
  (`scripts/flavor-configs.mjs` → `android.appendUserAgent`).

Turn it on only together with a real store-billing integration (StoreKit 2 /
Play Billing, server receipt validation, entitlement sync, restore purchases,
refunds via App Store Server Notifications / RTDN). That integration is **not
built**.

## Apple rules (App Review Guidelines 3.1)

- **3.1.1** Digital content and subscriptions unlocked *in the app* must use
  IAP. The app may not include buttons, external links or other calls to action
  that direct users to another way of paying — except where an entitlement or
  storefront rule below allows it.
- **3.1.3(a) Reader apps** (magazines, newspapers, books, audio, music, video)
  may let users access previously bought content and, with the *External Link
  Account Entitlement*, link to the website to create/manage an account.
  **CodeSpectra is an assessment / learning platform, not a reader app**, so
  this entitlement is not expected to be granted — do not rely on it.
- **3.1.3(b) Multiplatform services**: users may use in the app what they
  bought elsewhere (web), as long as those items are not also offered for sale
  in the app outside IAP. This is the basis of what we ship.
- **External purchase link entitlements**: the *StoreKit External Purchase
  Link Entitlement* exists for specific storefronts (EU under the DMA, the
  Netherlands for dating, South Korea) with Apple's commission and disclosure
  sheet. In the **US storefront** (court order, 2025) apps may include buttons
  / links to web purchase without an entitlement; that rule is US-only and
  still being litigated. **India — our main market — has no such exception.**

## Google Play

Digital goods must use Play Billing, or in India Play's **User Choice Billing**
(alternative billing beside Play Billing, reduced service fee). Hiding the
purchase UI in the app and selling on the web is allowed as long as the app
does not lead users to the web checkout. See `PLAY_STORE.md → Billing`.

## Risk

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Reviewer reads "Manage your plan on the web" as a call to action (3.1.1) | Medium | No link, no button, no price; if rejected, switch the copy to "Plans can't be changed in the app" (`common.manageOnWeb*` in `lib/i18n/messages/*/common.json`) |
| A purchase path we missed (new page, email deep link to `/dashboard/checkout`) | Medium | `/dashboard/checkout` itself is gated; wrap new purchase UI in `NativePurchaseGate`; search for `api/billing/checkout` before each release |
| Upsell copy elsewhere ("Upgrade to Pro" banners, plan-gated lock page) | Medium | Lock pages may say a feature needs a plan but must not show a buy button in the app — review `/dashboard/locked` text before submission |
| Apple asks for IAP anyway because the app is "primarily" a paid service | Low–medium | Free tier is fully usable in the app; be ready to integrate StoreKit 2 (≈ 2–3 weeks incl. server validation) |
| US-only external-link rule changes again | Low | We don't depend on it |

Decision to confirm (owner): ship v1 with IAP **off** (web-only sales), or
budget StoreKit 2 + Play Billing before launch.
