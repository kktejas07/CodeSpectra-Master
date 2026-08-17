/**
 * Newsletter campaign execution — separated from the route handlers so both
 * `campaigns/route.ts` (create → send now) and `campaigns/[id]/route.ts`
 * (resume a draft → re-send) can invoke it. Next.js forbids extra exports in
 * route modules, so this lives here instead.
 */
import { createHmac } from 'node:crypto'
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
      const hmacSecret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'codespectra-default-secret'
      const EMAIL_BATCH_SIZE = 10
      const EMAIL_CONCURRENCY = 5
      // Pre-render HTML for each subscriber (personalized unsubscribe links)
      const emailTasks: { email: string; html: string }[] = []
      for (const sub of subs) {
        const email = String(sub.email)
        const hmacToken = createHmac('sha256', hmacSecret).update(email.toLowerCase()).digest('hex').slice(0, 16)
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
        const users = await db.collection('user').find({}).project({ id: 1, _id: 0 }).toArray()
        const notifications = db.collection('notifications')
        const notifDocs = users.map(u => ({
          id: newId(),
          user_id: String(u.id || u._id),
          title: campaign.subject,
          message: campaign.intro || campaign.body?.replace(/<[^>]*>/g, '').slice(0, 200) || 'New newsletter',
          type: 'newsletter',
          is_read: false,
          link: `/newsletter/${campaign.id}`,
          icon: 'mail',
          category: 'system',
          created_at: nowIso(),
        }))
        if (notifDocs.length > 0) {
          await notifications.insertMany(notifDocs)
          inAppOk = notifDocs.length
        }
      } catch {
        // In-app is best-effort
      }
    }

    // WhatsApp channel - send to all users with phone numbers
    if (campaign.channels.whatsapp) {
      try {
        const { isWhatsAppConfigured, sendWhatsAppBatch } = await import('@/lib/whatsapp')
        if (await isWhatsAppConfigured()) {
          const users = await db.collection('user').find({
            $or: [
              { phone: { $exists: true, $ne: '' } },
              { phone_number: { $exists: true, $ne: '' } },
              { whatsapp: { $exists: true, $ne: '' } },
            ]
          }).project({ id: 1, phone: 1, phone_number: 1, whatsapp: 1, _id: 0 }).toArray()

          const messages = users
            .map(u => {
              const phone = String(u.phone || u.phone_number || u.whatsapp || '')
              return phone ? { phone, text: `*${campaign.subject}*\n\n${campaign.intro || campaign.body?.replace(/<[^>]*>/g, '').slice(0, 300) || 'New update from CodeSpectra'}` } : null
            })
            .filter((m): m is { phone: string; text: string } => m !== null)

          if (messages.length > 0) {
            const results = await sendWhatsAppBatch(messages)
            for (const r of results) {
              if (r.success) whatsappOk++
              else whatsappFail++
            }
          }
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
