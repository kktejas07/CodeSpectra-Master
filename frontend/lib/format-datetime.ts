/**
 * Timezone-aware date formatting bound to the platform timezone
 * (`platform_settings` → `general.timezone`, admin Settings → General).
 *
 * Every page/role should render dates through these helpers (and the
 * `useDateFormat` hook) so whatever timezone is configured is reflected
 * everywhere. Previously some pages hardcoded UTC via
 * `new Date(x).toISOString().slice(0, 16)`, which showed UTC regardless of the
 * setting.
 *
 * Pure functions (no React / server imports) so they work on both client and
 * server. Client components should prefer `useDateFormat()` from
 * `lib/use-platform-timezone.ts` to bind the live setting.
 */

export const DEFAULT_TIMEZONE = 'Asia/Kolkata'

/**
 * App-wide fallback timezone. The app shell calls {@link setDefaultTimezone}
 * once the platform setting loads, so call sites can use `formatDateTime(x)`
 * without threading `tz` through every component.
 */
let _defaultTz: string | null = null
export function setDefaultTimezone(tz?: string | null): void {
  _defaultTz = tz && tz.trim() ? tz.trim() : null
}
export function getDefaultTimezone(): string {
  return _defaultTz || DEFAULT_TIMEZONE
}

/** Normalize a possibly-missing timezone to a usable IANA id. */
export function resolveTimezone(tz?: string | null): string {
  return (tz && tz.trim()) || _defaultTz || DEFAULT_TIMEZONE
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const MISSING = '—'

/** e.g. "13 Oct 2026, 07:05 pm" (platform timezone). */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  tz?: string | null,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = toDate(value)
  if (!d) return MISSING
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: resolveTimezone(tz),
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    ...opts,
  }).format(d)
}

/** e.g. "13 Oct 2026". */
export function formatDate(
  value: string | number | Date | null | undefined,
  tz?: string | null,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = toDate(value)
  if (!d) return MISSING
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: resolveTimezone(tz),
    day: '2-digit', month: 'short', year: 'numeric',
    ...opts,
  }).format(d)
}

/** e.g. "07:05 pm". */
export function formatTime(
  value: string | number | Date | null | undefined,
  tz?: string | null,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = toDate(value)
  if (!d) return MISSING
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: resolveTimezone(tz),
    hour: '2-digit', minute: '2-digit', hour12: true,
    ...opts,
  }).format(d)
}

/** `YYYY-MM-DD` for `value` in the platform timezone (date-picker / filters). */
export function toZonedDateInput(value: string | number | Date | null | undefined, tz?: string | null): string {
  const d = toDate(value)
  if (!d) return ''
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: resolveTimezone(tz),
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}
