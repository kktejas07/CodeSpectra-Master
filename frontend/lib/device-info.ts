export interface DeviceInfo {
  userAgent: string
  platform: string
  language: string
  timezone: string
  screen: string
  cores: number
  memory: string
}

export function getDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined') {
    return { userAgent: '', platform: '', language: '', timezone: '', screen: '', cores: 0, memory: '' }
  }
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform || '',
    language: navigator.language || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    screen: `${window.screen.width}x${window.screen.height}`,
    cores: navigator.hardwareConcurrency || 0,
    memory: (navigator as any).deviceMemory ? `${(navigator as any).deviceMemory}GB` : '',
  }
}

export function getBrowserInfo(): { browser: string; os: string; device: string } {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  let browser = 'Unknown'
  let os = 'Unknown'
  let device = 'desktop'

  if (/Tablet|iPad/i.test(ua)) device = 'tablet'
  else if (/Mobile|Android|iPhone|iPod/i.test(ua)) device = 'mobile'

  if (/Edg\//i.test(ua)) {
    const m = ua.match(/Edg\/([\d.]+)/)
    browser = m ? `Edge ${m[1]}` : 'Edge'
  } else if (/Chrome\/|CriOS\//i.test(ua)) {
    const m = ua.match(/(?:Chrome|CriOS)\/([\d.]+)/)
    browser = m ? `Chrome ${m[1]}` : 'Chrome'
  } else if (/Firefox\//i.test(ua)) {
    const m = ua.match(/Firefox\/([\d.]+)/)
    browser = m ? `Firefox ${m[1]}` : 'Firefox'
  } else if (/Safari\//i.test(ua)) {
    const m = ua.match(/Version\/([\d.]+)/)
    browser = m ? `Safari ${m[1]}` : 'Safari'
  }

  if (/Windows NT/i.test(ua)) {
    const m = ua.match(/Windows NT ([\d.]+)/)
    os = m ? `Windows ${m[1]}` : 'Windows'
  } else if (/Mac OS X/i.test(ua)) {
    const m = ua.match(/Mac OS X ([\d_]+)/)
    os = m ? `macOS ${m[1].replace(/_/g, '.')}` : 'macOS'
  } else if (/Linux/i.test(ua) && !/Android/i.test(ua)) os = 'Linux'
  else if (/Android/i.test(ua)) {
    const m = ua.match(/Android ([\d.]+)/)
    os = m ? `Android ${m[1]}` : 'Android'
  } else if (/CrOS/i.test(ua)) os = 'ChromeOS'

  return { browser, os, device }
}
