/**
 * Keyboard dynamics tracking — captures typing rhythm, speed, and patterns.
 * Detects bot/automation vs human typing.
 */

export interface KeystrokeEvent {
  key: string
  timestamp: number
  dwellTime: number    // ms key was held down
  flightTime: number   // ms between this key and previous key
}

export interface KeyboardDynamics {
  avgFlightTime: number
  avgDwellTime: number
  typingSpeed: number     // chars per minute
  rhythmVariance: number  // how irregular the typing is (0=uniform, 1=varied)
  totalKeystrokes: number
  backspaceRatio: number
  isSuspicious: boolean   // likely bot if true
}

const BOT_FLIGHT_THRESHOLD = 50    // < 50ms between keys = likely bot
const BOT_DWELL_THRESHOLD = 20     // < 20ms key hold = likely bot
const HUMAN_RHYTHM_MIN = 0.3       // humans have rhythm variance > 0.3

export class KeyboardDynamicsTracker {
  private events: KeystrokeEvent[] = []
  private lastKeyTime = 0
  private lastKeyDown = 0
  private backspaceCount = 0

  onKeyDown(key: string) {
    const now = performance.now()
    this.lastKeyDown = now
    if (key === 'Backspace') this.backspaceCount++
  }

  onKeyUp(key: string) {
    const now = performance.now()
    const dwellTime = now - this.lastKeyDown
    const flightTime = this.lastKeyTime > 0 ? now - this.lastKeyTime : 0
    this.lastKeyTime = now

    this.events.push({ key, timestamp: now, dwellTime, flightTime })
  }

  getDynamics(): KeyboardDynamics {
    if (this.events.length < 5) {
      return {
        avgFlightTime: 0, avgDwellTime: 0, typingSpeed: 0,
        rhythmVariance: 0, totalKeystrokes: this.events.length,
        backspaceRatio: 0, isSuspicious: false,
      }
    }

    const flightTimes = this.events.slice(1).map(e => e.flightTime)
    const dwellTimes = this.events.map(e => e.dwellTime)

    const avgFlight = flightTimes.reduce((a, b) => a + b, 0) / flightTimes.length
    const avgDwell = dwellTimes.reduce((a, b) => a + b, 0) / dwellTimes.length

    // Typing speed (chars per minute)
    const timeSpanMs = this.events[this.events.length - 1].timestamp - this.events[0].timestamp
    const typingSpeed = timeSpanMs > 0 ? (this.events.length / (timeSpanMs / 60000)) : 0

    // Rhythm variance (coefficient of variation of flight times)
    const variance = flightTimes.reduce((a, b) => a + (b - avgFlight) ** 2, 0) / flightTimes.length
    const rhythmVariance = avgFlight > 0 ? Math.sqrt(variance) / avgFlight : 0

    const backspaceRatio = this.events.length > 0 ? this.backspaceCount / this.events.length : 0

    // Bot detection: very fast, very uniform, very low dwell
    const isSuspicious = avgFlight < BOT_FLIGHT_THRESHOLD && avgDwell < BOT_DWELL_THRESHOLD && rhythmVariance < 0.15

    return {
      avgFlightTime: Math.round(avgFlight),
      avgDwellTime: Math.round(avgDwell),
      typingSpeed: Math.round(typingSpeed),
      rhythmVariance: Math.round(rhythmVariance * 100) / 100,
      totalKeystrokes: this.events.length,
      backspaceRatio: Math.round(backspaceRatio * 100) / 100,
      isSuspicious,
    }
  }

  reset() {
    this.events = []
    this.lastKeyTime = 0
    this.lastKeyDown = 0
    this.backspaceCount = 0
  }
}
