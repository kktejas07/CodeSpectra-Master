/**
 * Face sign-in liveness challenge + descriptor checks. Pure — used by the
 * browser camera (components/auth/face-camera.tsx) and the server route
 * (app/api/auth/face-verify). Tested in tests/face-sign-in.test.ts.
 *
 * ponytail: the challenge runs in the browser, so a modified client can
 * claim it passed. It stops the casual "hold up a photo" attempt; the real
 * protection for a new device is the emailed code (lib/auth-trusted-device).
 */

export type LivenessChallenge = 'blink' | 'turn_left' | 'turn_right'
export const LIVENESS_CHALLENGES: readonly LivenessChallenge[] = ['blink', 'turn_left', 'turn_right']

export function pickLivenessChallenge(rand: () => number = Math.random): LivenessChallenge {
  const i = Math.min(LIVENESS_CHALLENGES.length - 1, Math.floor(rand() * LIVENESS_CHALLENGES.length))
  return LIVENESS_CHALLENGES[i]
}

export function livenessInstruction(c: LivenessChallenge): string {
  if (c === 'blink') return 'Blink slowly once.'
  if (c === 'turn_left') return 'Turn your head slowly to your left.'
  return 'Turn your head slowly to your right.'
}

type Pt = { x: number; y: number }
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** Eye aspect ratio from the 6 eye landmarks (68-point model). Open ≈ 0.25–0.35, closed < 0.2. */
export function eyeAspectRatio(eye: Pt[]): number {
  if (!eye || eye.length < 6) return 0
  const h = dist(eye[0], eye[3])
  if (h === 0) return 0
  return (dist(eye[1], eye[5]) + dist(eye[2], eye[4])) / (2 * h)
}

/**
 * Horizontal nose-tip position between the outer eye corners, 0..1 in
 * image coordinates (0.5 = facing the camera). The camera image is not
 * mirrored, so turning to the user's own left moves the nose to the image
 * right (value goes up).
 */
export function noseYaw(leftEye: Pt[], rightEye: Pt[], noseTip: Pt): number {
  const l = leftEye?.[0]
  const r = rightEye?.[3]
  if (!l || !r || !noseTip) return 0.5
  const w = r.x - l.x
  if (w === 0) return 0.5
  return (noseTip.x - l.x) / w
}

export interface LivenessSample {
  ear: number
  yaw: number
}

const CENTER_MIN = 0.36
const CENTER_MAX = 0.64
const TURN_LEFT_MIN = 0.7
const TURN_RIGHT_MAX = 0.3

/**
 * Feed landmark samples frame by frame; returns true once the challenge is
 * met. Blink: eyes seen open, then closed (below 70% of the open level),
 * then open again. Turn: face seen centred, then turned the asked way.
 */
export function createLivenessTracker(challenge: LivenessChallenge) {
  let frames = 0
  let openEar = 0
  let phase: 'start' | 'closed' | 'done' = 'start'
  let sawCentered = false
  return {
    get frames() {
      return frames
    },
    get met() {
      return phase === 'done'
    },
    push(s: LivenessSample): boolean {
      if (phase === 'done') return true
      if (!Number.isFinite(s.ear) || !Number.isFinite(s.yaw)) return false
      frames++
      if (challenge === 'blink') {
        if (phase === 'start') {
          if (s.ear > openEar) openEar = s.ear
          if (openEar >= 0.18 && frames >= 2 && s.ear < openEar * 0.7) phase = 'closed'
        } else if (phase === 'closed' && s.ear >= openEar * 0.85) {
          phase = 'done'
        }
        return phase === 'done'
      }
      if (s.yaw >= CENTER_MIN && s.yaw <= CENTER_MAX) sawCentered = true
      if (sawCentered && challenge === 'turn_left' && s.yaw >= TURN_LEFT_MIN) phase = 'done'
      if (sawCentered && challenge === 'turn_right' && s.yaw <= TURN_RIGHT_MAX) phase = 'done'
      return phase === 'done'
    },
  }
}

// ─── Server-side checks ─────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export function isDescriptor(v: unknown): v is number[] {
  return Array.isArray(v) && v.length === 128 && v.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 10)
}

/** Cosine similarity a frame must reach against the enrolled template (face-api 128-d). */
export const FACE_MATCH_THRESHOLD = 0.85

export interface LivenessClaim {
  challenge: LivenessChallenge
  descriptors: number[][]
}

/**
 * Validate the request body shape: a known challenge reported as met, and
 * 2–4 descriptors from different frames (byte-identical frames mean a
 * replayed vector, not a live camera).
 */
export function parseLivenessClaim(body: { liveness?: unknown; descriptors?: unknown }): LivenessClaim | null {
  const l = body.liveness as { challenge?: unknown; passed?: unknown } | undefined
  if (!l || typeof l !== 'object' || l.passed !== true) return null
  if (typeof l.challenge !== 'string' || !LIVENESS_CHALLENGES.includes(l.challenge as LivenessChallenge)) return null
  const ds = body.descriptors
  if (!Array.isArray(ds) || ds.length < 2 || ds.length > 4 || !ds.every(isDescriptor)) return null
  for (let i = 0; i < ds.length; i++) {
    for (let j = i + 1; j < ds.length; j++) {
      if (ds[i].every((x: number, k: number) => x === ds[j][k])) return null
    }
  }
  return { challenge: l.challenge as LivenessChallenge, descriptors: ds as number[][] }
}

/** Every frame must match the template. Returns the weakest score. */
export function matchAllFrames(descriptors: number[][], template: number[], threshold = FACE_MATCH_THRESHOLD): { ok: boolean; score: number } {
  if (!descriptors.length || !isDescriptor(template)) return { ok: false, score: 0 }
  const score = Math.min(...descriptors.map((d) => cosineSimilarity(d, template)))
  return { ok: score >= threshold, score }
}
