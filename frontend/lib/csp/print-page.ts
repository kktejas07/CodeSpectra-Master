/**
 * SEC-024: standalone HTML documents served by API routes (receipts, invoices)
 * are outside the proxy's page CSP. They get this tight policy instead: no
 * network, inline styles only, and exactly one script — the print button —
 * allowed by hash (no inline event handlers, no 'unsafe-inline' scripts), so
 * an escaping bug in the document can't run injected script.
 */
import { createHash } from 'node:crypto'

/** Wires every `[data-print]` button; the button itself carries no handler attribute. */
export const PRINT_BUTTON_SCRIPT =
  "document.querySelectorAll('[data-print]').forEach(function(b){b.addEventListener('click',function(){window.print()})});"

export const PRINT_BUTTON_SCRIPT_HASH = `'sha256-${createHash('sha256').update(PRINT_BUTTON_SCRIPT).digest('base64')}'`

/** `<script>` tag to place at the end of <body>. */
export const PRINT_BUTTON_SCRIPT_TAG = `<script>${PRINT_BUTTON_SCRIPT}</script>`

export const PRINT_PAGE_CSP = `default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src ${PRINT_BUTTON_SCRIPT_HASH}; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`
