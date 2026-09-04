'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, CheckSquare, Square, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface DataTableColumn<T> {
  key: string
  header: string
  cell: (row: T) => React.ReactNode
  className?: string
  sortable?: boolean
}

export interface BulkAction {
  label: string
  icon?: React.ReactNode
  variant?: 'default' | 'destructive' | 'outline'
  onClick: (ids: string[]) => void
  /** Set to false to not clear selection after action */
  clearSelection?: boolean
}

export interface FilterOption {
  label: string
  value: string
}

interface DataTableProps<T extends { id: string }> {
  columns: DataTableColumn<T>[]
  data: T[]
  /** ID for localStorage persistence of selected rows */
  tableId?: string
  searchPlaceholder?: string
  searchKeys?: (keyof T)[]
  filters?: {
    label: string
    key: string
    options: FilterOption[]
    defaultValue?: string
  }[]
  bulkActions?: BulkAction[]
  pageSize?: number
  loading?: boolean
  emptyMessage?: string
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  tableId,
  searchPlaceholder = 'Search...',
  searchKeys,
  filters,
  bulkActions,
  pageSize = 20,
  loading = false,
  emptyMessage = 'No records found',
}: DataTableProps<T>) {
  const [search, setSearch] = useState('')
  const [filterValues, setFilterValues] = useState<Record<string, string>>(() => {
    if (!filters) return {}
    const initial: Record<string, string> = {}
    filters.forEach(f => { initial[f.key] = f.defaultValue || 'all' })
    return initial
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const safeData = data || []
  let filtered = safeData.filter(item => {
    if (search && searchKeys?.length) {
      const q = search.toLowerCase()
      const match = searchKeys.some(key => {
        const val = (item as any)[key]
        return val && String(val).toLowerCase().includes(q)
      })
      if (!match) return false
    }
    if (filters) {
      for (const f of filters) {
        if (filterValues[f.key] && filterValues[f.key] !== 'all') {
          if (String((item as any)[f.key]).toLowerCase() !== filterValues[f.key].toLowerCase()) {
            return false
          }
        }
      }
    }
    return true
  })

  if (sortConfig !== null) {
    filtered = [...filtered].sort((a, b) => {
      const aVal = (a as any)[sortConfig.key]
      const bVal = (b as any)[sortConfig.key]
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const allSelected = paginated.length > 0 && paginated.every(r => selected.has(r.id))
  const someSelected = selected.size > 0

  const toggleSelectAll = () => {
    const next = new Set(selected)
    if (allSelected) {
      paginated.forEach(r => next.delete(r.id))
    } else {
      paginated.forEach(r => next.add(r.id))
    }
    setSelected(next)
  }

  const toggleRow = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  return (
    <div className="space-y-4">
      {(searchKeys?.length || filters?.length) ? (
        <div className="flex flex-wrap items-center gap-3">
          {searchKeys?.length ? (
            <div className="relative flex-1 min-w-50 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                className="pl-8 h-9 text-sm"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
              />
            </div>
          ) : null}
          {filters?.map(f => (
            <Select
              key={f.key}
              value={filterValues[f.key] || 'all'}
              onValueChange={v => { setFilterValues(prev => ({ ...prev, [f.key]: v })); setPage(1) }}
            >
              <SelectTrigger className="h-9 w-35 text-sm">
                <SelectValue placeholder={f.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{f.label}: All</SelectItem>
                {f.options.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
          <p className="text-xs text-muted-foreground ml-auto">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
        </div>
      ) : null}

      {someSelected && bulkActions?.length ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex-1" />
          {bulkActions.map((action, i) => (
            <Button
              key={i}
              variant={action.variant || 'outline'}
              size="sm"
              onClick={() => {
                action.onClick(Array.from(selected))
                if (action.clearSelection !== false) setSelected(new Set())
              }}
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {bulkActions?.length ? (
                  <th className="w-10 py-3 px-4">
                    <button
                      onClick={toggleSelectAll}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                ) : null}
                {columns.map(col => (
                  <th key={col.key} className={`text-left py-3 px-4 font-semibold text-xs ${col.className || ''}`}>
                    {col.sortable ? (
                      <button
                        onClick={() => handleSort(col.key)}
                        className="flex items-center gap-1 hover:text-foreground transition-colors group"
                      >
                        {col.header}
                        {sortConfig?.key === col.key ? (
                          sortConfig.direction === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-50" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length + (bulkActions?.length ? 1 : 0)} className="py-12 text-center text-muted-foreground text-sm">
                    Loading...
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (bulkActions?.length ? 1 : 0)} className="py-12 text-center text-muted-foreground text-sm">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                paginated.map(row => (
                  <tr key={row.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                    {bulkActions?.length ? (
                      <td className="py-3 px-4">
                        <button
                          onClick={() => toggleRow(row.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {selected.has(row.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                    ) : null}
                    {columns.map(col => (
                      <td key={col.key} className={`py-3 px-4 ${col.className || ''}`}>
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {safePage} of {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-3 w-3 mr-1" />Prev
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next<ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
