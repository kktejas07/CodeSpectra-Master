/**
 * Server-only transactional email via Resend or SendGrid HTTP APIs.
 * Credentials: `platform_settings.secrets` (superadmin UI) override environment variables.
 */

import { getServerSecretsFromCache, warmServerSecretsCache } from '@/lib/server-secrets-cache'

export async function sendEmailViaResend(params: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<void> {
  await warmServerSecretsCache()
  const s = getServerSecretsFromCache()
  const apiKey =
    (process.env.RESEND_API_KEY?.trim() || s.resend_api_key?.trim()) ?? ''
  const from =
    (process.env.RESEND_FROM_EMAIL?.trim() || s.resend_from_email?.trim()) ?? ''
  if (!apiKey || !from) {
    throw new Error(
      'Resend is not configured: add API key and From address under Platform settings → Integrations, or set RESEND_API_KEY and RESEND_FROM_EMAIL in the server environment.'
    )
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      ...(params.text ? { text: params.text } : {}),
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend API error (${res.status}): ${body || res.statusText}`)
  }
}

export async function sendEmailViaSendGrid(params: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<void> {
  await warmServerSecretsCache()
  const s = getServerSecretsFromCache()
  const apiKey =
    (process.env.SENDGRID_API_KEY?.trim() || s.sendgrid_api_key?.trim()) ?? ''
  const from =
    (process.env.SENDGRID_FROM_EMAIL?.trim() || s.sendgrid_from_email?.trim()) ?? ''
  if (!apiKey || !from) {
    throw new Error(
      'SendGrid is not configured: add API key and From email under Platform settings → Integrations, or set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL.'
    )
  }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: params.to }] }],
      from: { email: from },
      subject: params.subject,
      content: [
        { type: 'text/html', value: params.html },
        ...(params.text ? [{ type: 'text/plain', value: params.text }] : []),
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`SendGrid API error (${res.status}): ${body || res.statusText}`)
  }
}

export async function sendEmailViaPostal(params: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<void> {
  await warmServerSecretsCache()
  const s = getServerSecretsFromCache()
  const server = (process.env.POSTAL_SERVER?.trim() || s.postal_server?.trim()) ?? ''
  const apiKey = (process.env.POSTAL_API_KEY?.trim() || s.postal_api_key?.trim()) ?? ''
  const from = (process.env.POSTAL_FROM_EMAIL?.trim() || s.postal_from_email?.trim()) ?? ''
  if (!server || !apiKey || !from) {
    throw new Error(
      'Postal is not configured: add Server URL, API key, and From address under Platform settings → Integrations, or set POSTAL_SERVER, POSTAL_API_KEY, POSTAL_FROM_EMAIL in the server environment.'
    )
  }

  const url = `${server.replace(/\/+$/, '')}/api/v1/send/raw`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Server-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: [params.to],
      from,
      subject: params.subject,
      html_body: params.html,
      ...(params.text ? { text_body: params.text } : {}),
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Postal API error (${res.status}): ${body || res.statusText}`)
  }
}

import nodemailer from 'nodemailer'

export async function sendEmailViaSMTP(params: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<void> {
  await warmServerSecretsCache()
  const s = getServerSecretsFromCache()
  const host = (process.env.SMTP_HOST?.trim() || s.smtp_host?.trim()) ?? ''
  const portStr = (process.env.SMTP_PORT?.trim() || s.smtp_port?.trim()) ?? ''
  const user = (process.env.SMTP_USER?.trim() || s.smtp_user?.trim()) ?? ''
  const pass = (process.env.SMTP_PASS?.trim() || s.smtp_pass?.trim()) ?? ''
  const from = (process.env.SMTP_FROM_EMAIL?.trim() || s.smtp_from_email?.trim()) ?? ''
  const port = parseInt(portStr, 10)
  if (!host || !port || !user || !pass || !from) {
    throw new Error(
      'SMTP is not configured: add Host, Port, User, Password, and From address under Platform settings → Integrations, or set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL in the server environment.'
    )
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })

  await transporter.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  })
}
