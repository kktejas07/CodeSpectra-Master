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

const getBaseUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.com'

function applyBaseUrl(html: string, baseUrl?: string): string {
  if (!baseUrl || baseUrl === 'https://codespectra.com') return html
  return html
    .replace(/https:\/\/codespectra\.com/g, baseUrl)
    .replace(/%base_url%/g, baseUrl)
}

export const emailTemplates = {
  welcomeEmail: (name: string) => {
    const base = getBaseUrl()
    return {
      subject: `Welcome to CodeSpectra, ${name}!`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:22px;margin:0 0 8px;font-weight:700">Welcome aboard, ${name}!</h1>
        <p style="margin:0 0 16px;color:#4b5563">Your CodeSpectra account is ready. Here's how to get started:</p>
        <ul style="margin:0 0 16px;padding-left:20px;color:#4b5563">
          <li style="margin:4px 0">Connect your GitHub repository</li>
          <li style="margin:4px 0">Run your first automated code scan</li>
          <li style="margin:4px 0">Set up team notifications</li>
          <li style="margin:4px 0">Explore the Arena — practice challenges & interviews</li>
        </ul>
        ${baseStyles.button(`${base}/dashboard`, 'Go to Dashboard')}
      ${baseStyles.footer}`,
    }
  },

  loginNotification: (name: string, deviceInfo: string, location: string, time: string) => {
    const base = getBaseUrl()
    return {
      subject: `New sign-in to your CodeSpectra account`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:22px;margin:0 0 8px;font-weight:700">New sign-in detected</h1>
        <p style="margin:0 0 16px;color:#4b5563">Hi ${name},</p>
        <p style="margin:0 0 16px;color:#4b5563">A new sign-in to your CodeSpectra account was just detected.</p>
        <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin:0 0 16px">
          <table cellpadding="0" cellspacing="0" style="font-size:14px;color:#4b5563;width:100%">
            <tr><td style="padding:2px 0">Device</td><td style="text-align:right;font-weight:600">${deviceInfo}</td></tr>
            <tr><td style="padding:2px 0">Location</td><td style="text-align:right;font-weight:600">${location}</td></tr>
            <tr><td style="padding:2px 0">Time</td><td style="text-align:right;font-weight:600">${time}</td></tr>
          </table>
        </div>
        <p style="margin:0 0 16px;color:#4b5563;font-size:13px">If this was you, you can safely ignore this email. If this wasn't you, please secure your account immediately.</p>
        ${baseStyles.button(`${base}/dashboard/settings/security`, 'Secure Account')}
      ${baseStyles.footer}`,
    }
  },

  jobApplicationConfirmation: (jobTitle: string, companyName: string, applicantName: string) => {
    const base = getBaseUrl()
    return {
      subject: `Application received — ${jobTitle} at ${companyName}`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:22px;margin:0 0 8px;font-weight:700">Application submitted</h1>
        <p style="margin:0 0 16px;color:#4b5563">Hi ${applicantName},</p>
        <p style="margin:0 0 16px;color:#4b5563">We've received your application for the <strong>${jobTitle}</strong> position at <strong>${companyName}</strong>.</p>
        <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin:0 0 16px">
          <p style="margin:0 0 4px;font-weight:600;font-size:14px">What happens next?</p>
          <p style="margin:0;color:#4b5563;font-size:13px">1. Skills verification<br>2. Resume review (3–5 business days)<br>3. Interview invitation if there's a match</p>
        </div>
        ${baseStyles.button(`${base}/dashboard/applications`, 'Track Application')}
      ${baseStyles.footer}`,
    }
  },

  examStartedNotification: (examTitle: string, candidateName: string) => ({
    subject: `Exam started: ${examTitle}`,
    html: `${baseStyles.wrapper}
      <h1 style="font-size:22px;margin:0 0 8px;font-weight:700">Exam in progress</h1>
      <p style="margin:0 0 16px;color:#4b5563">Hi ${candidateName},</p>
      <p style="margin:0 0 16px;color:#4b5563">You've begun <strong>${examTitle}</strong>. Keep these in mind:</p>
      <ul style="margin:0 0 16px;padding-left:20px;color:#4b5563">
        <li style="margin:4px 0">Watch the timer — auto-submit is enforced</li>
        <li style="margin:4px 0">Read each question carefully before answering</li>
        <li style="margin:4px 0">Use the built-in IDE for coding questions</li>
        <li style="margin:4px 0">Don't navigate away — it may flag your attempt</li>
      </ul>
      <p style="margin:0;color:#4b5563">Good luck!</p>
    ${baseStyles.footer}`,
  }),

  subscriptionConfirmation: (planName: string, amount: number, currency = 'INR') => {
    const base = getBaseUrl()
    return {
      subject: `Welcome to ${planName} — your subscription is active`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:22px;margin:0 0 8px;font-weight:700">Subscription confirmed</h1>
        <p style="margin:0 0 16px;color:#4b5563">Thank you for upgrading to <strong>${planName}</strong>.</p>
        <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin:0 0 16px">
          <table cellpadding="0" cellspacing="0" style="font-size:14px;color:#4b5563;width:100%">
            <tr><td style="padding:2px 0">Plan</td><td style="text-align:right;font-weight:600">${planName}</td></tr>
            <tr><td style="padding:2px 0">Amount</td><td style="text-align:right;font-weight:600">${currency === 'USD' ? '$' : '₹'}${currency === 'USD' ? (amount / 100).toFixed(2) : (amount / 100).toFixed(2)} ${currency}</td></tr>
            <tr><td style="padding:2px 0">Next billing</td><td style="text-align:right;font-weight:600">${new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td></tr>
          </table>
        </div>
        ${baseStyles.button(`${base}/dashboard/billing`, 'Manage Subscription')}
      ${baseStyles.footer}`,
    }
  },

  invoiceNotification: (invoiceId: string, amount: number, planName: string, currency = 'INR') => {
    const base = getBaseUrl()
    return {
      subject: `Invoice #${invoiceId} ready — ${planName}`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:22px;margin:0 0 8px;font-weight:700">Invoice available</h1>
        <p style="margin:0 0 16px;color:#4b5563">Your latest invoice for <strong>${planName}</strong> is ready.</p>
        <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin:0 0 16px">
          <table cellpadding="0" cellspacing="0" style="font-size:14px;color:#4b5563;width:100%">
            <tr><td style="padding:2px 0">Invoice</td><td style="text-align:right;font-weight:600">#${invoiceId}</td></tr>
            <tr><td style="padding:2px 0">Amount</td><td style="text-align:right;font-weight:600">${currency === 'USD' ? '$' : '₹'}${currency === 'USD' ? (amount / 100).toFixed(2) : (amount / 100).toFixed(2)} ${currency}</td></tr>
            <tr><td style="padding:2px 0">Plan</td><td style="text-align:right;font-weight:600">${planName}</td></tr>
            <tr><td style="padding:2px 0">Status</td><td style="text-align:right;font-weight:600;color:#059669">Paid</td></tr>
          </table>
        </div>
        ${baseStyles.button(`${base}/dashboard/billing`, 'Download Invoice')}
      ${baseStyles.footer}`,
    }
  },

  phonePePaymentSuccess: (planName: string, amount: number, transactionId: string) => {
    const base = getBaseUrl()
    return {
      subject: `Payment successful — ${planName}`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:22px;margin:0 0 8px;font-weight:700">Payment successful!</h1>
        <p style="margin:0 0 16px;color:#4b5563">Your payment of <strong>₹${(amount / 100).toFixed(2)}</strong> for <strong>${planName}</strong> has been processed successfully.</p>
        <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin:0 0 16px">
          <table cellpadding="0" cellspacing="0" style="font-size:14px;color:#4b5563;width:100%">
            <tr><td style="padding:2px 0">Transaction ID</td><td style="text-align:right;font-weight:600;font-family:monospace">${transactionId}</td></tr>
            <tr><td style="padding:2px 0">Method</td><td style="text-align:right;font-weight:600">PhonePe UPI</td></tr>
            <tr><td style="padding:2px 0">Amount</td><td style="text-align:right;font-weight:600">₹${(amount / 100).toFixed(2)}</td></tr>
            <tr><td style="padding:2px 0">Status</td><td style="text-align:right;font-weight:600;color:#059669">Success</td></tr>
          </table>
        </div>
        ${baseStyles.button(`${base}/dashboard/billing`, 'View Subscription')}
      ${baseStyles.footer}`,
    }
  },

  phonePePaymentFailed: (planName: string, amount: number, reason?: string) => {
    const base = getBaseUrl()
    return {
      subject: `Payment failed — ${planName}`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:22px;margin:0 0 8px;font-weight:700">Payment failed</h1>
        <p style="margin:0 0 16px;color:#4b5563">Your payment of <strong>₹${(amount / 100).toFixed(2)}</strong> for <strong>${planName}</strong> could not be processed.</p>
        ${reason ? `<div style="background:#fef2f2;border-radius:6px;padding:16px;margin:0 0 16px;border:1px solid #fecaca">
          <p style="margin:0;color:#dc2626;font-size:14px"><strong>Reason:</strong> ${reason}</p>
        </div>` : ''}
        <p style="margin:0 0 16px;color:#4b5563">Please try again or use a different payment method.</p>
        ${baseStyles.button(`${base}/dashboard/billing`, 'Try Again')}
      ${baseStyles.footer}`,
    }
  },

  passwordReset: (resetUrl: string) => ({
    subject: 'Reset your CodeSpectra password',
    html: `${baseStyles.wrapper}
      <h1 style="font-size:22px;margin:0 0 8px;font-weight:700">Password reset</h1>
      <p style="margin:0 0 16px;color:#4b5563">Click the button below to reset your password. This link expires in 1 hour.</p>
      ${baseStyles.button(resetUrl, 'Reset Password')}
      <p style="margin:16px 0 0;color:#6b7280;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
    ${baseStyles.footer}`,
  }),

  emailVerification: (verifyUrl: string) => ({
    subject: 'Verify your CodeSpectra email',
    html: `${baseStyles.wrapper}
      <h1 style="font-size:22px;margin:0 0 8px;font-weight:700">Verify your email</h1>
      <p style="margin:0 0 16px;color:#4b5563">Click the button below to confirm your email address and activate your account.</p>
      ${baseStyles.button(verifyUrl, 'Verify Email')}
      <p style="margin:16px 0 0;color:#6b7280;font-size:13px">If you didn't create an account, ignore this email.</p>
    ${baseStyles.footer}`,
  }),

  teamInvite: (teamName: string, invitedByName: string, acceptUrl: string) => ({
    subject: `You're invited to join ${teamName} on CodeSpectra`,
    html: `${baseStyles.wrapper}
      <h1 style="font-size:22px;margin:0 0 8px;font-weight:700">Team invitation</h1>
      <p style="margin:0 0 16px;color:#4b5563"><strong>${invitedByName}</strong> invited you to join <strong>${teamName}</strong> on CodeSpectra.</p>
      ${baseStyles.button(acceptUrl, 'Accept Invitation')}
    ${baseStyles.footer}`,
  }),

  twoFactorBackup: (backupCodes: string) => ({
    subject: '2FA backup codes — CodeSpectra',
    html: `${baseStyles.wrapper}
      <h1 style="font-size:22px;margin:0 0 8px;font-weight:700">Two-factor authentication enabled</h1>
      <p style="margin:0 0 16px;color:#4b5563">Your backup codes are listed below. Store them somewhere safe — each code can only be used once.</p>
      <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin:0 0 16px;font-family:monospace;font-size:14px;letter-spacing:1px">
        ${backupCodes}
      </div>
      <p style="margin:0;color:#6b7280;font-size:13px">If you lose access to your authenticator app, use a backup code to sign in.</p>
    ${baseStyles.footer}`,
  }),
}

export async function sendEmail(to: string, template: { subject: string; html: string }) {
  console.log(`[Email] Sending to ${to}: ${template.subject}`)
  return { success: true, messageId: `msg_${Date.now()}` }
}

export const hackathonEmailTemplates = {
  resultsReleased: (params: {
    eventName: string
    teamName: string
    rank: number
    totalTeams: number
    score: number
    resultsUrl: string
  }) => ({
    subject: `Results are out! ${params.eventName} — Your team ranked #${params.rank}`,
    html: `${baseStyles.wrapper}
      <h1 style="font-size:22px;margin:0 0 8px;font-weight:700">Results Released!</h1>
      <p style="margin:0 0 16px;color:#4b5563">The results for <strong style="color:#1f2937">${params.eventName}</strong> are now available.</p>
      <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin:0 0 16px">
        <table cellpadding="0" cellspacing="0" style="font-size:14px;color:#4b5563;width:100%">
          <tr><td style="padding:2px 0">Team</td><td style="text-align:right;font-weight:600;color:#1f2937">${params.teamName}</td></tr>
          <tr><td style="padding:2px 0">Rank</td><td style="text-align:right;font-weight:600;color:#1f2937">#${params.rank} of ${params.totalTeams}</td></tr>
          <tr><td style="padding:2px 0">Score</td><td style="text-align:right;font-weight:600;color:#1f2937">${params.score} XP</td></tr>
        </table>
      </div>
      ${baseStyles.button(params.resultsUrl, 'View Full Results')}
      <p style="margin:16px 0 0;color:#6b7280;font-size:13px">Download your certificate and share your achievement on LinkedIn from the results page.</p>
    ${baseStyles.footer}`,
  }),
}
