export async function sendEmail(to: string, template: { subject: string; html: string }) {
  try {
    const { sendEmailViaPostal } = await import('@/lib/transactional-mail')
    const result = await sendEmailViaPostal({ to, subject: template.subject, html: template.html })
    console.log(`[Email] Sent via Postal to ${to}: ${template.subject} (msgId: ${result.messageId})`)
    return { success: true, provider: 'postal' as const, postalMessageId: result.messageId }
  } catch (e) {
    console.log(`[Email] Postal unavailable (${(e as Error).message}) — logged only. To: ${to}, Subject: ${template.subject}`)
    return { success: true, provider: 'log' as const, postalMessageId: null }
  }
}
