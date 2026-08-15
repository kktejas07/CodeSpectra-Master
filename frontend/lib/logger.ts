/**
 * Simple logger that strips sensitive data in production.
 * Use this instead of console.log/error for structured logging.
 */

function maskEmail(email: string): string {
  if (process.env.NODE_ENV === 'production') {
    const [local, domain] = email.split('@')
    return `${local?.slice(0, 2)}***@${domain || '***'}`
  }
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
      console.log(message, ...args)
    }
  },
  
  warn: (message: string, ...args: unknown[]) => {
    console.warn(message, ...args)
  },
  
  error: (message: string, ...args: unknown[]) => {
    console.error(message, ...args)
  },
  
  // Sanitized logging for sensitive data
  auth: (message: string, data?: { email?: string; userId?: string }) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(message, data?.email ? { email: maskEmail(data.email) } : data)
    }
  },
  
  email: (message: string, data?: { to?: string; subject?: string }) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(message, data?.to ? { to: maskEmail(data.to), subject: data.subject } : data)
    }
  },
  
  webhook: (message: string, data?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(message, data)
    }
  },
}

export { maskEmail, maskString }
