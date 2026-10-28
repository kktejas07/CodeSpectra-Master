import { describe, expect, it } from 'vitest'
import { denseSeries, utcDayKeys } from '@/lib/admin/overview'
import { spanClass } from '@/components/bento/grid'

describe('admin overview series', () => {
  it('lists the last n UTC days, oldest first, ending today', () => {
    expect(utcDayKeys(new Date('2026-03-02T23:30:00Z'), 3)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02'])
  })
  it('fills missing days with zero and ignores unknown or null keys', () => {
    const keys = ['2026-01-01', '2026-01-02', '2026-01-03']
    expect(denseSeries([{ _id: '2026-01-03', n: 4 }, { _id: null, n: 9 }, { _id: '2025-12-31', n: 2 }], keys)).toEqual([0, 0, 4])
  })
})

describe('bento spans', () => {
  it('derives the tablet span from the desktop span', () => {
    expect(spanClass({ span: 3 })).toContain('sm:col-span-2')
    expect(spanClass({ span: 2 })).toContain('sm:col-span-1')
    expect(spanClass({ span: 2, smSpan: 2, rows: 2 })).toBe('sm:col-span-2 lg:col-span-2 lg:row-span-2')
  })
})
