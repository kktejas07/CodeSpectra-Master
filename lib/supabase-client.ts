import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check your .env.local file.'
  )
}

// Client for browser (use anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Client for server (use service role key)
export const supabaseServer = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey)

// Common error handler
export function handleSupabaseError(error: any) {
  console.error('[v0] Supabase error:', error?.message || error)
  return {
    error: error?.message || 'An error occurred',
    status: error?.status || 500,
  }
}

// Pagination helper
export interface PaginationParams {
  page?: number
  limit?: number
}

export function getPaginationRange(page = 1, limit = 10) {
  const start = (page - 1) * limit
  const end = start + limit - 1
  return { start, end }
}

// Response formatter
export function formatResponse<T>(data: T, error: any = null) {
  if (error) {
    return { data: null, error: error.message || 'Error occurred', status: 'error' }
  }
  return { data, error: null, status: 'success' }
}
