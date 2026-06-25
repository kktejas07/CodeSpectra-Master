/** URL `?mode=` values for `/dashboard/scanner` — shared by layout sidebar and scanner page. */
export const SCANNER_MODE_VALUES = [
  'manual',
  'github',
  'quality-gates',
  'trends',
  'review',
  'config',
  'reports',
  'insights',
  'team',
  'metrics',
  'hotspots',
  'ratings',
  'activity',
  'architecture',
  'pr',
  'branches',
] as const

export type ScannerMode = (typeof SCANNER_MODE_VALUES)[number]

export function parseScannerMode(raw: string | null): ScannerMode {
  if (raw && (SCANNER_MODE_VALUES as readonly string[]).includes(raw)) {
    return raw as ScannerMode
  }
  return 'manual'
}

export function scannerHref(mode: ScannerMode): string {
  return `/dashboard/scanner?mode=${encodeURIComponent(mode)}`
}
