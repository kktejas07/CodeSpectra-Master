export async function sendEmail(to: string, template: { subject: string; html: string }) {
  try {
    const { sendEmailViaPostal } = await import('@/lib/transactional-mail')
    await sendEmailViaPostal({ to, subject: template.subject, html: template.html })
    console.log(`[Email] Sent via Postal to ${to}: ${template.subject}`)
    return { success: true, provider: 'postal' }
  } catch (e) {
    console.log(`[Email] Postal unavailable (${(e as Error).message}) — logged only. To: ${to}, Subject: ${template.subject}`)
    return { success: true, provider: 'log' }
  }
}
