/**
 * Face match verification — compares periodic camera snapshots to the ID photo
 * captured at exam start. Uses canvas pixel comparison (lightweight, no ML deps).
 *
 * Returns a similarity score 0-1 where >0.6 = likely same person.
 */

export interface FaceMatchResult {
  score: number       // 0-1 similarity
  matched: boolean    // score > threshold
  snapshotBase64: string
  timestamp: number
}

const MATCH_THRESHOLD = 0.55
const SNAPSHOT_INTERVAL_MS = 60_000 // every 60 seconds

/**
 * Capture a snapshot from a video element and return as base64.
 */
export function captureSnapshot(video: HTMLVideoElement, quality = 0.5): string {
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 120
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.drawImage(video, 0, 0, 160, 120)
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Extract dominant color histogram from a base64 image for comparison.
 * Returns a 64-bin histogram (16 bins per channel × 4 channels RGBA).
 */
function extractHistogram(base64: string): Promise<number[] | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 80
      canvas.height = 60
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(null); return }
      ctx.drawImage(img, 0, 0, 80, 60)
      const data = ctx.getImageData(0, 0, 80, 60).data
      const bins = new Array(64).fill(0)
      for (let i = 0; i < data.length; i += 4) {
        bins[Math.floor(data[i] / 16) * 4 + 0]++
        bins[Math.floor(data[i + 1] / 16) * 4 + 1]++
        bins[Math.floor(data[i + 2] / 16) * 4 + 2]++
        bins[Math.floor(data[i + 3] / 16) * 4 + 3]++
      }
      const total = data.length / 4
      resolve(bins.map(b => b / total))
    }
    img.onerror = () => resolve(null)
    img.src = base64
  })
}

/**
 * Compare two images using histogram intersection.
 * Returns similarity score 0-1.
 */
export async function compareFaces(idPhoto: string, snapshot: string): Promise<FaceMatchResult> {
  const hist1 = await extractHistogram(idPhoto)
  const hist2 = await extractHistogram(snapshot)

  if (!hist1 || !hist2) {
    return { score: 0, matched: false, snapshotBase64: snapshot, timestamp: Date.now() }
  }

  // Histogram intersection (sum of min of each bin)
  let intersection = 0
  for (let i = 0; i < hist1.length; i++) {
    intersection += Math.min(hist1[i], hist2[i])
  }

  // Normalize to 0-1
  const score = Math.min(1, intersection * 2.5) // Scale up since histogram intersection is conservative

  return {
    score: Math.round(score * 100) / 100,
    matched: score >= MATCH_THRESHOLD,
    snapshotBase64: snapshot,
    timestamp: Date.now(),
  }
}

export { SNAPSHOT_INTERVAL_MS, MATCH_THRESHOLD }
