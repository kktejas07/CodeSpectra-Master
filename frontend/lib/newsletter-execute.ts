/**
 * Newsletter campaign execution — separated from the route handlers so both
 * `campaigns/route.ts` (create → send now) and `campaigns/[id]/route.ts`
 * (resume a draft → re-send) can invoke it. Next.js forbids extra exports in
 * route modules, so this lives here instead.
 */
import { emailCampaigns, nowIso, type EmailCampaignDoc } from '@/lib/db/email-campaigns'
import { newsletterSubscribers } from '@/lib/db/newsletter'
import { getMongoDb } from '@/lib/mongodb'

export async function executeCampaign(campaign: EmailCampaignDoc) {
  const col = await emailCampaigns()
  const subsCol = await newsletterSubscribers()
  const db = await getMongoDb()

  try {
    const subs = await subsCol.find({ status: 'subscribed' }).project({ email: 1, _id: 0 }).toArray()
    const { emailTemplates } = await import('@/lib/email-templates')
    const { sendEmail } = await import('@/lib/send-email')
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    let emailOk = 0, emailFail = 0, pushOk = 0, pushFail = 0, inAppOk = 0, whatsappOk = 0, whatsappFail = 0

    // Email channel - batch sends with concurrency control
    if (campaign.channels.email) {
      const { renderNewsletterHtml } = await import('@/lib/newsletter-html')
      const { newsletterUnsubToken } = await import('@/lib/newsletter-token')
      const EMAIL_BATCH_SIZE = 10
      const EMAIL_CONCURRENCY = 5
      // Pre-render HTML for each subscriber (personalized unsubscribe links)
      const emailTasks: { email: string; html: string }[] = []
      for (const sub of subs) {
        const email = String(sub.email)
        const hmacToken = await newsletterUnsubToken(email)
        const html = renderNewsletterHtml({
          subject: campaign.subject,
          hero_image: campaign.hero_image,
          intro: campaign.intro,
          body: campaign.body,
          cta_text: campaign.cta_text,
          cta_url: campaign.cta_url,
        }).replace(/__EMAIL__/g, encodeURIComponent(email))
          .replace(/unsubscribe\?email=[^"]*/, `unsubscribe?email=${encodeURIComponent(email)}&t=${hmacToken}`)
        emailTasks.push({ email, html })
      }

      // Process in concurrent batches
      for (let i = 0; i < emailTasks.length; i += EMAIL_BATCH_SIZE) {
        const batch = emailTasks.slice(i, i + EMAIL_BATCH_SIZE)
        const results = await Promise.allSettled(
          batch.map(({ email, html }) => sendEmail(email, { subject: campaign.subject, html }, undefined, {
            category: 'newsletter',
            campaignId: campaign.id,
          }))
        )
        for (const r of results) {
          if (r.status === 'fulfilled') emailOk++
          else emailFail++
        }
      }
    }

    // Push + in-app (AUTO-113): only accounts whose address is a subscribed newsletter address, through
    // notify() (type 'newsletter', class 'marketing') — each person's push switch, quiet hours and the
    // shared per-person limit apply, once per campaign. Never a broadcast to every token or every user.
    // WhatsApp: only people who agreed to WhatsApp (AUTO-060), admitted as the same logical message.
    const wantsBell = !!(campaign.channels.push || campaign.channels.in_app)
    const wantsWa = !!campaign.channels.whatsapp
    if (wantsBell || wantsWa) {
      const subscribedUsers = new Set<string>()
      const emails = subs.map((sub) => String(sub.email || '').trim().toLowerCase()).filter(Boolean)
      for (let i = 0; i < emails.length; i += 1000) {
        const rows = await db.collection('user').find({ email: { $in: emails.slice(i, i + 1000) } }).project({ id: 1, _id: 1 }).toArray().catch(() => [])
        for (const u of rows) {
          const uid = String(u.id || u._id || '')
          if (uid && uid !== 'undefined') subscribedUsers.add(uid)
        }
      }
      const link = `/newsletter/${campaign.id}`
      const message = (campaign.intro || campaign.body?.replace(/<[^>]*>/g, '').slice(0, 200) || 'New newsletter').slice(0, 300)
      const budget = (channel: string) => ({ class: 'marketing' as const, topic: 'newsletter', object: String(campaign.id), source: 'newsletter', channel })

      if (wantsBell) {
        const { notify } = await import('@/lib/notifications')
        for (const uid of subscribedUsers) {
          let held = false
          const n = await notify({
            user_id: uid, type: 'newsletter', title: campaign.subject, message, link, icon: 'mail',
            metadata: { campaignId: campaign.id, campaign_id: String(campaign.campaign_id || '') },
            skip_push: !campaign.channels.push,
            budget: budget('in_app'),
            on_held: () => { held = true },
          }).catch(() => null)
          if (n) { inAppOk++; if (campaign.channels.push) pushOk++ }
          else if (!held && campaign.channels.push) pushFail++
        }
      }

      if (wantsWa) {
        try {
          // Consent: the WhatsApp preference switched on or an active WhatsApp subscription — and a newsletter subscriber.
          const [prefRows, subRows] = await Promise.all([
            db.collection('notification_preferences').find({ type: 'whatsapp', enabled: true }, { projection: { user_id: 1 } }).limit(50_000).toArray(),
            db.collection('subscriptions').find({ whatsapp_status: 'active', user_id: { $type: 'string' } }, { projection: { user_id: 1 } }).limit(50_000).toArray(),
          ])
          const userIds = [...new Set([...prefRows, ...subRows].map((r) => String(r.user_id || '')).filter((u) => u && subscribedUsers.has(u)))]
          const { sendWhatsAppToUser } = await import('@/lib/whatsapp-send')
          const { admitMessage } = await import('@/lib/messaging/budget')
          const text = (campaign.intro || campaign.body?.replace(/<[^>]*>/g, '').slice(0, 300) || 'New update from CodeSpectra').slice(0, 900)
          for (const uid of userIds) {
            const a = await admitMessage({ userId: uid }, budget('whatsapp')).catch(() => null)
            if (a && !a.ok) continue
            const r = await sendWhatsAppToUser(uid, { kind: 'newsletter', title: String(campaign.subject || 'CodeSpectra update'), text }).catch(() => ({ sent: false, skipped: 'error' as const }))
            if (a) await (r.sent ? a.commit() : a.release())
            if (r.sent) whatsappOk++
            else if (r.skipped === 'error') whatsappFail++
          }
        } catch {
          // WhatsApp is best-effort
        }
      }
    }

    // Update campaign stats
    await col.updateOne(
      { id: campaign.id },
      {
        $set: {
          status: 'completed',
          email_ok: emailOk,
          email_fail: emailFail,
          push_ok: pushOk,
          push_fail: pushFail,
          in_app_ok: inAppOk,
          whatsapp_ok: whatsappOk,
          whatsapp_fail: whatsappFail,
          completed_at: nowIso(),
        }
      }
    )
  } catch (e) {
    console.error('[newsletter] executeCampaign error:', e)
    await col.updateOne(
      { id: campaign.id },
      { $set: { status: 'failed', completed_at: nowIso() } }
    )
  }
}
