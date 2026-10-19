/**
 * Structured logger. Emails stay intact so superadmin logs can be traced.
 * Every argument goes through lib/log-redact (passwords, tokens, API keys,
 * credentialed connection strings and private keys are masked). On the Node
 * server the same redaction also wraps console.* (instrumentation.ts).
 */
import { redactLogValue } from '@/lib/log-redact'

const clean = (args: unknown[]) => args.map((a) => redactLogValue(a))

function maskEmail(email: string): string {
  return email
}

function maskString(str: string, visibleChars = 2): string {
  if (process.env.NODE_ENV === 'production') {
    if (str.length <= visibleChars) return '***'
    return `${str.slice(0, visibleChars)}***`
  }
  return str
}

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(redactLogValue(message), ...clean(args))
    }
  },
  
  warn: (message: string, ...args: unknown[]) => {
    console.warn(redactLogValue(message), ...clean(args))
  },
  
  error: (message: string, ...args: unknown[]) => {
    console.error(redactLogValue(message), ...clean(args))
  },
  
  // Sanitized logging for sensitive data
  auth: (message: string, data?: { email?: string; userId?: string }) => {
    console.log(redactLogValue(message), redactLogValue(data?.email ? { email: maskEmail(data.email), userId: data.userId } : data))
  },
  
  email: (message: string, data?: { to?: string; subject?: string }) => {
    console.log(redactLogValue(message), redactLogValue(data?.to ? { to: maskEmail(data.to), subject: data.subject } : data))
  },
  
  webhook: (message: string, data?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(redactLogValue(message), redactLogValue(data))
    }
  },
}

export { maskEmail, maskString, redactLogValue }
