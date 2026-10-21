'use client'

/** Placement console context: the college being managed and a URL helper (superadmin passes ?college=). */
import { createContext, useContext } from 'react'
import type { CollegeDoc } from '@/lib/campus/types'

export interface ConsoleCtx {
  college: CollegeDoc
  role: 'superadmin' | 'college_admin' | 'placement_officer'
  /** Append the college scope for superadmin. */
  url: (path: string) => string
  reloadCollege: () => void
}

export const ConsoleContext = createContext<ConsoleCtx | null>(null)

export function useConsole(): ConsoleCtx {
  const c = useContext(ConsoleContext)
  if (!c) throw new Error('useConsole outside the placement console')
  return c
}

export function scopedUrl(path: string, collegeId: string | null): string {
  if (!collegeId) return path
  return `${path}${path.includes('?') ? '&' : '?'}college=${encodeURIComponent(collegeId)}`
}

export function deptName(college: Pick<CollegeDoc, 'departments'>, id: string | null): string {
  return college.departments.find((d) => d.id === id)?.name ?? 'No department'
}

export function batchName(college: Pick<CollegeDoc, 'batches'>, id: string | null): string {
  return college.batches.find((b) => b.id === id)?.name ?? 'No batch'
}
