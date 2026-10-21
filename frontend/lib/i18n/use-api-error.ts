'use client'

/**
 * Hook: localized text for an API error body.
 *
 *   const apiError = useApiError()
 *   if (!res.ok) toast.error(apiError(await res.json().catch(() => null)))
 *
 * English shows the server's text unchanged; see lib/i18n/api-error.ts.
 */
import { useCallback } from 'react'
import { useMessages, useT } from './client'
import { localizeApiError } from './api-error'

export function useApiError(): (body: unknown, fallback?: string) => string {
  const { locale, t } = useT()
  const messages = useMessages()
  return useCallback(
    (body: unknown, fallback?: string) => localizeApiError(locale, messages, body, fallback ?? t('errors.somethingWentWrongRetry')),
    [locale, messages, t],
  )
}
