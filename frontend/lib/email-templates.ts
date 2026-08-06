// ponytail: Brand update from purple-indigo to green (#22c55e) to match icon.svg

const BRAND = {
  green: '#16a34a',
  greenLight: '#22c55e',
  greenBg: '#f0fdf4',
  greenBorder: '#bbf7d0',
  red: '#dc2626',
  redBg: '#fef2f2',
  amber: '#d97706',
  amberBg: '#fffbeb',
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  surface: '#f9fafb',
  white: '#ffffff',
}

const FONTS = {
  mono: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
}

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}
function getIconUrl() {
  return `${getBaseUrl()}/icon.svg`
}

const baseStyles = {
  wrapper: `
<div style="background:#f3f4f6;padding:40px 16px;font-family:${FONTS.sans}">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border};box-shadow:0 1px 3px rgba(0,0,0,0.06)">
    <!-- Header -->
    <tr>
      <td style="background:${BRAND.green};padding:28px 32px 24px">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="vertical-align:middle">
              <img src="${getIconUrl()}" alt="CodeSpectra" width="36" height="36" style="display:inline-block;vertical-align:middle;border-radius:6px" />
            </td>
            <td style="vertical-align:middle;padding-left:12px">
              <span style="font-family:${FONTS.mono};font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.5px">CodeSpectra</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- Body -->
    <tr><td style="padding:32px 32px 28px;color:${BRAND.text};font-size:15px;line-height:1.7">`,
  footer: `
      </td></tr>
      <!-- Footer -->
      <tr>
        <td style="padding:0 32px 28px;font-size:12px;color:${BRAND.muted};border-top:1px solid ${BRAND.border};padding-top:20px">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="color:${BRAND.muted}">CodeSpectra &copy; ${new Date().getFullYear()}</td>
              <td style="text-align:right">
                <a href="${getBaseUrl()}" style="color:${BRAND.green};text-decoration:none;font-weight:500">${getBaseUrl().replace('https://','').replace('http://','')}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
  </table>
</div>`,
  button: (url: string, text: string, variant: 'primary' | 'outline' = 'primary') =>
    `<table cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:${variant === 'primary' ? BRAND.green : 'transparent'};border:${variant === 'outline' ? `1.5px solid ${BRAND.green}` : 'none'};border-radius:7px;padding:11px 26px;text-align:center">
      <a href="${url}" style="color:${variant === 'primary' ? '#ffffff' : BRAND.green};font-size:14px;font-weight:600;text-decoration:none;display:inline-block;font-family:${FONTS.sans}">${text}</a>
    </td></tr></table>`,
  card: (content: string) =>
    `<div style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:8px;padding:16px;margin:16px 0">${content}</div>`,
  divider: () => `<div style="border-top:1px solid ${BRAND.border};margin:20px 0"></div>`,
  badge: (text: string, color: string, bg: string) =>
    `<span style="display:inline-block;background:${bg};color:${color};font-size:11px;font-weight:600;padding:2px 8px;border-radius:100px;text-transform:uppercase;letter-spacing:0.5px">${text}</span>`,
  mono: (text: string) =>
    `<code style="font-family:${FONTS.mono};font-size:13px;background:${BRAND.surface};padding:2px 6px;border-radius:4px;border:1px solid ${BRAND.border};color:${BRAND.text}">${text}</code>`,
  codeBlock: (text: string) =>
    `<pre style="font-family:${FONTS.mono};font-size:12px;background:#1a1a1a;color:#e5e7eb;padding:16px;border-radius:8px;overflow-x:auto;line-height:1.5;margin:16px 0">${text}</pre>`,
}

const statRow = (label: string, value: string, mono = false) =>
  `<tr><td style="padding:4px 0;color:${BRAND.muted};font-size:14px">${label}</td><td style="text-align:right;font-weight:600;font-size:14px;color:${BRAND.text};font-family:${mono ? FONTS.mono : 'inherit'}">${value}</td></tr>`

const alertBox = (content: string, bg: string, border: string) =>
  `<div style="background:${bg};border-left:3px solid ${border.split(' ')[0]};padding:12px 16px;border-radius:0 6px 6px 0;margin:16px 0">${content}</div>`

export const emailTemplates = {
  welcomeEmail: (name: string) => {
    const base = getBaseUrl()
    return {
      subject: `Welcome to CodeSpectra, ${name}!`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Welcome to CodeSpectra, ${name}!</h1>
        <p style="margin:12px 0 20px;color:${BRAND.muted};font-size:14px">Your account is ready. Here are some things you can do to get started:</p>
        <div style="display:grid;gap:10px;margin:0 0 20px">
          ${[
            ['Connect your GitHub repository', 'Link your code for automated scanning and review'],
            ['Explore the Arena', 'Practice coding challenges and interview problems'],
            ['Join a hackathon', 'Compete solo or with your team in timed events'],
            ['Set up your profile', 'Add your skills and experience to get noticed'],
          ].map(([title, desc]) => `
            <div style="display:flex;align-items:flex-start;gap:10px;padding:12px;background:${BRAND.surface};border-radius:8px;border:1px solid ${BRAND.border}">
              <div style="width:6px;height:6px;background:${BRAND.green};border-radius:50%;margin-top:6px;flex-shrink:0"></div>
              <div><strong style="font-size:14px;color:${BRAND.text}">${title}</strong><br/><span style="font-size:13px;color:${BRAND.muted}">${desc}</span></div>
            </div>`).join('')}
        </div>
        ${baseStyles.button(`${base}/dashboard`, 'Go to Dashboard')}
      ${baseStyles.footer}`,
    }
  },

  loginNotification: (name: string, deviceInfo: string, location: string, time: string) => {
    const base = getBaseUrl()
    return {
      subject: `New sign-in detected — CodeSpectra`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">New sign-in detected</h1>
        <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Hi <strong>${name}</strong>, we noticed a new sign-in to your account.</p>
        ${baseStyles.card(`
          <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
            ${statRow('Device', deviceInfo)}
            ${statRow('Location', location)}
            ${statRow('Time', time, true)}
          </table>
        `)}
        ${alertBox(`<p style="margin:0;font-size:13px;color:${BRAND.text}">If this wasn't you, <a href="${base}/dashboard/settings/security" style="color:${BRAND.green};font-weight:600">secure your account</a> immediately.</p>`, BRAND.amberBg, `${BRAND.amber}`)}
        ${baseStyles.button(`${base}/dashboard/settings/security`, 'Review Account Security', 'outline')}
      ${baseStyles.footer}`,
    }
  },

  jobApplicationConfirmation: (jobTitle: string, companyName: string, applicantName: string) => {
    const base = getBaseUrl()
    return {
      subject: `Application received — ${jobTitle}`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Application submitted!</h1>
        <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Hi <strong>${applicantName}</strong>, your application has been received.</p>
        ${baseStyles.card(`
          <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
            ${statRow('Position', jobTitle)}
            ${statRow('Company', companyName)}
            ${statRow('Status', 'Under Review')}
          </table>
        `)}
        <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${BRAND.text}">What happens next?</p>
        <div style="display:flex;gap:8px;margin:0 0 20px;flex-wrap:wrap">
          ${['Skills verification', 'Resume review (3–5 days)', 'Interview invite'].map((step, i) => `
            <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:${BRAND.muted}">
              <span style="background:${BRAND.green};color:#fff;width:18px;height:18px;border-radius:50%;text-align:center;line-height:18px;font-size:10px;font-weight:700;flex-shrink:0">${i + 1}</span>
              ${step}
            </div>`).join('')}
        </div>
        ${baseStyles.button(`${base}/dashboard/applications`, 'Track Application')}
      ${baseStyles.footer}`,
    }
  },

  examStartedNotification: (examTitle: string, candidateName: string) => {
    const base = getBaseUrl()
    return {
      subject: `Exam started: ${examTitle}`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Exam in progress</h1>
        <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Hi <strong>${candidateName}</strong>, you've begun <strong>${examTitle}</strong>. Keep these in mind:</p>
        ${baseStyles.card(`
          <ul style="margin:0;padding-left:18px;color:${BRAND.text};font-size:14px;line-height:1.9">
            <li>Watch the timer — auto-submit is enforced when time expires</li>
            <li>Read each question carefully before answering</li>
            <li>Use the built-in IDE for coding questions</li>
            <li>Don't navigate away — tab switches are logged</li>
          </ul>
        `)}
        <p style="margin:0 0 20px;font-size:14px;color:${BRAND.green};font-weight:500">Good luck! 🍀</p>
        ${baseStyles.button(`${base}/dashboard/exams`, 'Return to Exam', 'outline')}
      ${baseStyles.footer}`,
    }
  },

  subscriptionConfirmation: (planName: string, amount: number, currency = 'INR') => {
    const base = getBaseUrl()
    const symbol = currency === 'USD' ? '$' : '₹'
    const nextBilling = new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    return {
      subject: `Welcome to ${planName} — subscription active`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Subscription confirmed!</h1>
        <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Thank you for upgrading to <strong>${planName}</strong>. Your subscription is now active.</p>
        ${baseStyles.card(`
          <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
            ${statRow('Plan', planName)}
            ${statRow('Amount', `${symbol}${(amount / 100).toFixed(2)} ${currency}`)}
            ${statRow('Next billing', nextBilling)}
            ${statRow('Status', 'Active')}
          </table>
        `)}
        <p style="margin:0 0 4px;font-size:13px;color:${BRAND.muted}">You can manage or cancel your subscription anytime from your billing settings.</p>
        ${baseStyles.button(`${base}/dashboard/billing`, 'Manage Subscription')}
      ${baseStyles.footer}`,
    }
  },

  invoiceNotification: (invoiceId: string, amount: number, planName: string, currency = 'INR') => {
    const base = getBaseUrl()
    const symbol = currency === 'USD' ? '$' : '₹'
    return {
      subject: `Invoice #${invoiceId} — ${planName}`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Invoice available</h1>
        <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Your latest invoice for <strong>${planName}</strong> is ready.</p>
        ${baseStyles.card(`
          <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
            ${statRow('Invoice', `#${invoiceId}`, true)}
            ${statRow('Amount', `${symbol}${(amount / 100).toFixed(2)} ${currency}`)}
            ${statRow('Plan', planName)}
            ${statRow('Status', 'Paid')}
          </table>
        `)}
        ${baseStyles.button(`${base}/dashboard/billing`, 'Download Invoice')}
      ${baseStyles.footer}`,
    }
  },

  phonePePaymentSuccess: (planName: string, amount: number, transactionId: string) => {
    const base = getBaseUrl()
    return {
      subject: `Payment successful — ${planName}`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Payment successful!</h1>
        <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Your payment of <strong>₹${(amount / 100).toFixed(2)}</strong> for <strong>${planName}</strong> has been processed.</p>
        ${baseStyles.card(`
          <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
            ${statRow('Transaction ID', transactionId, true)}
            ${statRow('Method', 'PhonePe UPI')}
            ${statRow('Amount', `₹${(amount / 100).toFixed(2)}`)}
            ${statRow('Status', 'Success')}
          </table>
        `)}
        ${baseStyles.button(`${base}/dashboard/billing`, 'View Subscription')}
      ${baseStyles.footer}`,
    }
  },

  phonePePaymentFailed: (planName: string, amount: number, reason?: string) => {
    const base = getBaseUrl()
    return {
      subject: `Payment failed — ${planName}`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.red}">Payment failed</h1>
        <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Your payment of <strong>₹${(amount / 100).toFixed(2)}</strong> for <strong>${planName}</strong> could not be processed.</p>
        ${reason ? alertBox(`<p style="margin:0;font-size:14px;color:${BRAND.red}"><strong>Reason:</strong> ${reason}</p>`, BRAND.redBg, `${BRAND.red}`) : ''}
        <p style="margin:16px 0;font-size:14px;color:${BRAND.muted}">Please try again or use a different payment method.</p>
        ${baseStyles.button(`${base}/dashboard/billing`, 'Try Again')}
      ${baseStyles.footer}`,
    }
  },

  passwordReset: (resetUrl: string) => ({
    subject: 'Reset your CodeSpectra password',
    html: `${baseStyles.wrapper}
      <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Reset your password</h1>
      <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
      ${baseStyles.button(resetUrl, 'Reset Password')}
      ${alertBox(`<p style="margin:0;font-size:13px;color:${BRAND.muted}">If you didn't request this, you can safely ignore this email. Your account won't be affected.</p>`, BRAND.greenBg, `${BRAND.green}`)}
    ${baseStyles.footer}`,
  }),

  emailVerification: (verifyUrl: string) => ({
    subject: 'Verify your CodeSpectra email',
    html: `${baseStyles.wrapper}
      <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Verify your email address</h1>
      <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Click the button below to confirm your email and activate your CodeSpectra account.</p>
      ${baseStyles.button(verifyUrl, 'Verify Email')}
      <p style="margin:8px 0 0;font-size:13px;color:${BRAND.muted}">If you didn't create a CodeSpectra account, ignore this email.</p>
    ${baseStyles.footer}`,
  }),

  teamInvite: (teamName: string, invitedByName: string, acceptUrl: string) => ({
    subject: `You're invited to join ${teamName} on CodeSpectra`,
    html: `${baseStyles.wrapper}
      <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Team invitation</h1>
      <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px"><strong>${invitedByName}</strong> invited you to join <strong>${teamName}</strong> on CodeSpectra.</p>
      ${baseStyles.button(acceptUrl, 'Accept Invitation')}
      <p style="margin:8px 0 0;font-size:13px;color:${BRAND.muted}">This invite link will expire in 7 days.</p>
    ${baseStyles.footer}`,
  }),

  orgInvite: (params: { orgName: string; invitedByName: string; acceptUrl: string }) => ({
    subject: `You're invited to join ${params.orgName} on CodeSpectra`,
    html: `${baseStyles.wrapper}
      <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Organization invitation</h1>
      <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px"><strong>${params.invitedByName}</strong> invited you to join <strong>${params.orgName}</strong> on CodeSpectra.</p>
      <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Once you accept, you'll be a member of <strong>${params.orgName}</strong> and get access to their team's assessments, exams and codeathons.</p>
      ${baseStyles.button(params.acceptUrl, 'Accept Invitation')}
      <p style="margin:8px 0 0;font-size:13px;color:${BRAND.muted}">This invite link will expire in 7 days.</p>
    ${baseStyles.footer}`,
  }),

  twoFactorBackup: (backupCodes: string) => ({
    subject: '2FA backup codes — CodeSpectra',
    html: `${baseStyles.wrapper}
      <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Two-factor authentication enabled</h1>
      <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Your backup codes are below. <strong>Store them somewhere safe</strong> — each code can only be used once.</p>
      ${baseStyles.codeBlock(backupCodes)}
      ${alertBox(`<p style="margin:0;font-size:13px;color:${BRAND.text}">If you lose access to your authenticator app, use a backup code to sign in. Then set up 2FA again for full security.</p>`, BRAND.amberBg, `${BRAND.amber}`)}
    ${baseStyles.footer}`,
  }),

  assessmentInvite: (params: {
    candidateName: string
    examTitle: string
    inviteUrl: string
    expiresIn: string
  }) => ({
    subject: `You're invited to complete "${params.examTitle}" — CodeSpectra Assessment`,
    html: `${baseStyles.wrapper}
      <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Assessment Invitation</h1>
      <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Hi <strong>${params.candidateName}</strong>,</p>
      <p style="margin:0 0 16px;color:${BRAND.muted};font-size:14px">You have been invited to complete a technical assessment on CodeSpectra.</p>
      ${baseStyles.card(`
        <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
          ${statRow('Assessment', params.examTitle)}
          ${statRow('Invite expires', params.expiresIn)}
          ${statRow('Status', 'Pending')}
        </table>
      `)}
      <p style="margin:16px 0 4px;font-size:14px;color:${BRAND.text};font-weight:500">What to expect:</p>
      <ul style="margin:4px 0 20px;padding-left:18px;color:${BRAND.muted};font-size:14px;line-height:1.8">
        <li>Timed assessment with auto-submit when time expires</li>
        <li>Mix of question types (MCQ, coding, descriptive, and more)</li>
        <li>Proctoring is active — tab switches are logged</li>
        <li>Results are reviewed by the technical team</li>
      </ul>
      ${baseStyles.button(params.inviteUrl, 'Start Your Assessment')}
      ${alertBox(`<p style="margin:0;font-size:13px;color:${BRAND.text}"><strong>One-time use:</strong> This invite link can only be used once. Do not share it with anyone. It expires on ${params.expiresIn}.</p>`, BRAND.amberBg, `${BRAND.amber}`)}
      <p style="margin:8px 0 0;font-size:13px;color:${BRAND.muted}">If you were not expecting this invitation, you can safely ignore this email.</p>
    ${baseStyles.footer}`,
  }),

  assessmentScoreReleased: (params: {
    candidateName: string
    examTitle: string
    score: number
    maxScore: number
    resultsUrl: string
  }) => ({
    subject: `Your results are ready: "${params.examTitle}" — CodeSpectra Assessment`,
    html: `${baseStyles.wrapper}
      <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Assessment Results Ready</h1>
      <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Hi <strong>${params.candidateName}</strong>,</p>
      <p style="margin:0 0 16px;color:${BRAND.muted};font-size:14px">Your assessment results for <strong>${params.examTitle}</strong> have been released by the evaluator.</p>
      ${baseStyles.card(`
        <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
          ${statRow('Assessment', params.examTitle)}
          ${statRow('Your Score', `${params.score} / ${params.maxScore}`)}
          ${statRow('Percentage', `${Math.round((params.score / (params.maxScore || 1)) * 100)}%`)}
        </table>
      `)}
      ${baseStyles.button(params.resultsUrl, 'View Feedback & Details')}
      <p style="margin:8px 0 0;font-size:13px;color:${BRAND.muted}">Log in to your candidate dashboard to view detailed feedback for each question.</p>
    ${baseStyles.footer}`,
  }),

  assessmentReminder: (params: {
    candidateName: string
    examTitle: string
    inviteUrl: string
    expiresIn: string
  }) => ({
    subject: `Reminder: "${params.examTitle}" assessment awaits — CodeSpectra`,
    html: `${baseStyles.wrapper}
      <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Assessment Reminder</h1>
      <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Hi <strong>${params.candidateName}</strong>,</p>
      <p style="margin:0 0 16px;color:${BRAND.muted};font-size:14px">This is a friendly reminder that you have a pending assessment <strong>${params.examTitle}</strong> on CodeSpectra.</p>
      ${baseStyles.card(`
        <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
          ${statRow('Assessment', params.examTitle)}
          ${statRow('Invite expires', params.expiresIn)}
          ${statRow('Status', 'Pending')}
        </table>
      `)}
      <p style="margin:16px 0 4px;font-size:14px;color:${BRAND.text};font-weight:500">Quick tips:</p>
      <ul style="margin:4px 0 20px;padding-left:18px;color:${BRAND.muted};font-size:14px;line-height:1.8">
        <li>Timed assessment — make sure you have uninterrupted time</li>
        <li>Stable internet connection recommended</li>
        <li>Camera access required for proctoring</li>
      </ul>
      ${baseStyles.button(params.inviteUrl, 'Continue Your Assessment')}
      ${alertBox(`<p style="margin:0;font-size:13px;color:${BRAND.text}">This invite link expires on ${params.expiresIn}. Complete your assessment before then.</p>`, BRAND.amberBg, `${BRAND.amber}`)}
    ${baseStyles.footer}`,
  }),

  levelUp: (params: { name: string; newLevel: number; totalXp: number; certUrl: string }) => {
    const base = getBaseUrl()
    return {
      subject: `Level up! You're now Level ${params.newLevel} 🎉`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Congratulations, ${params.name}!</h1>
        <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">You just reached <strong>Level ${params.newLevel}</strong> with a total of <strong>${params.totalXp} XP</strong>. Keep learning, practicing and competing to climb even higher.</p>
        ${baseStyles.card(`
          <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
            ${statRow('Level', `Level ${params.newLevel}`)}
            ${statRow('Total XP', `${params.totalXp} XP`)}
            ${statRow('Certificate', 'Issued ✓')}
          </table>
        `)}
        ${baseStyles.button(`${base}${params.certUrl}`, 'View Your Level-Up Certificate')}
        <p style="margin:8px 0 0;font-size:13px;color:${BRAND.muted}">Your certificate is verified on the public verify page — share it anywhere.</p>
      ${baseStyles.footer}`,
    }
  },

  certificateEarned: (params: { name: string; title: string; certUrl: string }) => {
    const base = getBaseUrl()
    return {
      subject: `Your ${params.title} certificate is ready 🎓`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Certificate issued, ${params.name}!</h1>
        <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">You've been issued the <strong>${params.title}</strong> certificate. It's verifiable, downloadable and ready to share.</p>
        ${baseStyles.button(`${base}${params.certUrl}`, 'View Certificate')}
      ${baseStyles.footer}`,
    }
  },

  newsletter: (params: { subject: string; body: string }) => {
    const base = getBaseUrl()
    return {
      subject: params.subject,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">${params.subject}</h1>
        <div style="margin:12px 0 16px;font-size:15px;line-height:1.7;color:${BRAND.text}">${params.body}</div>
        ${baseStyles.button(`${base}/dashboard`, 'Go to Dashboard')}
        <p style="margin:8px 0 0;font-size:12px;color:${BRAND.muted}">
          You're receiving this because you subscribed to CodeSpectra updates.
          <a href="${base}/api/newsletter/unsubscribe?email=__EMAIL__" style="color:${BRAND.green};text-decoration:underline">Unsubscribe</a>.
        </p>
      ${baseStyles.footer}`,
    }
  },

  orgAccountProvisioned: (params: { name: string; email: string; password: string; orgName: string; role: string }) => {
    const base = getBaseUrl()
    return {
      subject: `Your ${params.orgName} account is ready — CodeSpectra`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Welcome to CodeSpectra, ${params.name}!</h1>
        <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">An account has been created for you on <strong>${params.orgName}</strong>.</p>
        ${baseStyles.card(`
          <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
            ${statRow('Organization', params.orgName)}
            ${statRow('Role', params.role)}
            ${statRow('Email', params.email)}
            ${statRow('Password', params.password)}
          </table>
        `)}
        ${alertBox(`<p style="margin:0;font-size:13px;color:${BRAND.text}">Please sign in and change your password immediately. Do not share these credentials.</p>`, BRAND.amberBg, BRAND.amber)}
        ${baseStyles.button(`${base}/login`, 'Sign In Now')}
      ${baseStyles.footer}`,
    }
  },
}

export const hackathonEmailTemplates = {
  teamInvite: (params: {
    eventName: string
    teamName: string
    invitedByName: string
    inviteUrl: string
    expiresIn: string
  }) => ({
    subject: `Join ${params.teamName} for ${params.eventName} — Team Invite`,
    html: `${baseStyles.wrapper}
      <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">You're invited to join a hackathon team!</h1>
      <p style="margin:12px 0 8px;color:${BRAND.muted};font-size:14px"><strong>${params.invitedByName}</strong> invited you to join <strong>${params.teamName}</strong> for the upcoming event:</p>
      <div style="background:${BRAND.greenBg};border:1px solid ${BRAND.greenBorder};border-radius:8px;padding:14px 16px;margin:16px 0">
        <div style="font-size:15px;font-weight:700;color:${BRAND.text}">${params.eventName}</div>
        <div style="font-size:13px;color:${BRAND.muted};margin-top:4px">Team: ${params.teamName}</div>
      </div>
      ${baseStyles.button(params.inviteUrl, 'Join Team')}
      <p style="margin:8px 0 0;font-size:13px;color:${BRAND.muted}">This invite expires in ${params.expiresIn}.</p>
    ${baseStyles.footer}`,
  }),

  eventStarting: (params: {
    eventName: string
    teamName: string
    startsAt: string
    duration: string
    workspaceUrl: string
  }) => ({
    subject: `${params.eventName} starts in ${params.startsAt}!`,
    html: `${baseStyles.wrapper}
      <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Event starting soon!</h1>
      <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Hi, your team <strong>${params.teamName}</strong> is registered for <strong>${params.eventName}</strong>.</p>
      ${baseStyles.card(`
        <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
          ${statRow('Starts at', params.startsAt)}
          ${statRow('Duration', params.duration)}
          ${statRow('Team', params.teamName)}
        </table>
      `)}
      ${baseStyles.button(params.workspaceUrl, 'Enter Workspace')}
      <p style="margin:8px 0 0;font-size:13px;color:${BRAND.muted}">Make sure all team members are ready. Good luck! 🚀</p>
    ${baseStyles.footer}`,
  }),

  endingSoon: (params: {
    eventName: string
    teamName: string
    endsAt: string
    xp: number
    problemsSolved: number
    workspaceUrl: string
  }) => ({
    subject: `${params.eventName} ending in ${params.endsAt} — submit now!`,
    html: `${baseStyles.wrapper}
      <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.amber}">⏰ Event ending soon!</h1>
      <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Hi <strong>${params.teamName}</strong>, <strong>${params.eventName}</strong> ends in <strong>${params.endsAt}</strong>. Submit all your solutions now!</p>
      ${baseStyles.card(`
        <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
          ${statRow('Current XP', `${params.xp}`)}
          ${statRow('Problems solved', `${params.problemsSolved}`)}
          ${statRow('Time remaining', params.endsAt)}
        </table>
      `)}
      ${baseStyles.button(params.workspaceUrl, 'Submit Now')}
    ${baseStyles.footer}`,
  }),

  judgeAssignment: (params: {
    eventName: string
    judgeName: string
    teamCount: number
    problemCount: number
    reviewUrl: string
  }) => ({
    subject: `You've been assigned as a judge — ${params.eventName}`,
    html: `${baseStyles.wrapper}
      <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Judge assignment</h1>
      <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Hi <strong>${params.judgeName}</strong>, you've been assigned as a judge for <strong>${params.eventName}</strong>.</p>
      ${baseStyles.card(`
        <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
          ${statRow('Event', params.eventName)}
          ${statRow('Teams', `${params.teamCount}`)}
          ${statRow('Problems to review', `${params.problemCount}`)}
        </table>
      `)}
      <p style="margin:0 0 16px;font-size:13px;color:${BRAND.muted}">As a judge, you'll review team submissions, provide scores and feedback. The leaderboard is hidden until results are released.</p>
      ${baseStyles.button(params.reviewUrl, 'Start Reviewing')}
    ${baseStyles.footer}`,
  }),

  teamJoinConfirmation: (params: {
    eventName: string
    teamName: string
    memberName: string
    workspaceUrl: string
  }) => ({
    subject: `You're in! Joined ${params.teamName} for ${params.eventName}`,
    html: `${baseStyles.wrapper}
      <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">You've joined ${params.teamName}!</h1>
      <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Hi <strong>${params.memberName}</strong>, you're now a member of <strong>${params.teamName}</strong> for <strong>${params.eventName}</strong>.</p>
      ${baseStyles.card(`
        <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
          ${statRow('Event', params.eventName)}
          ${statRow('Team', params.teamName)}
          ${statRow('Your role', 'Member')}
        </table>
      `)}
      ${baseStyles.button(params.workspaceUrl, 'Go to Workspace')}
    ${baseStyles.footer}`,
  }),

  resultsReleased: (params: {
    eventName: string
    teamName: string
    rank: number
    totalTeams: number
    score: number
    resultsUrl: string
  }) => {
    const medal = params.rank === 1 ? '🥇' : params.rank === 2 ? '🥈' : params.rank === 3 ? '🥉' : `#${params.rank}`
    return {
      subject: `Results are out! ${params.eventName} — Your team ranked ${medal}`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Results are here!</h1>
        <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">The results for <strong>${params.eventName}</strong> are now available. Here's how your team did:</p>
        ${baseStyles.card(`
          <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
            ${statRow('Team', params.teamName)}
            ${statRow('Rank', `${medal} of ${params.totalTeams}`)}
            ${statRow('Final score', `${params.score} XP`)}
          </table>
        `)}
        ${baseStyles.button(params.resultsUrl, 'View Full Results & Certificate')}
        <p style="margin:8px 0 0;font-size:13px;color:${BRAND.muted}">Download your certificate and share your achievement on LinkedIn.</p>
      ${baseStyles.footer}`,
    }
  },

  detailedResults: (params: {
    eventName: string
    teamName: string
    rank: number
    totalTeams: number
    totalXp: number
    problems: Array<{
      title: string
      points: number
      earned: number
      submittedAt: string
      timeSpent: string
      attempts: number
    }>
    resultsUrl: string
    certificateUrl: string
  }) => {
    const medal = params.rank === 1 ? '🥇' : params.rank === 2 ? '🥈' : params.rank === 3 ? '🥉' : `#${params.rank}`
    return {
      subject: `${params.eventName} — Detailed team report for ${params.teamName}`,
      html: `${baseStyles.wrapper}
        <h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${BRAND.text}">Detailed Results — ${params.eventName}</h1>
        <p style="margin:12px 0 16px;color:${BRAND.muted};font-size:14px">Hi <strong>${params.teamName}</strong>, here's your complete performance breakdown.</p>

        ${baseStyles.card(`
          <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
            ${statRow('Final rank', `${medal} of ${params.totalTeams}`)}
            ${statRow('Total score', `${params.totalXp} XP`)}
          </table>
        `)}

        <p style="margin:20px 0 10px;font-size:14px;font-weight:600;color:${BRAND.text}">Problem Breakdown</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse">
          <thead>
            <tr style="background:${BRAND.surface}">
              <th style="text-align:left;padding:8px 12px;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted};font-weight:500">Problem</th>
              <th style="text-align:right;padding:8px 12px;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted};font-weight:500">Score</th>
              <th style="text-align:right;padding:8px 12px;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted};font-weight:500">Time</th>
              <th style="text-align:right;padding:8px 12px;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted};font-weight:500">Attempts</th>
            </tr>
          </thead>
          <tbody>
            ${params.problems.map(p => `
              <tr>
                <td style="padding:8px 12px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text}">${p.title}</td>
                <td style="text-align:right;padding:8px 12px;border-bottom:1px solid ${BRAND.border};font-weight:600;color:${p.earned >= p.points ? BRAND.green : BRAND.amber}">${p.earned}/${p.points}</td>
                <td style="text-align:right;padding:8px 12px;border-bottom:1px solid ${BRAND.border};font-family:${FONTS.mono};color:${BRAND.muted}">${p.timeSpent}</td>
                <td style="text-align:right;padding:8px 12px;border-bottom:1px solid ${BRAND.border};font-family:${FONTS.mono};color:${BRAND.muted}">${p.attempts}</td>
              </tr>`).join('')}
          </tbody>
        </table>

        <div style="display:flex;gap:10px;margin-top:20px">
          ${baseStyles.button(params.resultsUrl, 'View Full Report').replace('margin:24px 0', 'margin:0')}
        </div>
      ${baseStyles.footer}`,
    }
  },
}

