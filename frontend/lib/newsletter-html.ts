/**
 * Shared newsletter HTML renderer used by both test send and campaign execution.
 */

export function renderNewsletterHtml(params: {
  subject: string
  hero_image?: string
  intro?: string
  body?: string
  cta_text?: string
  cta_url?: string
}): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const { subject, hero_image, intro, body, cta_text, cta_url } = params

  // Strip script tags for safety
  const rawBody = (body || '').replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  const rawIntro = (intro || '').replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  // Minify pasted/editor HTML: pasting from web pages drags in huge inline
  // style/class bloat that can push the email past Gmail's ~102KB clip limit.
  const safeBody = minifyBody(rawBody)
  const safeIntro = escapeHtml(rawIntro)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <!-- Header Badge -->
        <tr><td align="center" style="padding-bottom:24px">
          <div style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#ffffff;padding:8px 20px;border-radius:20px;font-size:13px;font-weight:600;letter-spacing:0.5px">CODESPECTRA</div>
        </td></tr>

        <!-- Hero Image -->
        ${hero_image ? `<tr><td style="padding-bottom:24px"><img src="${escapeHtml(hero_image)}" alt="" style="width:100%;border-radius:12px;display:block" /></td></tr>` : ''}

        <!-- Card -->
        <tr><td style="background-color:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
          <!-- Subject -->
          <h1 style="font-size:22px;font-weight:700;color:#18181b;margin:0 0 16px;line-height:1.3;padding:0">${escapeHtml(subject)}</h1>

          <!-- Intro -->
          ${safeIntro ? `<p style="font-size:15px;color:#52525b;line-height:1.65;margin:0 0 16px;padding:0">${safeIntro}</p>` : ''}

          <!-- Body (HTML content from rich text editor) -->
          ${safeBody ? `<div style="font-size:15px;color:#18181b;line-height:1.65;margin:0 0 24px;padding:0">${safeBody}</div>` : ''}

          <!-- CTA Button -->
          ${cta_text && cta_url ? `
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
            <tr>
              <td style="background-color:#7c3aed;border-radius:8px;padding:12px 28px">
                <a href="${escapeHtml(cta_url)}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;display:inline-block">${escapeHtml(cta_text)}</a>
              </td>
            </tr>
          </table>` : ''}

          <!-- Footer -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;border-top:1px solid #e4e4e7;padding-top:16px">
            <tr><td>
              <p style="font-size:12px;color:#a1a1aa;margin:0;padding:0">
                You're receiving this because you subscribed to CodeSpectra updates.
                <a href="${base}/api/newsletter/unsubscribe?email=__EMAIL__" style="color:#22c55e;text-decoration:underline">Unsubscribe</a>
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Branding Footer -->
        <tr><td align="center" style="padding:20px 0 0">
          <p style="font-size:11px;color:#a1a1aa;margin:0;padding:0">CodeSpectra &copy; ${new Date().getFullYear()}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Compact HTML produced by contentEditable pastes. Content pasted from web
 * pages carries per-element style/class attributes that can inflate an email
 * past Gmail's ~102KB clip threshold. The rich-text toolbar of this app only
 * emits semantic tags (h1/h2/b/i/u/a/ul/li/blockquote/pre/img/hr), so removing
 * presentational attributes and empty spans is safe here.
 */
function minifyBody(html: string): string {
  // Attributes that carry presentational/paste noise and are safe to drop.
  const bloated = /\s+(?:style|class|id|dir|contenteditable|spellcheck|role|width|height|border|cellpadding|cellspacing|align|valign|bgcolor|face|size|color)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/gi
  return html
    .replace(/<!--[\s\S]*?-->/g, '')               // comments
    .replace(/\s+xmlns(?:\s*=\s*(?:"[^"]*"|'[^']*'))?/gi, '') // Office paste namespaces
    .replace(/\s+xml:[a-z-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?/gi, '')
    .replace(/<\/?o:p[^>]*>/gi, '')                 // Office paste tags
    .replace(/<\/?span[^>]*>/gi, '')                // spans carry no semantics here
    .replace(bloated, '')
    .replace(/>\s+</g, '><')                        // collapse inter-tag whitespace
    .trim()
}
