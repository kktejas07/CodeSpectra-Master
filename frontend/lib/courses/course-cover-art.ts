/**
 * Per-course cover ART (not the typographic poster).
 *
 * The catalog's shipped artwork is rich 3D illustration, so a flat gradient
 * poster reads as broken next to it. Every paid image key is unusable today
 * (fal/Stability/Replicate/OpenAI → 401, OpenRouter → 402 low balance, Novita
 * and ModelScope image endpoints reject the key), so art is generated through
 * the keyless pollinations endpoint, cropped to 16:9 and stored in Mongo. The
 * bytes are generated once per course and served by /api/courses/[id]/cover
 * with an immutable cache, so nothing depends on the generator at runtime.
 *
 * Swap `generateArt()` for a paid provider when a key is funded — the storage,
 * route and caching stay the same.
 */
import sharp from 'sharp'
import { getMongoDb } from '@/lib/mongodb'

export const ART_W = 1200
export const ART_H = 675
const COLLECTION = 'course_covers'

/** Watermark strip at the bottom of the generated image. */
const WATERMARK_CROP = 40

const STYLE =
  'Bright, colourful 3D cartoon illustration for an online course cover, wide 16:9 composition. ' +
  'Glowing blue and violet gradient background with floating holographic UI panels, sparkles and soft light rays. ' +
  'A cute fluffy mascot character in the centre with big friendly eyes, holding a glowing holographic emblem. ' +
  'Cinematic 3D render, soft rim light, high detail, clean uncluttered background. ' +
  'No text, no letters, no numbers, no logos, no watermark.'

/** Subject → the props the illustration should show. */
const THEMES: Array<{ re: RegExp; theme: string }> = [
  { re: /mechanical/i, theme: 'cogwheels, pistons, gears, engineering blueprints and a robot arm' },
  { re: /electrical|electronics/i, theme: 'a glowing circuit board, resistors, capacitors, an oscilloscope and a lightning bolt' },
  { re: /civil/i, theme: 'bridge beams, structural blueprints, a hard hat and a small crane' },
  { re: /chemical/i, theme: 'glass laboratory flasks, molecules, pipes and a distillation column' },
  { re: /\bc\b|c programming|pointers/i, theme: 'floating memory blocks, pointers as arrows, a terminal and a compiler gear' },
  { re: /c\+\+|cpp/i, theme: 'floating C++ brackets, template blocks, a terminal and geometric data structures' },
  { re: /java/i, theme: 'a floating coffee cup logo shape, class blocks and a JVM engine' },
  { re: /python/i, theme: 'a friendly snake shape, data charts and machine-learning nodes' },
  { re: /javascript|typescript|react|next\.js|frontend/i, theme: 'browser windows, component blocks, code brackets and a lightning bolt' },
  { re: /node|backend/i, theme: 'server racks, API arrows, event loops and package boxes' },
  { re: /sql|postgres|mongo|database|data engineer/i, theme: 'glowing database cylinders, table grids, query arrows and data pipelines' },
  { re: /machine learning|\bai\b|artificial/i, theme: 'neural network nodes, a glowing brain, data charts and floating tensors' },
  { re: /devops|docker|kubernetes|cloud|aws|azure|gcp|terraform/i, theme: 'cloud shapes, container cubes, a pipeline and gears' },
  { re: /security|cyber|privacy|hipaa/i, theme: 'a glowing shield, lock, fingerprint scan and network nodes' },
  { re: /git/i, theme: 'branching commit graphs, a globe and code cards' },
  { re: /math|algorithm|data structure|dsa/i, theme: 'floating nodes, graphs, trees and sorting blocks' },
]

export function artTheme(course: { title?: string; category?: string; tags?: string[]; techStack?: string }): string {
  const hay = [course.title, course.category, ...(course.tags || []), course.techStack].filter(Boolean).join(' ')
  for (const t of THEMES) if (t.re.test(hay)) return t.theme
  return `${course.category || 'technology'} tools, abstract technical diagrams and floating panels`
}

export function buildArtPrompt(course: { title?: string; category?: string; tags?: string[]; techStack?: string }): string {
  return `${STYLE} Theme: ${artTheme(course)}.`
}

/** Stable seed so a retry produces the same picture. */
function seedFor(courseId: string): number {
  let h = 0
  for (const ch of courseId) h = (h * 31 + ch.charCodeAt(0)) % 100000
  return h
}

/** Keyless generation with backoff — the endpoint answers 402/429 in bursts. */
export async function generateArt(prompt: string, seed: number, attempts = 5): Promise<Buffer> {
  let lastErr = 'no attempt made'
  for (let i = 0; i < attempts; i++) {
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
      `?width=1216&height=684&nologo=true&model=flux&seed=${seed}`
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120_000) })
      const type = r.headers.get('content-type') || ''
      if (r.ok && type.startsWith('image')) return Buffer.from(await r.arrayBuffer())
      lastErr = `HTTP ${r.status} ${(await r.text()).slice(0, 120)}`
    } catch (e) {
      lastErr = (e as Error).message
    }
    await new Promise((res) => setTimeout(res, 4000 * (i + 1)))
  }
  throw new Error(`art generation failed: ${lastErr}`)
}

/** Crop the watermark strip and normalise to the catalog's 1200×675. */
export async function normaliseArt(bytes: Buffer): Promise<Buffer> {
  const meta = await sharp(bytes).metadata()
  const h = meta.height || 684
  const cropH = Math.max(100, h - WATERMARK_CROP)
  return sharp(bytes)
    .extract({ left: 0, top: 0, width: meta.width || 1216, height: cropH })
    .resize(ART_W, ART_H, { fit: 'cover' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
}

export async function saveCourseArt(courseId: string, bytes: Buffer, meta: { prompt: string; seed: number }): Promise<void> {
  const db = await getMongoDb()
  await db.collection(COLLECTION).updateOne(
    { courseId },
    { $set: { courseId, bytes, mime: 'image/jpeg', prompt: meta.prompt, seed: meta.seed, updatedAt: new Date().toISOString() } },
    { upsert: true },
  )
}

export async function hasCourseArt(courseId: string): Promise<boolean> {
  const db = await getMongoDb()
  return Boolean(await db.collection(COLLECTION).findOne({ courseId }, { projection: { _id: 1 } }))
}

export async function readCourseArt(courseId: string): Promise<{ bytes: Buffer; updatedAt?: string } | null> {
  const db = await getMongoDb()
  const doc = await db.collection(COLLECTION).findOne({ courseId })
  if (!doc?.bytes) return null
  // The driver hands back a BSON Binary in some paths; normalise to a Buffer.
  const raw = doc.bytes as unknown
  let bytes: Buffer
  if (Buffer.isBuffer(raw)) bytes = raw
  else if (raw instanceof Uint8Array) bytes = Buffer.from(raw)
  else bytes = Buffer.from((raw as { buffer: ArrayBuffer }).buffer)
  return { bytes, updatedAt: doc.updatedAt ? String(doc.updatedAt) : undefined }
}

export async function deleteCourseArt(courseId: string): Promise<void> {
  const db = await getMongoDb()
  await db.collection(COLLECTION).deleteOne({ courseId })
}

export { seedFor }
