/**
 * CodeSpectra Device Audit — Content Script.
 *
 * Injected on assessment/exam pages. Responsibilities:
 * 1. Signal that the extension is installed (inject a meta tag the page can check).
 * 2. Extract session info from the URL and request a full audit from background.js.
 * 3. Forward audit results to the page via a CustomEvent.
 */

;(function () {
  'use strict'

  const MARKER_ATTR = 'data-cspectra-audit'
  const MARKER_NAME = 'cspectra-audit'

  // ─── 1. Signal presence ──────────────────────────────────────────────────
  // The exam page checks for: document.querySelector('meta[name="cspectra-audit"]')
  // If this tag exists, the extension is installed and active.
  function injectMarker() {
    if (document.querySelector(`meta[name="${MARKER_NAME}"]`)) return
    const meta = document.createElement('meta')
    meta.name = MARKER_NAME
    meta.content = chrome.runtime.getManifest().version
    document.head.appendChild(meta)
    document.documentElement.setAttribute(MARKER_ATTR, '1')
  }

  // ─── 2. Extract session info from URL ────────────────────────────────────
  function extractSession() {
    const url = window.location.pathname
    // /assessment/[id] → sessionKind=exam, sessionId=[id]
    const assessmentMatch = url.match(/\/assessment\/([^/]+)$/)
    if (assessmentMatch) {
      return { sessionKind: 'exam', sessionId: assessmentMatch[1] }
    }
    // /dashboard/assessments/[id] → sessionKind=exam, sessionId=[id]
    const examMatch = url.match(/\/dashboard\/assessments\/([^/]+)$/)
    if (examMatch) {
      return { sessionKind: 'exam', sessionId: examMatch[1] }
    }
    // /hackathons/[slug]/workspace → sessionKind=problem, sessionId from slug
    const hackMatch = url.match(/\/hackathons\/([^/]+)\/workspace$/)
    if (hackMatch) {
      return { sessionKind: 'problem', sessionId: hackMatch[1] }
    }
    return null
  }

  // ─── 3. Request audit from background ────────────────────────────────────
  function requestAudit(session) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'start-audit', sessionKind: session.sessionKind, sessionId: session.sessionId },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[cspectra-content] background message failed:', chrome.runtime.lastError.message)
            resolve(null)
            return
          }
          resolve(response)
        },
      )
    })
  }

  // ─── 4. Forward results to page ──────────────────────────────────────────
  function dispatchToPage(detail) {
    window.dispatchEvent(new CustomEvent('cspectra-audit-result', { detail }))
  }

  // ─── 5. Listen for messages from background ──────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'audit-result') {
      dispatchToPage(msg.audit)
    }
  })

  // ─── Init ────────────────────────────────────────────────────────────────
  async function init() {
    injectMarker()
    const session = extractSession()
    if (!session) return // not an exam page we care about

    // Wait for page to be ready
    await new Promise((r) => {
      if (document.readyState === 'complete') r()
      else window.addEventListener('load', r, { once: true })
    })

    // Small delay to let the page's React hydration settle
    await new Promise((r) => setTimeout(r, 500))

    const result = await requestAudit(session)
    if (result?.audit) {
      dispatchToPage(result.audit)
    }
  }

  init()
})()
