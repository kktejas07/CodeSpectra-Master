/** Client-safe playback helpers for chunked proctoring recordings (see recordings.ts). */

/** Which playlist item covers time `t` (ms from origin), and where inside it. Pure. */
export function locate(items: Array<{ offset_ms: number; duration_ms: number }>, t: number): { index: number; within_ms: number } | null {
  if (!items.length) return null
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (t < it.offset_ms) return { index: i, within_ms: 0 } // in a gap: jump to the next chunk
    if (t < it.offset_ms + it.duration_ms) return { index: i, within_ms: t - it.offset_ms }
  }
  return null
}

