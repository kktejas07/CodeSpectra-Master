# Email deliverability (SPF, DKIM, DMARC, one-click unsubscribe)

**Audience:** whoever owns the sending domain's DNS and the Postal server.

Gmail and Yahoo reject or spam-folder bulk mail that isn't authenticated and
doesn't offer one-click unsubscribe. CodeSpectra sends engagement email
(re-engagement, digests, reminders) at bulk volume, so all of this is required
in production.

## What the app already does

| Item | Where |
|------|-------|
| Plain-text part with every HTML email (`plain_body`) | `lib/transactional-mail.ts` `htmlToText` |
| `List-Unsubscribe: <https://…/api/automation/unsubscribe?…>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) on non-billing/security mail | `lib/automation/mailer.ts` `listUnsubscribeHeaders` |
| Unsubscribe link in the footer of automation, notification and digest email | `lib/automation/mailer.ts`, `lib/notifications-delivery.ts` |
| Hard-bounce / complaint suppression | Postal webhook → `email_suppressions` |
| 15-second timeout on Postal calls; failures retried from `email_outbox` | `lib/transactional-mail.ts`, `lib/automation/outbox.ts` |
| Organisation workflows send as "Org name via CodeSpectra" and only to their own members, candidates and invitees | `lib/automation/actions.ts` |

## Environment

| Variable | Purpose |
|----------|---------|
| `AUTOMATION_LINK_SECRET` | Signs unsubscribe links. Falls back to `SESSION_SECRET` / `CRON_SECRET`, then a key derived from `SECRETS_ENCRYPTION_KEY`. With none set, production renders no one-click link (preferences link only). |
| `EMAIL_REPLY_TO` | Optional Reply-To for all mail (e.g. `support@yourdomain`). |
| `EMAIL_UNSUBSCRIBE_MAILTO` | Optional address added as a `mailto:` List-Unsubscribe target. |

## DNS records for the sending domain

Replace `mail.example.com` with the domain in your Postal "From" address.

1. **SPF** — authorise Postal's sending IPs:
   `mail.example.com. TXT "v=spf1 a mx include:spf.<your-postal-host> ~all"`
   (Postal shows the exact `include:` on the domain's DNS page.) Only one SPF
   record per name.
2. **DKIM** — Postal generates a key per domain. Publish the TXT record it
   shows, typically `postal-XXXX._domainkey.mail.example.com`. Postal marks
   the domain "DKIM: OK" once it resolves.
3. **Return path** — add Postal's `psrp.mail.example.com CNAME rp.<your-postal-host>`
   so bounces come back to Postal (needed for suppression to work) and SPF
   aligns on the envelope sender.
4. **DMARC** — start in monitoring mode, then tighten:
   `_dmarc.mail.example.com. TXT "v=DMARC1; p=none; rua=mailto:dmarc@example.com; adkim=r; aspf=r"`
   After two clean weeks of reports move to `p=quarantine`, later `p=reject`.
5. **MX** (optional) — only if the domain should also receive mail.

## Checks before going live

- Send to a Gmail address → "Show original": SPF, DKIM and DMARC all `PASS`.
- The message shows Gmail's "Unsubscribe" link next to the sender.
- `curl -X POST '<List-Unsubscribe URL>'` returns 200 and the address appears
  in `email_unsubscribes`.
- Keep the complaint rate under 0.3 % (Google Postmaster Tools).
