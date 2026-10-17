'use client'

import { formatDistanceToNow } from 'date-fns'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Clock, Trash2, Pencil, Eye } from 'lucide-react'

interface ScanResult {
  id: string
  source: 'manual' | 'github'
  target: string
  language?: string
  quality: number
  bugs: number
  vulnerabilities: number
  codeSmells: number
  timestamp: Date
  duration: number
  codeSnippet?: string
}

interface ScanHistoryProps {
  scans: ScanResult[]
  onSelectScan?: (scan: ScanResult) => void
  onEdit?: (scan: ScanResult) => void
  onDelete?: (scanId: string) => void
  page?: number
  totalPages?: number
  onPageChange?: (page: number) => void
}

export function ScanHistory({ scans, onSelectScan, onEdit, onDelete, page = 1, totalPages = 1, onPageChange }: ScanHistoryProps) {
  const getQualityColor = (score: number) => {
    if (score >= 80) return 'bg-green-500/20 text-green-600 border-green-500/30'
    if (score >= 60) return 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30'
    return 'bg-red-500/20 text-red-600 border-red-500/30'
  }

  const getQualityLabel = (score: number) => {
    if (score === 0) return 'Invalid Code / Error'
    if (score >= 80) return 'Excellent'
    if (score >= 60) return 'Good'
    return 'Poor'
  }

  if (scans.length === 0) {
    return (
      <Card className="rounded-3xl p-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <Clock className="w-8 h-8 text-muted-foreground" />
          <div>
            <p className="font-medium text-foreground">No scans yet</p>
            <p className="text-sm text-muted-foreground">Your scan history will appear here</p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground flex items-center gap-2">
        <Clock className="w-5 h-5" />
        Recent Scans
      </h3>

      <div className="space-y-2">
        {scans.map((scan) => (
          <Card
            key={scan.id}
            className="bg-card/30 border border-border p-4 hover:border-primary/50 transition"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              {/* Scan Info */}
              <div className="flex-1 space-y-1 w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{scan.target}</p>
                  <Badge variant="outline" className="text-xs">
                    {scan.source === 'github' ? 'GitHub' : 'Manual'}
                  </Badge>
                  {scan.language && (
                    <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600">
                      {scan.language}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(scan.timestamp, { addSuffix: true })} • {scan.duration}ms
                </p>
              </div>

              {/* Metrics */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="text-right space-y-1">
                  <Badge
                    className={`${getQualityColor(scan.quality)} border text-xs font-semibold`}
                  >
                    {scan.quality}/100
                  </Badge>
                  <p className="text-xs text-muted-foreground">{getQualityLabel(scan.quality)}</p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => onSelectScan?.(scan)}
                    className="p-2 hover:bg-background rounded text-muted-foreground hover:text-foreground transition"
                    title="View full report"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onEdit?.(scan)}
                    className="p-2 hover:bg-background rounded text-muted-foreground hover:text-foreground transition"
                    title="Edit previous scan"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onDelete?.(scan.id)}
                    className="p-2 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-600 transition"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Issue Summary */}
            <div className="flex gap-4 mt-3 pt-3 border-t border-border/50 text-xs">
              {scan.bugs > 0 && (
                <span className="text-red-600">
                  <span className="font-semibold">{scan.bugs}</span> bugs
                </span>
              )}
              {scan.vulnerabilities > 0 && (
                <span className="text-orange-600">
                  <span className="font-semibold">{scan.vulnerabilities}</span> vulnerabilities
                </span>
              )}
              {scan.codeSmells > 0 && (
                <span className="text-yellow-600">
                  <span className="font-semibold">{scan.codeSmells}</span> code smells
                </span>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange?.(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange?.(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
