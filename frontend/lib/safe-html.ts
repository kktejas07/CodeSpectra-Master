/**
 * Article HTML sanitising for blog posts and signals drafts (E13). Drafts are
 * LLM rewrites of external RSS content, so they are untrusted: sanitise on
 * save AND on render. Works in the browser and on the server.
 */
import DOMPurify from 'isomorphic-dompurify'

/** Only http(s) URLs (or same-site relative paths / anchors) are allowed as links. */
export function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s || s.length > 2048) return null
  if (s.startsWith('/') && !s.startsWith('//')) return s
  if (s.startsWith('#')) return s
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

let hooked = false
function ensureHooks() {
  if (hooked) return
  hooked = true
  // Links that open a new tab must not get window.opener.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('target')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

/** Sanitised article HTML: no scripts, styles, frames, forms or event handlers; http(s)/relative links only. */
export function sanitizeArticleHtml(html: unknown): string {
  if (typeof html !== 'string' || !html) return ''
  ensureHooks()
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'meta', 'link', 'base'],
    FORBID_ATTR: ['style', 'srcset'],
    ALLOWED_URI_REGEXP: /^(?:https?:|\/(?!\/)|#)/i,
    ADD_ATTR: ['target'],
  })
}

/** A "Sources" list with validated hrefs and escaped labels. */
export function sourcesListHtml(urls: string[]): string {
  const lis = urls
    .map((u) => safeHttpUrl(u))
    .filter((u): u is string => !!u && /^https?:/i.test(u))
    .map((u) => {
      let label = u
      try { label = new URL(u).hostname.replace(/^www\./, '') } catch { /* keep */ }
      return `<li><a href="${escapeHtml(u)}" rel="noopener noreferrer" target="_blank">${escapeHtml(label)}</a></li>`
    })
    .join('')
  return lis ? `<h2>Sources</h2>\n<ul>${lis}</ul>` : ''
}
