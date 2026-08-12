/**
 * CodeSpectra Device Audit — Popup Script.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const versionEl = document.getElementById('version')
  const statusEl = document.getElementById('status')
  const summaryEl = document.getElementById('summary')
  const devicesEl = document.getElementById('devices')
  const hotplugEl = document.getElementById('hotplug')
  const noSessionEl = document.getElementById('no-session')
  const rescanEl = document.getElementById('rescan')
  const safeCount = document.getElementById('safe-count')
  const warnCount = document.getElementById('warn-count')
  const blockedCount = document.getElementById('blocked-count')
  const rateUs = document.getElementById('rate-us')

  // Version
  const manifest = chrome.runtime.getManifest()
  versionEl.textContent = `v${manifest.version}`

  // Request latest audit from background
  chrome.runtime.sendMessage({ type: 'get-audit' }, (audit) => {
    if (chrome.runtime.lastError || !audit) {
      statusEl.style.display = 'none'
      noSessionEl.style.display = 'block'
      return
    }

    statusEl.style.display = 'none'
    summaryEl.style.display = 'grid'
    devicesEl.style.display = 'block'
    rescanEl.style.display = 'block'

    // Rate-us link only after a successful scan (the win moment).
    // ponytail: store URL derives from the runtime ID; matches the store ID
    // as long as the listing is uploaded with the same signing key (.pem).
    rateUs.href = `https://chromewebstore.google.com/detail/${chrome.runtime.id}`
    rateUs.style.display = 'block'

    safeCount.textContent = audit.safe || 0
    warnCount.textContent = audit.warn || 0
    blockedCount.textContent = audit.blocked || 0

    // Show device list
    const devs = audit.devices || []
    if (devs.length === 0) {
      devicesEl.innerHTML = '<div class="empty">No external devices detected</div>'
    } else {
      devicesEl.innerHTML = devs
        .map(
          (d) => `
        <div class="device ${d.verdict}">
          <span class="device-icon">${d.verdict === 'safe' ? '✓' : d.verdict === 'blocked' ? '✗' : '⚠'}</span>
          <div class="device-info">
            <div class="device-name">${escapeHtml(d.name)}</div>
            <div class="device-reason">${escapeHtml(d.reason || '')}</div>
          </div>
        </div>
      `,
        )
        .join('')
    }

    // Hotplug indicator
    if (audit.session) {
      hotplugEl.style.display = 'flex'
    }

    // Timestamp
    if (audit.timestamp) {
      const ago = Math.round((Date.now() - audit.timestamp) / 1000)
      const timeStr = ago < 60 ? `${ago}s ago` : ago < 3600 ? `${Math.round(ago / 60)}m ago` : `${Math.round(ago / 3600)}h ago`
      hotplugEl.innerHTML = `<span class="hotplug-dot"></span> Last scan: ${timeStr}`
    }
  })

  // Rescan button
  rescanEl.addEventListener('click', async () => {
    rescanEl.disabled = true
    rescanEl.textContent = 'Scanning…'
    statusEl.style.display = 'flex'
    summaryEl.style.display = 'none'
    devicesEl.style.display = 'none'

    // Query active tab for session info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const url = tab?.url || ''
    const match = url.match(/\/assessment\/([^/]+)|\/dashboard\/exams\/([^/]+)/)
    if (!match) {
      statusEl.style.display = 'none'
      noSessionEl.style.display = 'block'
      rescanEl.disabled = false
      rescanEl.textContent = 'Rescan Devices'
      return
    }

    const sessionId = match[1] || match[2]
    chrome.runtime.sendMessage({ type: 'start-audit', sessionKind: 'exam', sessionId }, (resp) => {
      rescanEl.disabled = false
      rescanEl.textContent = 'Rescan Devices'
      if (resp?.audit) {
        // Re-fetch to update UI
        chrome.runtime.sendMessage({ type: 'get-audit' }, (a) => {
          if (a) {
            safeCount.textContent = a.safe || 0
            warnCount.textContent = a.warn || 0
            blockedCount.textContent = a.blocked || 0
            summaryEl.style.display = 'grid'
            devicesEl.style.display = 'block'
            statusEl.style.display = 'none'
          }
        })
      }
    })
  })
})

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}
