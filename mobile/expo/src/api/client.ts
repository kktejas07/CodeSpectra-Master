const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
}

export type Problem = {
  id: string
  slug: string
  title: string
  difficulty: string
  topics: string[]
  statement_md?: string
}

export type Scan = {
  id: string
  scan_type: string
  language: string
  issue_count: number
  created_at: string
}

export type Certification = {
  id: string
  name: string
  issuer: string
  issued_at: string
  verify_url: string
}
