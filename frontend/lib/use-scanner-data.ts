import useSWR from 'swr'
import { useCallback } from 'react'

const fetcher = (url: string) => fetch(url).then(res => res.json())

// Quality Ratings Hook
export function useQualityRatings(projectId?: string, branch?: string) {
  const params = new URLSearchParams()
  if (projectId) params.append('projectId', projectId)
  if (branch) params.append('branch', branch)
  
  const url = projectId ? `/api/scanner/quality-ratings?${params}` : null
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  })

  return {
    ratings: data?.data,
    loading: isLoading,
    error,
    mutate,
  }
}

// Quality Gates Hook
export function useQualityGates(projectId?: string) {
  const params = new URLSearchParams()
  if (projectId) params.append('projectId', projectId || 'default')
  
  const url = `/api/scanner/quality-gates?${params}`
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
    revalidateOnFocus: false,
  })

  return {
    gates: data?.gates || [],
    loading: isLoading,
    error,
    mutate,
  }
}

// File Metrics Hook
export function useFileMetrics(projectId?: string, scanId?: string) {
  const params = new URLSearchParams()
  if (projectId) params.append('projectId', projectId)
  if (scanId) params.append('scanId', scanId)
  
  const url = projectId ? `/api/scanner/metrics/files?${params}` : null
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
    revalidateOnFocus: false,
  })

  return {
    files: data?.files || [],
    loading: isLoading,
    error,
    mutate,
  }
}

// Issues Hook
export function useIssues(projectId?: string, status?: string) {
  const params = new URLSearchParams()
  if (projectId) params.append('projectId', projectId)
  if (status) params.append('status', status)
  
  const url = projectId ? `/api/scanner/issues?${params}` : null
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
    revalidateOnFocus: false,
  })

  return {
    issues: data?.issues || [],
    loading: isLoading,
    error,
    mutate,
  }
}

// Activity Timeline Hook
export function useActivityTimeline(projectId?: string) {
  const params = new URLSearchParams()
  if (projectId) params.append('projectId', projectId)
  
  const url = projectId ? `/api/scanner/activities?${params}` : null
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
    revalidateOnFocus: false,
    revalidateInterval: 30000,
  })

  return {
    activities: data?.activities || [],
    loading: isLoading,
    error,
    mutate,
  }
}

// Mutation hooks
export function useCreateQualityGate() {
  const mutate = useCallback(async (gate: any) => {
    try {
      const response = await fetch('/api/scanner/quality-gates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gate),
      })
      const data = await response.json()
      return data
    } catch (error) {
      console.error('[CodeSpectra] Error creating quality gate:', error)
      throw error
    }
  }, [])

  return mutate
}

export function useUpdateIssueStatus() {
  const mutate = useCallback(async (issueId: string, status: string) => {
    try {
      const response = await fetch('/api/scanner/issues/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [issueId], status }),
      })
      const data = await response.json()
      return data
    } catch (error) {
      console.error('[CodeSpectra] Error updating issue:', error)
      throw error
    }
  }, [])

  return mutate
}

export function useBulkUpdateIssues() {
  const mutate = useCallback(async (payload: any) => {
    try {
      const response = await fetch('/api/scanner/issues/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      return data
    } catch (error) {
      console.error('[CodeSpectra] Error bulk updating issues:', error)
      throw error
    }
  }, [])

  return mutate
}
