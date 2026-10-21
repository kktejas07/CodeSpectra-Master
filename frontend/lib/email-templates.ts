// ponytail: Brand update from purple-indigo to green (#22c55e) to match icon.svg
import { formatDate } from '@/lib/format-datetime'
import { getCurrencySymbol } from '@/lib/currency'
import { DEFAULT_LOCALE, LOCALE_META, toLocale, type Locale } from '@/lib/i18n/config'
import { fillOutbound, outboundTemplate, type OutboundParams } from '@/lib/i18n/outbound'

/**
 * Transactional email templates, in the recipient's language.
 *
 *   const tpl = emailTemplatesFor(await localeForEmail(to)).passwordReset(url)
 *
 * `emailTemplates` / `hackathonEmailTemplates` are the English set (same
 * output as before). Text lives in lib/i18n/messages/<locale>/email.json:
 * `**bold**` and `[link](url)` are the only markup; values are inserted as
 * given (callers HTML-escape user text, as before).
 */

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

const wrapper = (locale: Locale) => `
<div lang="${locale}" style="background:#f3f4f6;padding:40px 16px;font-family:${FONTS.sans}">
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
    <tr><td style="padding:32px 32px 28px;color:${BRAND.text};font-size:15px;line-height:1.7">`

const baseStyles = {
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
  codeBlock: (text: string) =>
    `<pre style="font-family:${FONTS.mono};font-size:12px;background:#1a1a1a;color:#e5e7eb;padding:16px;border-radius:8px;overflow-x:auto;line-height:1.5;margin:16px 0">${text}</pre>`,
}

const statRow = (label: string, value: string, mono = false) =>
  `<tr><td style="padding:4px 0;color:${BRAND.muted};font-size:14px">${label}</td><td style="text-align:right;font-weight:600;font-size:14px;color:${BRAND.text};font-family:${mono ? FONTS.mono : 'inherit'}">${value}</td></tr>`

const alertBox = (content: string, bg: string, border: string) =>
  `<div style="background:${bg};border-left:3px solid ${border.split(' ')[0]};padding:12px 16px;border-radius:0 6px 6px 0;margin:16px 0">${content}</div>`

const table = (rows: string) => `
          <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px">
            ${rows}
          </table>
        `

const medalFor = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`)

type Rich = (key: string, params?: OutboundParams, linkStyle?: string) => string

/** Translator pair for one locale: `t` plain text, `r` with **bold** / [link](url). */
function textFor(locale: Locale): { t: (key: string, params?: OutboundParams) => string; r: Rich } {
  const tpl = (key: string) => outboundTemplate('email', locale, key) ?? key
  return {
    t: (key, params) => fillOutbound(tpl(key), params),
    r: (key, params, linkStyle = `color:${BRAND.green};font-weight:600`) =>
      fillOutbound(
        tpl(key)
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, `<a href="$2" style="${linkStyle}">$1</a>`),
        params,
      ),
  }
}

function makeEmailTemplates(locale: Locale) {
  const { t, r } = textFor(locale)
  const W = wrapper(locale)
  const F = baseStyles.footer
  const h1 = (text: string, color = BRAND.text) => `<h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${color}">${text}</h1>`
  const lead = (html: string, margin = '12px 0 16px') => `<p style="margin:${margin};color:${BRAND.muted};font-size:14px">${html}</p>`
  const note = (html: string, margin = '8px 0 0') => `<p style="margin:${margin};font-size:13px;color:${BRAND.muted}">${html}</p>`
  const money = (amount: number, currency: string) => `${getCurrencySymbol(currency)}${(amount / 100).toFixed(2)}`
  // English keeps en-GB (as before); Hindi / Telugu use their own month names.
  const longDate = (ms: number) => formatDate(ms, undefined, { month: 'long', day: 'numeric', year: 'numeric' }, locale === 'en' ? undefined : LOCALE_META[locale].intl)

  return {
    welcomeEmail: (name: string) => {
      const base = getBaseUrl()
      const steps = ([1, 2, 3, 4] as const).map((i) => [t(`welcome.step${i}Title`), t(`welcome.step${i}Desc`)])
      return {
        subject: t('welcome.subject', { name }),
        html: `${W}
        ${h1(t('welcome.heading', { name }))}
        ${lead(t('welcome.intro'), '12px 0 20px')}
        <div style="display:grid;gap:10px;margin:0 0 20px">
          ${steps.map(([title, desc]) => `
            <div style="display:flex;align-items:flex-start;gap:10px;padding:12px;background:${BRAND.surface};border-radius:8px;border:1px solid ${BRAND.border}">
              <div style="width:6px;height:6px;background:${BRAND.green};border-radius:50%;margin-top:6px;flex-shrink:0"></div>
              <div><strong style="font-size:14px;color:${BRAND.text}">${title}</strong><br/><span style="font-size:13px;color:${BRAND.muted}">${desc}</span></div>
            </div>`).join('')}
        </div>
        ${baseStyles.button(`${base}/dashboard`, t('button.dashboard'))}
      ${F}`,
      }
    },

    loginNotification: (name: string, deviceInfo: string, location: string, time: string) => {
      const base = getBaseUrl()
      return {
        subject: t('login.subject'),
        html: `${W}
        ${h1(t('login.heading'))}
        ${lead(r('login.intro', { name }))}
        ${baseStyles.card(table(`${statRow(t('label.device'), deviceInfo)}
            ${statRow(t('label.location'), location)}
            ${statRow(t('label.time'), time, true)}`))}
        ${alertBox(`<p style="margin:0;font-size:13px;color:${BRAND.text}">${r('login.notYou', { url: `${base}/dashboard/settings` })}</p>`, BRAND.amberBg, `${BRAND.amber}`)}
        ${baseStyles.button(`${base}/dashboard/settings`, t('login.button'), 'outline')}
      ${F}`,
      }
    },

    jobApplicationConfirmation: (jobTitle: string, companyName: string, applicantName: string) => {
      const base = getBaseUrl()
      return {
        subject: t('job.subject', { jobTitle }),
        html: `${W}
        ${h1(t('job.heading'))}
        ${lead(r('job.intro', { name: applicantName }))}
        ${baseStyles.card(table(`${statRow(t('label.position'), jobTitle)}
            ${statRow(t('label.company'), companyName)}
            ${statRow(t('label.status'), t('value.underReview'))}`))}
        <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${BRAND.text}">${t('job.next')}</p>
        <div style="display:flex;gap:8px;margin:0 0 20px;flex-wrap:wrap">
          ${[t('job.step1'), t('job.step2'), t('job.step3')].map((step, i) => `
            <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:${BRAND.muted}">
              <span style="background:${BRAND.green};color:#fff;width:18px;height:18px;border-radius:50%;text-align:center;line-height:18px;font-size:10px;font-weight:700;flex-shrink:0">${i + 1}</span>
              ${step}
            </div>`).join('')}
        </div>
        ${baseStyles.button(`${base}/dashboard/jobs`, t('job.button'))}
      ${F}`,
      }
    },

    examStartedNotification: (examTitle: string, candidateName: string) => {
      const base = getBaseUrl()
      return {
        subject: t('examStarted.subject', { examTitle }),
        html: `${W}
        ${h1(t('examStarted.heading'))}
        ${lead(r('examStarted.intro', { name: candidateName, examTitle }))}
        ${baseStyles.card(`
          <ul style="margin:0;padding-left:18px;color:${BRAND.text};font-size:14px;line-height:1.9">
            ${[1, 2, 3, 4].map((i) => `<li>${t(`examStarted.tip${i}`)}</li>`).join('\n            ')}
          </ul>
        `)}
        <p style="margin:0 0 20px;font-size:14px;color:${BRAND.green};font-weight:500">${t('examStarted.goodLuck')}</p>
        ${baseStyles.button(`${base}/dashboard/assessments`, t('examStarted.button'), 'outline')}
      ${F}`,
      }
    },

    subscriptionConfirmation: (planName: string, amount: number, currency = 'INR') => {
      const base = getBaseUrl()
      const cur = currency || 'USD'
      return {
        subject: t('subscription.subject', { plan: planName }),
        html: `${W}
        ${h1(t('subscription.heading'))}
        ${lead(r('subscription.intro', { plan: planName }))}
        ${baseStyles.card(table(`${statRow(t('label.plan'), planName)}
            ${statRow(t('label.amount'), `${money(amount, cur)} ${currency}`)}
            ${statRow(t('label.nextBilling'), longDate(Date.now() + 30 * 86400000))}
            ${statRow(t('label.status'), t('value.active'))}`))}
        <p style="margin:0 0 4px;font-size:13px;color:${BRAND.muted}">${t('subscription.manageNote')}</p>
        ${baseStyles.button(`${base}/dashboard/billing`, t('subscription.button'))}
      ${F}`,
      }
    },

    invoiceNotification: (invoiceId: string, amount: number, planName: string, currency = 'INR') => {
      const base = getBaseUrl()
      return {
        subject: t('invoice.subject', { invoiceId, plan: planName }),
        html: `${W}
        ${h1(t('invoice.heading'))}
        ${lead(r('invoice.intro', { plan: planName }))}
        ${baseStyles.card(table(`${statRow(t('label.invoice'), `#${invoiceId}`, true)}
            ${statRow(t('label.amount'), `${money(amount, currency || 'USD')} ${currency}`)}
            ${statRow(t('label.plan'), planName)}
            ${statRow(t('label.status'), t('value.paid'))}`))}
        ${baseStyles.button(`${base}/dashboard/billing`, t('invoice.button'))}
      ${F}`,
      }
    },

    phonePePaymentSuccess: (planName: string, amount: number, transactionId: string, currency?: string) => {
      const base = getBaseUrl()
      const amt = money(amount, currency || 'INR')
      return {
        subject: t('paySuccess.subject', { plan: planName }),
        html: `${W}
        ${h1(t('paySuccess.heading'))}
        ${lead(r('paySuccess.intro', { amount: amt, plan: planName }))}
        ${baseStyles.card(table(`${statRow(t('label.transactionId'), transactionId, true)}
            ${statRow(t('label.method'), 'PhonePe UPI')}
            ${statRow(t('label.amount'), amt)}
            ${statRow(t('label.status'), t('value.success'))}`))}
        ${baseStyles.button(`${base}/dashboard/billing`, t('paySuccess.button'))}
      ${F}`,
      }
    },

    phonePePaymentFailed: (planName: string, amount: number, reason?: string, currency?: string) => {
      const base = getBaseUrl()
      const amt = money(amount, currency || 'INR')
      return {
        subject: t('payFailed.subject', { plan: planName }),
        html: `${W}
        ${h1(t('payFailed.heading'), BRAND.red)}
        ${lead(r('payFailed.intro', { amount: amt, plan: planName }))}
        ${reason ? alertBox(`<p style="margin:0;font-size:14px;color:${BRAND.red}">${r('payFailed.reason', { reason })}</p>`, BRAND.redBg, `${BRAND.red}`) : ''}
        <p style="margin:16px 0;font-size:14px;color:${BRAND.muted}">${t('payFailed.retryNote')}</p>
        ${baseStyles.button(`${base}/dashboard/billing`, t('payFailed.button'))}
      ${F}`,
      }
    },

    passwordReset: (resetUrl: string) => ({
      subject: t('reset.subject'),
      html: `${W}
      ${h1(t('reset.heading'))}
      ${lead(r('reset.intro'))}
      ${baseStyles.button(resetUrl, t('reset.button'))}
      ${alertBox(`<p style="margin:0;font-size:13px;color:${BRAND.muted}">${t('reset.ignore')}</p>`, BRAND.greenBg, `${BRAND.green}`)}
    ${F}`,
    }),

    emailVerification: (verifyUrl: string) => ({
      subject: t('verify.subject'),
      html: `${W}
      ${h1(t('verify.heading'))}
      ${lead(t('verify.intro'))}
      ${baseStyles.button(verifyUrl, t('verify.button'))}
      ${note(t('verify.ignore'))}
    ${F}`,
    }),

    teamInvite: (teamName: string, invitedByName: string, acceptUrl: string) => ({
      subject: t('teamInvite.subject', { team: teamName }),
      html: `${W}
      ${h1(t('teamInvite.heading'))}
      ${lead(r('teamInvite.intro', { inviter: invitedByName, team: teamName }))}
      ${baseStyles.button(acceptUrl, t('button.acceptInvitation'))}
      ${note(t('invite.expires7'))}
    ${F}`,
    }),

    orgInvite: (params: { orgName: string; invitedByName: string; acceptUrl: string }) => ({
      subject: t('orgInvite.subject', { org: params.orgName }),
      html: `${W}
      ${h1(t('orgInvite.heading'))}
      ${lead(r('orgInvite.intro', { inviter: params.invitedByName, org: params.orgName }))}
      ${lead(r('orgInvite.body', { org: params.orgName }))}
      ${baseStyles.button(params.acceptUrl, t('button.acceptInvitation'))}
      ${note(t('invite.expires7'))}
    ${F}`,
    }),

    /** ATS hiring-team invite (lib/ats/access.ts). All params must be HTML-escaped by the caller. */
    atsTeamInvite: (params: { orgName: string; invitedByName: string; roleLabel: string; clientName?: string | null; acceptUrl: string; expiresDays: number }) => ({
      subject: t('atsInvite.subject', { org: params.orgName }),
      html: `${W}
      ${h1(t('atsInvite.heading'))}
      ${lead(r(params.clientName ? 'atsInvite.introClient' : 'atsInvite.intro', { inviter: params.invitedByName, org: params.orgName, role: params.roleLabel, client: params.clientName }))}
      ${lead(t('atsInvite.body'))}
      ${baseStyles.button(params.acceptUrl, t('atsInvite.button'))}
      ${note(t('atsInvite.expires', { days: params.expiresDays }))}
    ${F}`,
    }),

    twoFactorBackup: (backupCodes: string) => ({
      subject: t('backup.subject'),
      html: `${W}
      ${h1(t('backup.heading'))}
      ${lead(r('backup.intro'))}
      ${baseStyles.codeBlock(backupCodes)}
      ${alertBox(`<p style="margin:0;font-size:13px;color:${BRAND.text}">${t('backup.note')}</p>`, BRAND.amberBg, `${BRAND.amber}`)}
    ${F}`,
    }),

    assessmentInvite: (params: { candidateName: string; examTitle: string; inviteUrl: string; expiresIn: string }) => ({
      subject: t('assessInvite.subject', { examTitle: params.examTitle }),
      html: `${W}
      ${h1(t('assessInvite.heading'))}
      ${lead(r('assess.hi', { name: params.candidateName }))}
      ${lead(t('assessInvite.intro'), '0 0 16px')}
      ${baseStyles.card(table(`${statRow(t('label.assessment'), params.examTitle)}
          ${statRow(t('label.inviteExpires'), params.expiresIn)}
          ${statRow(t('label.status'), t('value.pending'))}`))}
      <p style="margin:16px 0 4px;font-size:14px;color:${BRAND.text};font-weight:500">${t('assessInvite.expect')}</p>
      <ul style="margin:4px 0 20px;padding-left:18px;color:${BRAND.muted};font-size:14px;line-height:1.8">
        ${[1, 2, 3, 4].map((i) => `<li>${t(`assessInvite.tip${i}`)}</li>`).join('\n        ')}
      </ul>
      ${baseStyles.button(params.inviteUrl, t('assessInvite.button'))}
      ${alertBox(`<p style="margin:0;font-size:13px;color:${BRAND.text}">${r('assessInvite.oneTime', { expires: params.expiresIn })}</p>`, BRAND.amberBg, `${BRAND.amber}`)}
      ${note(t('footer.ignore'))}
    ${F}`,
    }),

    assessmentScoreReleased: (params: { candidateName: string; examTitle: string; score: number; maxScore: number; resultsUrl: string }) => ({
      subject: t('assessResults.subject', { examTitle: params.examTitle }),
      html: `${W}
      ${h1(t('assessResults.heading'))}
      ${lead(r('assess.hi', { name: params.candidateName }))}
      ${lead(r('assessResults.intro', { examTitle: params.examTitle }), '0 0 16px')}
      ${baseStyles.card(table(`${statRow(t('label.assessment'), params.examTitle)}
          ${statRow(t('label.yourScore'), `${params.score} / ${params.maxScore}`)}
          ${statRow(t('label.percentage'), `${Math.round((params.score / (params.maxScore || 1)) * 100)}%`)}`))}
      ${baseStyles.button(params.resultsUrl, t('assessResults.button'))}
      ${note(t('assessResults.note'))}
    ${F}`,
    }),

    assessmentReminder: (params: { candidateName: string; examTitle: string; inviteUrl: string; expiresIn: string }) => ({
      subject: t('assessReminder.subject', { examTitle: params.examTitle }),
      html: `${W}
      ${h1(t('assessReminder.heading'))}
      ${lead(r('assess.hi', { name: params.candidateName }))}
      ${lead(r('assessReminder.intro', { examTitle: params.examTitle }), '0 0 16px')}
      ${baseStyles.card(table(`${statRow(t('label.assessment'), params.examTitle)}
          ${statRow(t('label.inviteExpires'), params.expiresIn)}
          ${statRow(t('label.status'), t('value.pending'))}`))}
      <p style="margin:16px 0 4px;font-size:14px;color:${BRAND.text};font-weight:500">${t('assessReminder.tips')}</p>
      <ul style="margin:4px 0 20px;padding-left:18px;color:${BRAND.muted};font-size:14px;line-height:1.8">
        ${[1, 2, 3].map((i) => `<li>${t(`assessReminder.tip${i}`)}</li>`).join('\n        ')}
      </ul>
      ${baseStyles.button(params.inviteUrl, t('assessReminder.button'))}
      ${alertBox(`<p style="margin:0;font-size:13px;color:${BRAND.text}">${t('assessReminder.expires', { expires: params.expiresIn })}</p>`, BRAND.amberBg, `${BRAND.amber}`)}
    ${F}`,
    }),

    levelUp: (params: { name: string; newLevel: number; totalXp: number; certUrl: string }) => {
      const base = getBaseUrl()
      return {
        subject: t('levelUp.subject', { level: params.newLevel }),
        html: `${W}
        ${h1(t('levelUp.heading', { name: params.name }))}
        ${lead(r('levelUp.intro', { level: params.newLevel, xp: params.totalXp }))}
        ${baseStyles.card(table(`${statRow(t('label.level'), t('value.levelN', { level: params.newLevel }))}
            ${statRow(t('label.totalXp'), `${params.totalXp} XP`)}
            ${statRow(t('label.certificate'), t('value.issued'))}`))}
        ${baseStyles.button(`${base}${params.certUrl}`, t('levelUp.button'))}
        ${note(t('levelUp.note'))}
      ${F}`,
      }
    },

    certificateEarned: (params: { name: string; title: string; certUrl: string }) => {
      const base = getBaseUrl()
      return {
        subject: t('cert.subject', { title: params.title }),
        html: `${W}
        ${h1(t('cert.heading', { name: params.name }))}
        ${lead(r('cert.intro', { title: params.title }))}
        ${baseStyles.button(`${base}${params.certUrl}`, t('cert.button'))}
      ${F}`,
      }
    },

    newsletter: (params: { subject: string; body: string }) => {
      const base = getBaseUrl()
      return {
        subject: params.subject,
        html: `${W}
        ${h1(params.subject)}
        <div style="margin:12px 0 16px;font-size:15px;line-height:1.7;color:${BRAND.text}">${params.body}</div>
        ${baseStyles.button(`${base}/dashboard`, t('button.dashboard'))}
        <p style="margin:8px 0 0;font-size:12px;color:${BRAND.muted}">
          ${t('newsletter.why')}
          <a href="${base}/api/newsletter/unsubscribe?email=__EMAIL__" style="color:${BRAND.green};text-decoration:underline">${t('newsletter.unsubscribe')}</a>.
        </p>
      ${F}`,
      }
    },

    orgAccountProvisioned: (params: { name: string; email: string; password: string; orgName: string; role: string }) => {
      const base = getBaseUrl()
      return {
        subject: t('account.subject', { org: params.orgName }),
        html: `${W}
        ${h1(t('account.heading', { name: params.name }))}
        ${lead(r('account.intro', { org: params.orgName }))}
        ${baseStyles.card(table(`${statRow(t('label.organization'), params.orgName)}
            ${statRow(t('label.role'), params.role)}
            ${statRow(t('label.email'), params.email)}
            ${statRow(t('label.password'), params.password)}`))}
        ${alertBox(`<p style="margin:0;font-size:13px;color:${BRAND.text}">${t('account.changePassword')}</p>`, BRAND.amberBg, BRAND.amber)}
        ${baseStyles.button(`${base}/login`, t('account.signInNow'))}
      ${F}`,
      }
    },

    accountCredentials: (params: { name: string; email: string; role: string; orgName: string }) => {
      const base = getBaseUrl()
      return {
        subject: t('account.subject', { org: params.orgName }),
        html: `${W}
        ${h1(t('account.heading', { name: params.name }))}
        ${lead(r('account.intro', { org: params.orgName }))}
        ${baseStyles.card(table(`${statRow(t('label.name'), params.name)}
            ${statRow(t('label.email'), params.email)}
            ${statRow(t('label.role'), params.role)}
            ${statRow(t('label.organization'), params.orgName)}`))}
        <p style="margin:16px 0;font-size:14px;color:${BRAND.text};font-weight:500">${t('account.howTo')}</p>
        <ol style="margin:0 0 16px;padding-left:18px;color:${BRAND.muted};font-size:14px;line-height:1.9">
          <li>${r('account.step1', { url: `${base}/login` }, `color:${BRAND.green};font-weight:500;text-decoration:none`)}</li>
          <li>${t('account.step2')}</li>
          <li>${t('account.step3')}</li>
        </ol>
        ${baseStyles.button(`${base}/login`, t('account.signIn'))}
      ${F}`,
      }
    },
  }
}

function makeHackathonEmailTemplates(locale: Locale) {
  const { t, r } = textFor(locale)
  const W = wrapper(locale)
  const F = baseStyles.footer
  const h1 = (text: string, color = BRAND.text) => `<h1 style="font-size:20px;margin:0 0 4px;font-weight:700;color:${color}">${text}</h1>`
  const lead = (html: string, margin = '12px 0 16px') => `<p style="margin:${margin};color:${BRAND.muted};font-size:14px">${html}</p>`
  const note = (html: string, margin = '8px 0 0') => `<p style="margin:${margin};font-size:13px;color:${BRAND.muted}">${html}</p>`

  return {
    teamInvite: (params: { eventName: string; teamName: string; invitedByName: string; inviteUrl: string; expiresIn: string }) => ({
      subject: t('hack.invite.subject', { team: params.teamName, event: params.eventName }),
      html: `${W}
      ${h1(t('hack.invite.heading'))}
      ${lead(r('hack.invite.intro', { inviter: params.invitedByName, team: params.teamName }), '12px 0 8px')}
      <div style="background:${BRAND.greenBg};border:1px solid ${BRAND.greenBorder};border-radius:8px;padding:14px 16px;margin:16px 0">
        <div style="font-size:15px;font-weight:700;color:${BRAND.text}">${params.eventName}</div>
        <div style="font-size:13px;color:${BRAND.muted};margin-top:4px">${t('hack.invite.team', { team: params.teamName })}</div>
      </div>
      ${baseStyles.button(params.inviteUrl, t('hack.invite.button'))}
      ${note(t('hack.invite.expires', { expires: params.expiresIn }))}
    ${F}`,
    }),

    eventStarting: (params: { eventName: string; teamName: string; startsAt: string; duration: string; workspaceUrl: string }) => ({
      subject: t('hack.starting.subject', { event: params.eventName, startsAt: params.startsAt }),
      html: `${W}
      ${h1(t('hack.starting.heading'))}
      ${lead(r('hack.starting.intro', { team: params.teamName, event: params.eventName }))}
      ${baseStyles.card(table(`${statRow(t('label.startsAt'), params.startsAt)}
          ${statRow(t('label.duration'), params.duration)}
          ${statRow(t('label.team'), params.teamName)}`))}
      ${baseStyles.button(params.workspaceUrl, t('hack.starting.button'))}
      ${note(t('hack.starting.note'))}
    ${F}`,
    }),

    endingSoon: (params: { eventName: string; teamName: string; endsAt: string; xp: number; problemsSolved: number; workspaceUrl: string }) => ({
      subject: t('hack.ending.subject', { event: params.eventName, endsAt: params.endsAt }),
      html: `${W}
      ${h1(t('hack.ending.heading'), BRAND.amber)}
      ${lead(r('hack.ending.intro', { team: params.teamName, event: params.eventName, endsAt: params.endsAt }))}
      ${baseStyles.card(table(`${statRow(t('label.currentXp'), `${params.xp}`)}
          ${statRow(t('label.problemsSolved'), `${params.problemsSolved}`)}
          ${statRow(t('label.timeRemaining'), params.endsAt)}`))}
      ${baseStyles.button(params.workspaceUrl, t('hack.ending.button'))}
    ${F}`,
    }),

    judgeAssignment: (params: { eventName: string; judgeName: string; teamCount: number; problemCount: number; reviewUrl: string }) => ({
      subject: t('hack.judge.subject', { event: params.eventName }),
      html: `${W}
      ${h1(t('hack.judge.heading'))}
      ${lead(r('hack.judge.intro', { name: params.judgeName, event: params.eventName }))}
      ${baseStyles.card(table(`${statRow(t('label.event'), params.eventName)}
          ${statRow(t('label.teams'), `${params.teamCount}`)}
          ${statRow(t('label.problemsToReview'), `${params.problemCount}`)}`))}
      ${note(t('hack.judge.body'), '0 0 16px')}
      ${baseStyles.button(params.reviewUrl, t('hack.judge.button'))}
    ${F}`,
    }),

    teamJoinConfirmation: (params: { eventName: string; teamName: string; memberName: string; workspaceUrl: string }) => ({
      subject: t('hack.joined.subject', { team: params.teamName, event: params.eventName }),
      html: `${W}
      ${h1(t('hack.joined.heading', { team: params.teamName }))}
      ${lead(r('hack.joined.intro', { name: params.memberName, team: params.teamName, event: params.eventName }))}
      ${baseStyles.card(table(`${statRow(t('label.event'), params.eventName)}
          ${statRow(t('label.team'), params.teamName)}
          ${statRow(t('label.yourRole'), t('value.member'))}`))}
      ${baseStyles.button(params.workspaceUrl, t('hack.joined.button'))}
    ${F}`,
    }),

    resultsReleased: (params: { eventName: string; teamName: string; rank: number; totalTeams: number; score: number; resultsUrl: string }) => {
      const medal = medalFor(params.rank)
      return {
        subject: t('hack.results.subject', { event: params.eventName, medal }),
        html: `${W}
        ${h1(t('hack.results.heading'))}
        ${lead(r('hack.results.intro', { event: params.eventName }))}
        ${baseStyles.card(table(`${statRow(t('label.team'), params.teamName)}
            ${statRow(t('label.rank'), t('value.rankOf', { medal, total: params.totalTeams }))}
            ${statRow(t('label.finalScore'), `${params.score} XP`)}`))}
        ${baseStyles.button(params.resultsUrl, t('hack.results.button'))}
        ${note(t('hack.results.note'))}
      ${F}`,
      }
    },

    detailedResults: (params: {
      eventName: string
      teamName: string
      rank: number
      totalTeams: number
      totalXp: number
      problems: Array<{ title: string; points: number; earned: number; submittedAt: string; timeSpent: string; attempts: number }>
      resultsUrl: string
      certificateUrl: string
    }) => {
      const medal = medalFor(params.rank)
      const th = (label: string, align: 'left' | 'right') => `<th style="text-align:${align};padding:8px 12px;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted};font-weight:500">${label}</th>`
      return {
        subject: t('hack.detailed.subject', { event: params.eventName, team: params.teamName }),
        html: `${W}
        ${h1(t('hack.detailed.heading', { event: params.eventName }))}
        ${lead(r('hack.detailed.intro', { team: params.teamName }))}

        ${baseStyles.card(table(`${statRow(t('label.finalRank'), t('value.rankOf', { medal, total: params.totalTeams }))}
            ${statRow(t('label.totalScore'), `${params.totalXp} XP`)}`))}

        <p style="margin:20px 0 10px;font-size:14px;font-weight:600;color:${BRAND.text}">${t('hack.detailed.breakdown')}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-collapse:collapse">
          <thead>
            <tr style="background:${BRAND.surface}">
              ${th(t('label.problem'), 'left')}
              ${th(t('label.score'), 'right')}
              ${th(t('label.time'), 'right')}
              ${th(t('label.attempts'), 'right')}
            </tr>
          </thead>
          <tbody>
            ${params.problems.map((p) => `
              <tr>
                <td style="padding:8px 12px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text}">${p.title}</td>
                <td style="text-align:right;padding:8px 12px;border-bottom:1px solid ${BRAND.border};font-weight:600;color:${p.earned >= p.points ? BRAND.green : BRAND.amber}">${p.earned}/${p.points}</td>
                <td style="text-align:right;padding:8px 12px;border-bottom:1px solid ${BRAND.border};font-family:${FONTS.mono};color:${BRAND.muted}">${p.timeSpent}</td>
                <td style="text-align:right;padding:8px 12px;border-bottom:1px solid ${BRAND.border};font-family:${FONTS.mono};color:${BRAND.muted}">${p.attempts}</td>
              </tr>`).join('')}
          </tbody>
        </table>

        <div style="display:flex;gap:10px;margin-top:20px">
          ${baseStyles.button(params.resultsUrl, t('hack.detailed.button')).replace('margin:24px 0', 'margin:0')}
        </div>
      ${F}`,
      }
    },
  }
}

/** "21 October 2026" in the recipient's language (English as before: en-GB). */
export function emailLongDate(value: string | number | Date, locale: Locale | string | null | undefined): string {
  const l = toLocale(locale) ?? DEFAULT_LOCALE
  return formatDate(value, undefined, { month: 'long', day: 'numeric', year: 'numeric' }, l === 'en' ? undefined : LOCALE_META[l].intl)
}

export type EmailTemplateSet = ReturnType<typeof makeEmailTemplates>
export type HackathonEmailTemplateSet = ReturnType<typeof makeHackathonEmailTemplates>

const cache = new Map<string, unknown>()

/** Templates in `locale` (unknown → English). */
export function emailTemplatesFor(locale: Locale | string | null | undefined): EmailTemplateSet {
  const l = toLocale(locale) ?? DEFAULT_LOCALE
  const k = `e:${l}`
  if (!cache.has(k)) cache.set(k, makeEmailTemplates(l))
  return cache.get(k) as EmailTemplateSet
}

export function hackathonEmailTemplatesFor(locale: Locale | string | null | undefined): HackathonEmailTemplateSet {
  const l = toLocale(locale) ?? DEFAULT_LOCALE
  const k = `h:${l}`
  if (!cache.has(k)) cache.set(k, makeHackathonEmailTemplates(l))
  return cache.get(k) as HackathonEmailTemplateSet
}

/** English templates (kept for existing callers and the admin preview). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const emailTemplates: EmailTemplateSet & { [key: string]: (...args: any[]) => { subject: string; html: string } } = emailTemplatesFor('en') as never
export const hackathonEmailTemplates: HackathonEmailTemplateSet = hackathonEmailTemplatesFor('en')
