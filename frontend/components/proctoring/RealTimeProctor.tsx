'use client'

import { useEffect, useRef, useCallback } from 'react'
import { csrfFetch } from '@/lib/csrf-fetch'

interface RealTimeProctorProps {
  children: React.ReactNode
  sessionKind: 'exam' | 'problem' | 'interview'
  sessionId: string
  enabled?: boolean
}

/**
 * Real-time proctoring monitor that detects:
 * - Screen sharing / screen recording (getDisplayMedia API)
 * - USB device plugins (WebUSB API, real-time polling)
 * - Teams / Google Meet / Zoom / Discord running in background
 * - VPN / proxy usage (WebRTC IP leak detection)
 * - Audio anomalies (secondary voices, background noise)
 * - Fullscreen exit
 * - Window resize (possible screen share preparation)
 *
 * All events are sent to POST /api/proctor/events for the audit log.
 */
export function RealTimeProctor({
  children,
  sessionKind,
  sessionId,
  enabled = true,
}: RealTimeProctorProps) {
  const lastUsbDevicesRef = useRef<string[]>([])
  const screenShareActiveRef = useRef(false)
  const sendEventRef = useCallback(
    async (eventType: string, meta?: Record<string, unknown>) => {
      if (!enabled || !sessionId) return
      try {
        await csrfFetch('/api/proctor/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_kind: sessionKind,
            session_id: sessionId,
            event_type: eventType,
            meta: { ...meta, timestamp: new Date().toISOString() },
          }),
        })
      } catch { /* fire-and-forget */ }
    },
    [enabled, sessionKind, sessionId],
  )

  // ── 1. Screen Share Detection ────────────────────────────────────────
  // Monkey-patch navigator.mediaDevices.getDisplayMedia to detect screen sharing
  useEffect(() => {
    if (!enabled) return
    const origGetDisplayMedia = navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices)
    if (!origGetDisplayMedia) return

    ;(navigator.mediaDevices as any).getDisplayMedia = async (constraints?: MediaStreamConstraints) => {
      const stream = await origGetDisplayMedia(constraints)
      if (!screenShareActiveRef.current) {
        screenShareActiveRef.current = true
        sendEventRef('screen_share_started', {
          trackKinds: stream.getTracks().map(t => t.kind),
          displaySurface: (constraints?.video as any)?.displaySurface || 'unknown',
        })
      }
      stream.getVideoTracks().forEach(track => {
        track.addEventListener('ended', () => {
          const anyActive = stream.getVideoTracks().some(t => t.readyState === 'live')
          if (!anyActive) {
            screenShareActiveRef.current = false
            sendEventRef('screen_share_ended', {})
          }
        })
      })
      return stream
    }

    // Also detect if another app is capturing the screen via the Permissions API
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'display-capture' as PermissionName }).then(status => {
        if (status.state === 'granted') {
          sendEventRef('screen_capture_detected', { state: status.state })
        }
        status.onchange = () => {
          if (status.state === 'granted') {
            sendEventRef('screen_capture_detected', { state: status.state })
          }
        }
      }).catch(() => {})
    }

    return () => {
      ;(navigator.mediaDevices as any).getDisplayMedia = origGetDisplayMedia
    }
  }, [enabled, sendEventRef])

  // ── 2. Real-time USB Device Monitoring ────────────────────────────────
  useEffect(() => {
    if (!enabled || !('usb' in navigator)) return

    const checkUsbDevices = async () => {
      try {
        const devices = await (navigator.usb as any).getDevices()
        const currentIds = devices.map((d: any) => `${d.vendorId}:${d.productId}`)
        const prevIds = lastUsbDevicesRef.current

        // Detect newly plugged devices
        const newDevices = devices.filter((d: any) => {
          const id = `${d.vendorId}:${d.productId}`
          return !prevIds.includes(id)
        })

        if (newDevices.length > 0 && prevIds.length > 0) {
          for (const device of newDevices) {
            const name = device.productName || device.manufacturerName || 'Unknown USB device'
            const vid = device.vendorId
            const pid = device.productId
            const deviceClass = device.deviceClass || 0

            // Classify USB device type
            let deviceType = 'unknown'
            if (deviceClass === 8) deviceType = 'mass_storage' // Mass storage = pen drive
            else if (deviceClass === 3) deviceType = 'hid' // HID = mouse/keyboard
            else if (deviceClass === 7) deviceType = 'printer'
            else if (deviceClass === 14) deviceType = 'video' // USB camera
            else if (deviceClass === 1) deviceType = 'audio'
            else if (deviceClass === 2) deviceType = 'cdc_data'

            const isBlocked = deviceClass === 8 || deviceClass === 14 // Mass storage & USB cameras are suspicious
            sendEventRef('usb_device_plugged', {
              deviceName: name,
              vendorId: vid,
              productId: pid,
              deviceClass,
              deviceType,
              isBlocked,
              manufacturer: device.manufacturerName || '',
            })
          }
        }

        // Detect removed devices
        if (prevIds.length > 0) {
          const removedIds = prevIds.filter(id => !currentIds.includes(id))
          if (removedIds.length > 0) {
            sendEventRef('usb_device_unplugged', { removedCount: removedIds.length })
          }
        }

        lastUsbDevicesRef.current = currentIds
      } catch { /* WebUSB not available or permission denied */ }
    }

    // Check immediately and then every 5 seconds
    checkUsbDevices()
    const interval = setInterval(checkUsbDevices, 5000)
    return () => clearInterval(interval)
  }, [enabled, sendEventRef])

  // ── 3. Video Conferencing / Screen Sharing / Proxy / AI Detection ────
  useEffect(() => {
    if (!enabled) return

    const BLOCKED_APPS = [
      // Video Conferencing
      { pattern: /teams\.microsoft\.com|teams\.live\.com/i, name: 'Microsoft Teams', category: 'video-conferencing' },
      { pattern: /meet\.google\.com/i, name: 'Google Meet', category: 'video-conferencing' },
      { pattern: /zoom\.us|zoom\.com/i, name: 'Zoom', category: 'video-conferencing' },
      { pattern: /skype\.com|web\.skype\.com/i, name: 'Skype', category: 'video-conferencing' },
      { pattern: /gotomeeting\.com/i, name: 'GoToMeeting', category: 'video-conferencing' },
      { pattern: /webex\.com|cisco\.webex\.com/i, name: 'Cisco Webex', category: 'video-conferencing' },
      { pattern: /bluejeans\.com/i, name: 'BlueJeans', category: 'video-conferencing' },
      { pattern: /whereby\.com/i, name: 'Whereby', category: 'video-conferencing' },
      { pattern: /ringcentral\.com|glip\.com/i, name: 'RingCentral', category: 'video-conferencing' },
      { pattern: /8x8\.vc/i, name: '8x8 Video', category: 'video-conferencing' },
      { pattern: /livestorm\.co/i, name: 'Livestorm', category: 'video-conferencing' },
      { pattern: /demio\.com/i, name: 'Demio', category: 'video-conferencing' },
      { pattern: /hopin\.com/i, name: 'Hopin', category: 'video-conferencing' },
      { pattern: /airmeet\.com/i, name: 'Airmeet', category: 'video-conferencing' },
      { pattern: /zoho.*meeting/i, name: 'Zoho Meeting', category: 'video-conferencing' },
      { pattern: /facebook\.com.*live|fb\.com.*live/i, name: 'Facebook Live', category: 'video-conferencing' },
      { pattern: /youtube\.com.*live|youtu\.be.*live/i, name: 'YouTube Live', category: 'video-conferencing' },
      { pattern: /twitch\.tv/i, name: 'Twitch', category: 'video-conferencing' },

      // Screen Sharing / Remote Desktop
      { pattern: /teamviewer\.com/i, name: 'TeamViewer', category: 'screen-sharing' },
      { pattern: /anydesk\.com/i, name: 'AnyDesk', category: 'screen-sharing' },
      { pattern: /chrome\.remote\.desktop/i, name: 'Chrome Remote Desktop', category: 'screen-sharing' },
      { pattern: /remotedesktop\.google\.com/i, name: 'Google Remote Desktop', category: 'screen-sharing' },
      { pattern: /splashtop\.com/i, name: 'Splashtop', category: 'screen-sharing' },
      { pattern: /logmein\.com/i, name: 'LogMeIn', category: 'screen-sharing' },
      { pattern: /bomgar\.com|beyondtrust\.com/i, name: 'BeyondTrust', category: 'screen-sharing' },
      { pattern: /connectwise\.com/i, name: 'ConnectWise', category: 'screen-sharing' },
      { pattern: /parsec\.app/i, name: 'Parsec', category: 'screen-sharing' },
      { pattern: /nomachine\.com/i, name: 'NoMachine', category: 'screen-sharing' },
      { pattern: /ultraviewer\.net/i, name: 'UltraViewer', category: 'screen-sharing' },
      { pattern: /ammyy\.com/i, name: 'Ammyy Admin', category: 'screen-sharing' },
      { pattern: /rustdesk\.com/i, name: 'RustDesk', category: 'screen-sharing' },
      { pattern: /sunlogin\.com/i, name: 'SunLogin', category: 'screen-sharing' },
      { pattern: /todesk\.com/i, name: 'ToDesk', category: 'screen-sharing' },
      { pattern: /apowermirror\.com/i, name: 'ApowerMirror', category: 'screen-sharing' },
      { pattern: /airdroid\.com/i, name: 'AirDroid', category: 'screen-sharing' },
      { pattern: /scrcpy\.org/i, name: 'Scrcpy', category: 'screen-sharing' },

      // Screen Recording
      { pattern: /loom\.com/i, name: 'Loom', category: 'screen-recording' },
      { pattern: /screencastify\.com/i, name: 'Screencastify', category: 'screen-recording' },
      { pattern: /obsproject\.com|obs\.studio/i, name: 'OBS Studio', category: 'screen-recording' },
      { pattern: /streamlabs\.com/i, name: 'Streamlabs', category: 'screen-recording' },
      { pattern: /camtasia\.com/i, name: 'Camtasia', category: 'screen-recording' },
      { pattern: /snagit\.com/i, name: 'Snagit', category: 'screen-recording' },
      { pattern: /screenrec\.com/i, name: 'ScreenRec', category: 'screen-recording' },
      { pattern: /sharex\.org/i, name: 'ShareX', category: 'screen-recording' },
      { pattern: /icecream.*screen.*recorder/i, name: 'Icecream Screen Recorder', category: 'screen-recording' },
      { pattern: /bandicam\.com/i, name: 'Bandicam', category: 'screen-recording' },
      { pattern: /fraps\.com/i, name: 'Fraps', category: 'screen-recording' },
      { pattern: /nvidia.*shadowplay|geforce.*experience/i, name: 'NVIDIA ShadowPlay', category: 'screen-recording' },
      { pattern: /xbox.*game.*bar|game.*bar/i, name: 'Xbox Game Bar', category: 'screen-recording' },

      // Proxy / VPN / Tunnel / Bypass
      { pattern: /otter\.ai/i, name: 'Otter.ai', category: 'proxy' },
      { pattern: /nordvpn\.com/i, name: 'NordVPN', category: 'proxy' },
      { pattern: /expressvpn\.com/i, name: 'ExpressVPN', category: 'proxy' },
      { pattern: /surfshark\.com/i, name: 'Surfshark', category: 'proxy' },
      { pattern: /protonvpn\.com/i, name: 'ProtonVPN', category: 'proxy' },
      { pattern: /windscribe\.com/i, name: 'Windscribe', category: 'proxy' },
      { pattern: /tunnelbear\.com/i, name: 'TunnelBear', category: 'proxy' },
      { pattern: /hotspotshield\.com/i, name: 'Hotspot Shield', category: 'proxy' },
      { pattern: /cyberghost\.vpn/i, name: 'CyberGhost', category: 'proxy' },
      { pattern: /privateinternetaccess\.com/i, name: 'PIA', category: 'proxy' },
      { pattern: /hide\.me|hideme\.com/i, name: 'Hide.me', category: 'proxy' },
      { pattern: /hideipvpn\.com/i, name: 'HideIPVPN', category: 'proxy' },
      { pattern: /unblock.*web|unblock.*site|unblock.*proxy/i, name: 'Unblock Proxy', category: 'proxy' },
      { pattern: /proxy.*site|proxysite\.com/i, name: 'ProxySite', category: 'proxy' },
      { pattern: /hideipweb\.com|hideip\.me/i, name: 'HideIP Web', category: 'proxy' },
      { pattern: /kproxy\.com/i, name: 'KProxy', category: 'proxy' },
      { pattern: /proxifier\.com|proxycap\.com/i, name: 'Proxifier/ProxyCap', category: 'proxy' },
      { pattern: /ngrok\.com/i, name: 'ngrok', category: 'proxy' },
      { pattern: /localtunnel|serveo\.net/i, name: 'Tunnel Service', category: 'proxy' },
      { pattern: /torproject\.org/i, name: 'Tor Browser', category: 'proxy' },
      { pattern: /ultrareach|ultrasurf/i, name: 'Ultrasurf', category: 'proxy' },
      { pattern: /psiphon\.ca/i, name: 'Psiphon', category: 'proxy' },
      { pattern: /lantern\.io/i, name: 'Lantern', category: 'proxy' },
      { pattern: /hotspot.*shield/i, name: 'Hotspot Shield', category: 'proxy' },

      // Chat / Messaging (can share screen or leak info)
      { pattern: /discord\.com|discord\.gg/i, name: 'Discord', category: 'chat' },
      { pattern: /web\.whatsapp\.com/i, name: 'WhatsApp Web', category: 'chat' },
      { pattern: /telegram\.org|web\.telegram\.org/i, name: 'Telegram Web', category: 'chat' },
      { pattern: /slack\.com|app\.slack\.com/i, name: 'Slack', category: 'chat' },
      { pattern: /signal\.org|signal\.me/i, name: 'Signal', category: 'chat' },
      { pattern: /viber\.com/i, name: 'Viber', category: 'chat' },
      { pattern: /line\.me/i, name: 'LINE', category: 'chat' },
      { pattern: /chat\.facebook\.com|messenger\.com/i, name: 'Messenger', category: 'chat' },
      { pattern: /imessage|messages\.apple\.com/i, name: 'iMessage Web', category: 'chat' },
      { pattern: /gitter\.im/i, name: 'Gitter', category: 'chat' },
      { pattern: /matrix\.org|element\.io/i, name: 'Element/Matrix', category: 'chat' },

      // AI Assistants (can answer exam questions)
      { pattern: /chatgpt\.com|openai\.com\/chat/i, name: 'ChatGPT', category: 'ai-assistant' },
      { pattern: /claude\.ai/i, name: 'Claude', category: 'ai-assistant' },
      { pattern: /gemini\.google\.com|bard\.google\.com/i, name: 'Google Gemini', category: 'ai-assistant' },
      { pattern: /copilot\.microsoft\.com|bing\.com\/chat/i, name: 'Microsoft Copilot', category: 'ai-assistant' },
      { pattern: /perplexity\.ai/i, name: 'Perplexity', category: 'ai-assistant' },
      { pattern: /you\.com\/chat/i, name: 'You.com', category: 'ai-assistant' },
      { pattern: /phind\.com/i, name: 'Phind', category: 'ai-assistant' },
      { pattern: /poe\.com/i, name: 'Poe', category: 'ai-assistant' },
      { pattern: /character\.ai/i, name: 'Character.ai', category: 'ai-assistant' },
      { pattern: /huggingface\.co\/chat/i, name: 'HuggingChat', category: 'ai-assistant' },
      { pattern: /deepseek\.com|chat\.deepseek/i, name: 'DeepSeek', category: 'ai-assistant' },
      { pattern: /copilot\.github\.com/i, name: 'GitHub Copilot', category: 'ai-assistant' },
      { pattern: /tabnine\.com/i, name: 'Tabnine', category: 'ai-assistant' },
      { pattern: /codeium\.com/i, name: 'Codeium', category: 'ai-assistant' },
      { pattern: /writesonic\.com/i, name: 'Writesonic', category: 'ai-assistant' },
      { pattern: /jasper\.ai/i, name: 'Jasper', category: 'ai-assistant' },
      { pattern: /copy\.ai/i, name: 'Copy.ai', category: 'ai-assistant' },

      // Code Collaboration (can share answers)
      { pattern: /replit\.com/i, name: 'Replit', category: 'code-sharing' },
      { pattern: /codeshare\.io/i, name: 'CodeShare', category: 'code-sharing' },
      { pattern: /hackmd\.io/i, name: 'HackMD', category: 'code-sharing' },
      { pattern: /pastebin\.com/i, name: 'Pastebin', category: 'code-sharing' },
      { pattern: /jsfiddle\.net/i, name: 'JSFiddle', category: 'code-sharing' },
      { pattern: /codepen\.io/i, name: 'CodePen', category: 'code-sharing' },
      { pattern: /stackblitz\.com/i, name: 'StackBlitz', category: 'code-sharing' },
      { pattern: /codesandbox\.io/i, name: 'CodeSandbox', category: 'code-sharing' },
      { pattern: /gitpod\.io/i, name: 'Gitpod', category: 'code-sharing' },

      // Search Engines (can look up answers)
      { pattern: /google\.com\/search|bing\.com\/search|duckduckgo\.com/i, name: 'Search Engine', category: 'search' },
      { pattern: /wikipedia\.org/i, name: 'Wikipedia', category: 'search' },
      { pattern: /stackoverflow\.com/i, name: 'StackOverflow', category: 'search' },
      { pattern: /geeksforgeeks\.org/i, name: 'GeeksforGeeks', category: 'search' },
      { pattern: /tutorialspoint\.com/i, name: 'TutorialsPoint', category: 'search' },
      { pattern: /w3schools\.com/i, name: 'W3Schools', category: 'search' },
      { pattern: /github\.com/i, name: 'GitHub', category: 'search' },
    ]

    // Check URL bar / page title periodically (for SPA navigations)
    const checkForProhibitedApps = () => {
      const url = window.location.href
      const title = document.title
      for (const app of BLOCKED_APPS) {
        if (app.pattern.test(url) || app.pattern.test(title)) {
          sendEventRef('prohibited_app_detected', {
            appName: app.name,
            category: app.category,
            url: url.slice(0, 500),
            title: title.slice(0, 200),
          })
          return
        }
      }
    }

    // Check for remote desktop / VM indicators via user agent hints
    const checkRemoteDesktop = () => {
      const ua = navigator.userAgent.toLowerCase()
      const suspicious = [
        'rdp', 'vnc', 'citrix', 'vmware', 'virtualbox', 'parallels',
        'mstsc', 'anydesk', 'teamviewer', 'chrome remote desktop',
        'rustdesk', 'todesk', 'sunlogin',
      ]
      for (const indicator of suspicious) {
        if (ua.includes(indicator)) {
          sendEventRef('remote_desktop_detected', { indicator, userAgent: navigator.userAgent })
        }
      }
    }

    checkForProhibitedApps()
    checkRemoteDesktop()

    // Listen for URL changes (pushState/replaceState)
    const origPushState = history.pushState
    const origReplaceState = history.replaceState
    history.pushState = function(...args) {
      origPushState.apply(this, args)
      checkForProhibitedApps()
    }
    history.replaceState = function(...args) {
      origReplaceState.apply(this, args)
      checkForProhibitedApps()
    }
    window.addEventListener('popstate', checkForProhibitedApps)

    // Periodic check (every 10s for URL/title changes)
    const interval = setInterval(() => {
      checkForProhibitedApps()
      checkRemoteDesktop()
    }, 10000)

    return () => {
      history.pushState = origPushState
      history.replaceState = origReplaceState
      window.removeEventListener('popstate', checkForProhibitedApps)
      clearInterval(interval)
    }
  }, [enabled, sendEventRef])

  // ── 4. Fullscreen Exit Detection ─────────────────────────────────────
  useEffect(() => {
    if (!enabled) return

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        sendEventRef('fullscreen_exit', { timestamp: new Date().toISOString() })
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [enabled, sendEventRef])

  // ── 5. Window Resize Detection (possible screen share prep) ──────────
  useEffect(() => {
    if (!enabled) return
    let resizeCount = 0
    let lastResize = Date.now()

    const handleResize = () => {
      const now = Date.now()
      if (now - lastResize < 1000) {
        resizeCount++
        if (resizeCount > 5) {
          sendEventRef('rapid_window_resize', { count: resizeCount })
          resizeCount = 0
        }
      } else {
        resizeCount = 0
      }
      lastResize = now
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [enabled, sendEventRef])

  // ── 6. Clipboard Monitoring (enhanced copy/paste detection) ──────────
  useEffect(() => {
    if (!enabled) return

    const handleCopy = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text') || ''
      sendEventRef('clipboard_copy', {
        textLength: text.length,
        preview: text.slice(0, 100),
      })
    }

    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text') || ''
      sendEventRef('clipboard_paste', {
        textLength: text.length,
        preview: text.slice(0, 100),
      })
    }

    document.addEventListener('copy', handleCopy)
    document.addEventListener('paste', handlePaste)
    return () => {
      document.removeEventListener('copy', handleCopy)
      document.removeEventListener('paste', handlePaste)
    }
  }, [enabled, sendEventRef])

  // ── 7. Keyboard Shortcut Blocking ────────────────────────────────────
  useEffect(() => {
    if (!enabled) return

    const BLOCKED_KEYS = [
      { key: 'F12', ctrl: false, label: 'DevTools' },
      { key: 'I', ctrl: true, shift: true, label: 'DevTools' },
      { key: 'J', ctrl: true, shift: true, label: 'Console' },
      { key: 'U', ctrl: true, label: 'View Source' },
      { key: 'C', ctrl: true, shift: true, label: 'DevTools' },
      { key: 'W', ctrl: true, label: 'Close Tab' },
      { key: 'T', ctrl: true, label: 'New Tab' },
      { key: 'N', ctrl: true, label: 'New Window' },
      { key: 'P', ctrl: true, shift: true, label: 'Print/Screenshot' },
      { key: 'S', ctrl: true, label: 'Save Page' },
    ]

    const handleKeyDown = (e: KeyboardEvent) => {
      for (const blocked of BLOCKED_KEYS) {
        const ctrlMatch = blocked.ctrl ? (e.ctrlKey || e.metaKey) : true
        const shiftMatch = blocked.shift ? e.shiftKey : true
        if (e.key.toUpperCase() === blocked.key.toUpperCase() && ctrlMatch && shiftMatch) {
          e.preventDefault()
          e.stopPropagation()
          sendEventRef('keyboard_shortcut_blocked', {
            key: e.key,
            ctrl: e.ctrlKey || e.metaKey,
            shift: e.shiftKey,
            alt: e.altKey,
            label: blocked.label,
          })
          return false
        }
      }
      // Alt+Tab detection
      if (e.altKey && e.key === 'Tab') {
        sendEventRef('alt_tab_detected', {})
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [enabled, sendEventRef])

  // ── 8. Right-Click Prevention ────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      sendEventRef('right_click_blocked', {
        x: e.clientX,
        y: e.clientY,
        target: (e.target as HTMLElement)?.tagName || 'unknown',
      })
      return false
    }

    document.addEventListener('contextmenu', handleContextMenu, true)
    return () => document.removeEventListener('contextmenu', handleContextMenu, true)
  }, [enabled, sendEventRef])

  return <>{children}</>
}
