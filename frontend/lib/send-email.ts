export async function sendEmail(to: string, template: { subject: string; html: string }, cc?: string) {
  try {
    const { sendEmailViaPostal } = await import('@/lib/transactional-mail')
    const result = await sendEmailViaPostal({ to, subject: template.subject, html: template.html, cc })
    console.log(`[Email] Sent via Postal to ${to}${cc ? ` (cc: ${cc})` : ''}: ${template.subject} (msgId: ${result.messageId})`)
    return { success: true, provider: 'postal' as const, postalMessageId: result.messageId }
  } catch (e) {
    console.log(`[Email] Postal unavailable (${(e as Error).message}) — logged only. To: ${to}${cc ? ` (cc: ${cc})` : ''}, Subject: ${template.subject}`)
    return { success: true, provider: 'log' as const, postalMessageId: null }
  }
}
