/**
 * Server-side QR code generation.
 *
 * Wraps the `qrcode` package and produces SVG strings sized for inline use
 * in our React components. SVG is preferred over PNG so the result is
 * crisp at any DPI and small to ship over the wire (<5 KB typical).
 */
import QRCode from 'qrcode'

export interface QrOptions {
  size?: number
  margin?: number
  dark?: string
  light?: string
}

export async function generateQrSvg(data: string, opts: QrOptions = {}): Promise<string> {
  return QRCode.toString(data, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    width: opts.size ?? 256,
    margin: opts.margin ?? 2,
    color: {
      dark: opts.dark ?? '#0b0f14',
      light: opts.light ?? '#ffffff',
    },
  })
}

export async function generateQrDataUrl(
  data: string,
  opts: QrOptions = {},
): Promise<string> {
  return QRCode.toDataURL(data, {
    errorCorrectionLevel: 'M',
    width: opts.size ?? 256,
    margin: opts.margin ?? 2,
    color: {
      dark: opts.dark ?? '#0b0f14',
      light: opts.light ?? '#ffffff',
    },
  })
}
