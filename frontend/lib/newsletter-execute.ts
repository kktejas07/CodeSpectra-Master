/**
 * Newsletter campaign execution — separated from the route handlers so both
 * `campaigns/route.ts` (create → send now) and `campaigns/[id]/route.ts`
 * (resume a draft → re-send) can invoke it. Next.js forbids extra exports in
 * route modules, so this lives here instead.
 */
import { emailCampaigns, newId, nowIso, type EmailCampaignDoc } from '@/lib/db/email-campaigns'
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

    // Push channel - send to all users with push tokens
    if (campaign.channels.push) {
      try {
        const pushTokens = await db.collection('push_tokens').find({}).project({ token: 1, user_id: 1, _id: 0 }).toArray()
        if (pushTokens.length > 0) {
          const { adminAuth } = await import('@/lib/firebase-admin')
          const auth = await adminAuth()
          if (auth) {
            const { getMessaging } = await import('firebase-admin/messaging')
            const messaging = getMessaging()
            // Batch send (max 500 per request)
            const tokens = pushTokens.map(t => String(t.token)).filter(t => t.length >= 20)
            for (let i = 0; i < tokens.length; i += 500) {
              const batch = tokens.slice(i, i + 500)
              try {
                const response = await messaging.sendEachForMulticast({
                  tokens: batch,
                  notification: { title: campaign.subject, body: campaign.intro || 'New update from CodeSpectra' },
                  data: { link: `/newsletter/${campaign.id}` },
                })
                pushOk += response.successCount
                pushFail += response.failureCount
              } catch {
                pushFail += batch.length
              }
            }
          }
        }
      } catch {
        pushFail = subs.length
      }
    }

    // In-app channel - create notification for all subscribed users
    if (campaign.channels.in_app) {
      try {
        // Keep _id — older user docs may lack `id`; projecting `_id:0` produced user_id="undefined"
        const users = await db.collection('user').find({}).project({ id: 1, _id: 1 }).toArray()
        const notifications = db.collection('notifications')
        const link = `/newsletter/${campaign.id}`
        const notifDocs = users
          .map(u => {
            const uid = String(u.id || u._id || '')
            if (!uid || uid === 'undefined') return null
            return {
              id: newId(),
              user_id: uid,
              title: campaign.subject,
              message: campaign.intro || campaign.body?.replace(/<[^>]*>/g, '').slice(0, 200) || 'New newsletter',
              type: 'newsletter',
              is_read: false,
              link,
              icon: 'mail',
              category: 'system',
              metadata: { campaignId: campaign.id, campaign_id: campaign.campaign_id },
              created_at: nowIso(),
            }
          })
          .filter((d): d is NonNullable<typeof d> => d !== null)
        if (notifDocs.length > 0) {
          await notifications.insertMany(notifDocs)
          inAppOk = notifDocs.length
        }
      } catch {
        // In-app is best-effort
      }
    }

    // WhatsApp channel — only people who agreed to WhatsApp (preference switched on or an active
    // WhatsApp subscription), never everyone with a phone number (AUTO-060). lib/whatsapp-send checks
    // consent and STOP opt-outs again per person and uses the approved newsletter template.
    if (campaign.channels.whatsapp) {
      try {
        const [prefRows, subRows] = await Promise.all([
          db.collection('notification_preferences').find({ type: 'whatsapp', enabled: true }, { projection: { user_id: 1 } }).limit(50_000).toArray(),
          db.collection('subscriptions').find({ whatsapp_status: 'active', user_id: { $type: 'string' } }, { projection: { user_id: 1 } }).limit(50_000).toArray(),
        ])
        const userIds = [...new Set([...prefRows, ...subRows].map((r) => String(r.user_id || '')).filter(Boolean))]
        const { sendWhatsAppToUser } = await import('@/lib/whatsapp-send')
        const text = (campaign.intro || campaign.body?.replace(/<[^>]*>/g, '').slice(0, 300) || 'New update from CodeSpectra').slice(0, 900)
        for (const uid of userIds) {
          const r = await sendWhatsAppToUser(uid, { kind: 'newsletter', title: String(campaign.subject || 'CodeSpectra update'), text })
          if (r.sent) whatsappOk++
          else if (r.skipped === 'error') whatsappFail++
        }
      } catch {
        // WhatsApp is best-effort
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
