// API Response Helper
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export function successResponse<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
  }
}

export function errorResponse(error: string): ApiResponse<null> {
  return {
    success: false,
    error,
  }
}

// Pagination Helper
export interface PaginationParams {
  page: number
  limit: number
}

export function getPaginationParams(searchParams: URLSearchParams): PaginationParams {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '10'))
  return { page, limit }
}

// Sorting Helper
export interface SortParams {
  sortBy: string
  order: 'asc' | 'desc'
}

export function getSortParams(searchParams: URLSearchParams): SortParams {
  return {
    sortBy: searchParams.get('sortBy') || 'created_at',
    order: (searchParams.get('order') as 'asc' | 'desc') || 'desc',
  }
}

// Error Handler
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function handleApiError(error: unknown): { statusCode: number; message: string } {
  if (error instanceof ApiError) {
    return { statusCode: error.statusCode, message: error.message }
  }

  if (error instanceof Error) {
    return { statusCode: 500, message: error.message }
  }

  return { statusCode: 500, message: 'Internal server error' }
}
