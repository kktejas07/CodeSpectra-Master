> **Customer Documentation**
> **Last Updated**: 2026-10-21
> **Audience**: Organization admins and recruiters

# Background Checks (BGV) Guide

Background verification is a pipeline stage (**BGV**) you can add to any job. Settings live under **Hiring → Settings → BGV**.

## How a check runs

1. When a candidate enters the BGV stage, a case is created with the checks for their region (for example identity, address, education, employment, criminal record, references).
2. The candidate gets a secure portal link to give consent and upload the documents each check needs. Reminders go out automatically until the deadline.
3. Checks are verified by your team (manual), by a connected vendor (Checkr in the US; IDfy or AuthBridge in India), or in a simulated mode for testing.
4. The case ends as **clear**, **consider** (needs a decision) or **failed**.

## Connecting a vendor

Vendors are set per company under **Hiring → Settings → Background checks** (hiring admins only). Keys are stored encrypted, are never shown again after saving, and are never written to logs. A BGV stage uses a vendor when you pick it in the stage's settings; checks the vendor can't run stay with your verifiers. Nothing is sent to a vendor until the candidate has signed (and not withdrawn) consent, and only the fields each check needs are sent.

Every vendor has a **Test connection** button that checks the saved credentials without ordering anything.

### Checkr (USA)

1. Paste the API key (and optionally a separate webhook secret), pick the package slug and mode, save.
2. In the Checkr dashboard add the webhook URL shown on the page (events: report.created, report.completed, invitation.completed).

### IDfy (India)

IDfy checks these at the government source: **PAN**, the **government ID** the candidate chose (driving licence, voter ID or passport — the candidate can optionally give its number), and **UAN / EPFO service history** and **court records** if your IDfy plan includes those tasks. Aadhaar (we only ever hold the last 4 digits and the masked e-Aadhaar), education, employment, address and references stay with your verifiers.

1. Get an IDfy (Eve) API account: IDfy issues an **account ID** and an **API key**, with separate accounts for sandbox (pre-production) and production.
2. Paste both, choose **Sandbox** or **Production** (the base URL defaults to `https://eve.idfy.com/v3`), and check the **task paths** — the defaults are IDfy's standard India checks (`verify_with_source/ind_pan`, `…/ind_driving_license`, `…/ind_voter_id`, `…/ind_passport`). Ask your IDfy account manager for the UAN and court-record task paths if you want those; leave a path empty to keep that check manual.
3. Turn IDfy on and save. The page then shows your **callback URL** (it contains a secret token — keep it private). Email it to IDfy support (eve.support@idfy.com) to have callbacks configured. Use **New callback token** if it ever leaks, and send IDfy the new URL.
4. Optional: **Only accept callbacks from IDfy's IP addresses** (IDfy publishes its webhook IPs; your proxy must pass the real client IP).
5. **Test connection**, then run one case in sandbox before switching to production.

How results arrive: IDfy calls the callback when a task finishes; we then read the result over the authenticated API (the callback itself is never trusted for results). If a callback is missed, the scheduler checks open IDfy checks every 30 minutes. "Record found" → verified; "not found", or a name at source that doesn't match the candidate's name (can be turned off) → discrepancy; a failed task → unable to verify. Only the verdict and a neutral note are stored, never the government record itself.

### AuthBridge (India)

AuthBridge's API isn't public, so **configure everything from your AuthBridge onboarding pack**. It is off until you turn it on.

1. Base URLs for sandbox and production, and which one is live.
2. Sign-in method: OAuth client credentials (client ID + secret, token path, optional scope), an API key in a named header, or Basic.
3. For each check: the path to send it to and AuthBridge's check code (empty path = manual). Each check is sent as `{ reference_id, check_code, candidate, details }` with only that check's details (Aadhaar: last 4 digits only; no documents).
4. Response mapping: where the reference and status are in AuthBridge's answers (dotted paths such as `data.status`), and which status values mean verified, discrepancy or unable to verify.
5. Webhook: signature header, HMAC algorithm (SHA-256 / SHA-512 / SHA-1), hex or base64, optional prefix such as `sha256=`, the event ID field (for duplicate detection) and the webhook signing secret. Give AuthBridge the webhook URL shown on the page.
6. Optional: a status path (with `{ref}`) so the scheduler can poll every 30 minutes, and a test path for **Test connection**.

## Case statuses

- **Invited** — waiting for the candidate to open the portal
- **In progress** — the candidate is filling it in
- **Submitted** — everything is in; verification can start
- **Verifying** — checks are being verified
- **Clear** — every check passed; the candidate moves on
- **Consider** — something needs a recruiter's decision
- **Failed** / **Cancelled**

## Decisions and adverse action

For a **consider** result, a recruiter decides to proceed or not. In regions that require it, deciding not to proceed starts the adverse-action steps: a pre-adverse notice, a waiting period, then the final notice.

## Privacy

Sensitive values (for example ID numbers) are encrypted and masked; documents are only shown to staff with access, and every view is logged. Case data is erased after the retention period or when the candidate asks. The AI copilot can tell you a case's status and which checks are pending, but never shows documents or personal data.
