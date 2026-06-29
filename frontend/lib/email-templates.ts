const baseStyles = {
  wrapper: `
    <div style="background:#f6f8fa;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
        <tr>
          <td style="padding:32px 32px 0;text-align:center;background:linear-gradient(135deg,#6366f1,#8b5cf6)">
            <img src="https://codespectra.com/logo-white.png" alt="CodeSpectra" width="160" style="margin-bottom:8px" />
            <p style="color:rgba(255,255,255,.85);font-size:14px;margin:0 0 24px">Code quality platform</p>
          </td>
        </tr>
        <tr><td style="padding:32px 32px 24px;color:#1f2937;font-size:15px;line-height:1.6">`,
  footer: `
        </td></tr>
        <tr>
          <td style="padding:0 32px 24px;font-size:13px;color:#6b7280">
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px" />
            <p style="margin:0 0 4px">CodeSpectra Inc., 548 Market St, San Francisco, CA 94104</p>
            <p style="margin:0"><a href="https://codespectra.com" style="color:#6366f1;text-decoration:none">codespectra.com</a> · <a href="%unsubscribe_url%" style="color:#6b7280;text-decoration:underline">Unsubscribe</a></p>
          </td>
        </tr>
      </table>
    </div>`,
  button: (url: string, text: string) =>
    `<table cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:#6366f1;border-radius:6px;padding:12px 28px;text-align:center">
      <a href="${url}" style="color:#fff;font-size:14px;font-weight:600;text-decoration:none;display:inline-block">${text}</a>
    </td></tr></table>`,
}

export const emailTemplates = {
  welcomeEmail: (name: string) => ({
    subject: `Welcome to CodeSpectra, ${name}! Start securing your code`,
    html: `${baseStyles.wrapper}
      <h1 style="font-size:22px;margin:0 0 8px;font-weight:700">Welcome aboard, ${name}! 🎉</h1>
      <p style="margin:0 0 16px;color:#4b5563">Your CodeSpectra account is ready. We're excited to help you ship better code with confidence.</p>
      <p style="margin:0 0 6px;font-weight:600">Quick-start checklist:</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 16px">
        <tr><td style="padding:4px 0">✅ &nbsp;Connect your GitHub repository</td></tr>
        <tr><td style="padding:4px 0">✅ &nbsp;Run your first automated code scan</td></tr>
        <tr><td style="padding:4px 0">✅ &nbsp;Set up team notifications in Slack</td></tr>
        <tr><td style="padding:4px 0">✅ &nbsp;Explore the Arena — practice challenges & interviews</td></tr>
      </table>
      ${baseStyles.button('https://codespectra.com/dashboard', 'Go to Dashboard')}
      <p style="margin:16px 0 0;color:#6b7280;font-size:13px">Questions? Reach our team at <a href="mailto:support@codespectra.com" style="color:#6366f1">support@codespectra.com</a></p>
    ${baseStyles.footer}`,
  }),

  jobApplicationConfirmation: (jobTitle: string, companyName: string, applicantName: string) => ({
    subject: `Application received — ${jobTitle} at ${companyName}`,
    html: `${baseStyles.wrapper}
      <h1 style="font-size:22px;margin:0 0 8px;font-weight:700">Application submitted ✓</h1>
      <p style="margin:0 0 16px;color:#4b5563">Hi ${applicantName},</p>
      <p style="margin:0 0 16px;color:#4b5563">We've received your application for the <strong style="color:#1f2937">${jobTitle}</strong> position at <strong style="color:#1f2937">${companyName}</strong>. The hiring team will review your profile and skills assessment results.</p>
      <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin:0 0 16px">
        <p style="margin:0 0 4px;font-weight:600;font-size:14px">What happens next?</p>
        <p style="margin:0;color:#4b5563;font-size:13px">1. Skills verification — your CodeSpectra scores are shared with the employer<br>2. Resume review by the hiring team (typically 3–5 business days)<br>3. Interview invitation if there's a match</p>
      </div>
      <p style="margin:0 0 16px;color:#4b5563">Track your application status anytime in your dashboard.</p>
      ${baseStyles.button('https://codespectra.com/dashboard/applications', 'Track Application')}
    ${baseStyles.footer}`,
  }),

  examStartedNotification: (examTitle: string, candidateName: string) => ({
    subject: `Exam started: ${examTitle}`,
    html: `${baseStyles.wrapper}
      <h1 style="font-size:22px;margin:0 0 8px;font-weight:700">Exam in progress ⌨️</h1>
      <p style="margin:0 0 16px;color:#4b5563">Hi ${candidateName},</p>
      <p style="margin:0 0 16px;color:#4b5563">You've begun <strong style="color:#1f2937">${examTitle}</strong>. Here's a quick reminder of what to expect:</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px;color:#4b5563">
        <tr><td style="padding:3px 0">⏱ &nbsp;Keep an eye on the timer — auto-submit is enforced</td></tr>
        <tr><td style="padding:3px 0">📝 &nbsp;Read each question carefully before answering</td></tr>
        <tr><td style="padding:3px 0">💻 &nbsp;Use the built-in IDE for coding questions</td></tr>
        <tr><td style="padding:3px 0">🔒 &nbsp;Don't navigate away — it may flag your attempt</td></tr>
      </table>
      <p style="margin:0;color:#4b5563">Good luck! You've got this. 💪</p>
    ${baseStyles.footer}`,
  }),

  subscriptionConfirmation: (planName: string, amount: number, currency = 'USD') => ({
    subject: `Welcome to ${planName} — your subscription is active`,
    html: `${baseStyles.wrapper}
      <h1 style="font-size:22px;margin:0 0 8px;font-weight:700">Subscription confirmed 🎉</h1>
      <p style="margin:0 0 16px;color:#4b5563">Thank you for upgrading to <strong style="color:#1f2937">${planName}</strong>. Your premium features are now active.</p>
      <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin:0 0 16px">
        <table cellpadding="0" cellspacing="0" style="font-size:14px;color:#4b5563;width:100%">
          <tr><td style="padding:2px 0">Plan</td><td style="text-align:right;font-weight:600;color:#1f2937">${planName}</td></tr>
          <tr><td style="padding:2px 0">Amount</td><td style="text-align:right;font-weight:600;color:#1f2937">${currency === 'USD' ? '$' : ''}${(amount / 100).toFixed(2)} ${currency !== 'USD' ? currency : ''}</td></tr>
          <tr><td style="padding:2px 0">Next billing</td><td style="text-align:right;font-weight:600;color:#1f2937">${new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td></tr>
        </table>
      </div>
      <p style="margin:0 0 16px;color:#4b5563">Explore everything your plan includes:</p>
      ${baseStyles.button('https://codespectra.com/dashboard/billing', 'Manage Subscription')}
    ${baseStyles.footer}`,
  }),

  invoiceNotification: (invoiceId: string, amount: number, planName: string, currency = 'USD') => ({
    subject: `Invoice #${invoiceId} ready — ${planName}`,
    html: `${baseStyles.wrapper}
      <h1 style="font-size:22px;margin:0 0 8px;font-weight:700">Invoice available 📄</h1>
      <p style="margin:0 0 16px;color:#4b5563">Your latest invoice for <strong style="color:#1f2937">${planName}</strong> is ready.</p>
      <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin:0 0 16px">
        <table cellpadding="0" cellspacing="0" style="font-size:14px;color:#4b5563;width:100%">
          <tr><td style="padding:2px 0">Invoice</td><td style="text-align:right;font-weight:600;color:#1f2937">#${invoiceId}</td></tr>
          <tr><td style="padding:2px 0">Amount</td><td style="text-align:right;font-weight:600;color:#1f2937">${currency === 'USD' ? '$' : ''}${(amount / 100).toFixed(2)} ${currency !== 'USD' ? currency : ''}</td></tr>
          <tr><td style="padding:2px 0">Plan</td><td style="text-align:right;font-weight:600;color:#1f2937">${planName}</td></tr>
          <tr><td style="padding:2px 0">Status</td><td style="text-align:right;font-weight:600;color:#059669">Paid</td></tr>
        </table>
      </div>
      ${baseStyles.button('https://codespectra.com/dashboard/billing', 'Download Invoice')}
      <p style="margin:12px 0 0;color:#6b7280;font-size:13px">Need help? <a href="mailto:billing@codespectra.com" style="color:#6366f1">billing@codespectra.com</a></p>
    ${baseStyles.footer}`,
  }),
}

export async function sendEmail(to: string, template: { subject: string; html: string }) {
  console.log(`[Email] Sending to ${to}: ${template.subject}`)
  return { success: true, messageId: `msg_${Date.now()}` }
}
