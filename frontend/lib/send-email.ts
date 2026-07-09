export async function sendEmail(to: string, template: { subject: string; html: string }) {
  const methods = [
    { name: 'Resend', send: async () => { const { sendEmailViaResend } = await import('@/lib/transactional-mail'); await sendEmailViaResend({ to, subject: template.subject, html: template.html }) } },
    { name: 'SendGrid', send: async () => { const { sendEmailViaSendGrid } = await import('@/lib/transactional-mail'); await sendEmailViaSendGrid({ to, subject: template.subject, html: template.html }) } },
    { name: 'Postal', send: async () => { const { sendEmailViaPostal } = await import('@/lib/transactional-mail'); await sendEmailViaPostal({ to, subject: template.subject, html: template.html }) } },
    { name: 'SMTP', send: async () => { const { sendEmailViaSMTP } = await import('@/lib/transactional-mail'); await sendEmailViaSMTP({ to, subject: template.subject, html: template.html }) } },
  ]
  for (const method of methods) {
    try {
      await method.send()
      console.log(`[Email] Sent via ${method.name} to ${to}: ${template.subject}`)
      return { success: true, provider: method.name.toLowerCase() }
    } catch (e) {
      console.log(`[Email] ${method.name} unavailable (${(e as Error).message}), trying next...`)
    }
  }
  console.log(`[Email] No provider configured — logged only. To: ${to}, Subject: ${template.subject}`)
  return { success: true, provider: 'log' }
}
