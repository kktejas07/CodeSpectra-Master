'use client'

/**
 * Client-side image compression for email content. Emails render at ~600px, so
 * downscaling to 2x (1200px) keeps them retina-crisp; re-encoding alpha-free
 * images as JPEG (q0.82) cuts base64 bloat that would otherwise push emails past
 * Gmail's ~102KB clip limit. Transparent images stay PNG. No server dependency.
 *
 * Shared by the rich-text editor (paste path) and the newsletter page (retro-
 * compression of images already in a draft), so both run the same pipeline.
 */

const MAX_IMAGE_WIDTH = 1200
const JPEG_QUALITY = 0.82

/** Only retro-compress data URLs this big — smaller ones are never the size problem. */
const RETRO_COMPRESS_MIN_BYTES = 64 * 1024

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image decode failed'))
    img.src = src
  })
}

/** Compress a single `data:` image URL (downscale + re-encode). */
export async function compressImageDataUrl(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl)
  const scale = img.naturalWidth > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / img.naturalWidth : 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unsupported')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const hasAlpha = (() => {
    try {
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      for (let i = 3; i < d.length; i += 4) {
        if (d[i] < 250) return true
      }
    } catch { /* tainted canvas → assume JPEG */ }
    return false
  })()

  return hasAlpha
    ? canvas.toDataURL('image/png')
    : canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

/**
 * Rewrite every `<img src="data:...">` in HTML that is larger than
 * `RETRO_COMPRESS_MIN_BYTES` through `compressImageDataUrl`. Returns the same
 * string when there is nothing to compress. Safe for contentEditable output —
 * uses a placeholder swap so no other markup is touched.
 */
export async function compressHtmlImages(html: string): Promise<string> {
  const srcRe = /(<img\b[^>]*?\bsrc=)(["'])(data:[^"']+)\2/gi
  const jobs: Promise<string>[] = []

  const withPlaceholders = html.replace(srcRe, (match, pre, quote, dataUrl) => {
    if (dataUrl.length <= RETRO_COMPRESS_MIN_BYTES) return match
    const idx = jobs.length
    jobs.push(compressImageDataUrl(dataUrl))
    return `${pre}${quote}__codespectra_img_${idx}__${quote}`
  })

  if (jobs.length === 0) return html

  const results = await Promise.all(jobs)
  return withPlaceholders.replace(/__codespectra_img_(\d+)__/g, (_, i) => results[Number(i)])
}
