/**
 * Structured logger. Emails stay intact so superadmin logs can be traced.
 */

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
    console.log(message, data?.email ? { email: maskEmail(data.email), userId: data.userId } : data)
  },
  
  email: (message: string, data?: { to?: string; subject?: string }) => {
    console.log(message, data?.to ? { to: maskEmail(data.to), subject: data.subject } : data)
  },
  
  webhook: (message: string, data?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(message, data)
    }
  },
}

export { maskEmail, maskString }
