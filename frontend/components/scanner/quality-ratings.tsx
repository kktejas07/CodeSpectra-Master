'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertCircle } from 'lucide-react'

interface QualityRating {
  security: 'A' | 'B' | 'C' | 'D' | 'E'
  reliability: 'A' | 'B' | 'C' | 'D' | 'E'
  maintainability: 'A' | 'B' | 'C' | 'D' | 'E'
  overallScore: number
}

interface QualityRatingsProps {
  ratings?: QualityRating
}

export function QualityRatings({ ratings }: QualityRatingsProps) {
  if (!ratings) {
    return (
      <Card className="rounded-3xl p-8 text-center border border-dashed">
        <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No ratings available yet</p>
      </Card>
    )
  }

  const getRatingColor = (rating: string) => {
    if (rating === 'A') return 'bg-green-600 text-white'
    if (rating === 'B') return 'bg-lime-400 text-lime-950'
    if (rating === 'C') return 'bg-amber-400 text-amber-950'
    if (rating === 'D') return 'bg-orange-600 text-white'
    return 'bg-red-600 text-white'
  }

  const getRatingDescription = (rating: string) => {
    if (rating === 'A') return '8+ points'
    if (rating === 'B') return '7 points'
    if (rating === 'C') return '5 points'
    if (rating === 'D') return '3 points'
    return '< 3 points'
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Overall Score */}
      <Card className="rounded-3xl p-6 text-center bg-linear-to-br from-primary/20 to-primary/5 border border-primary/30">
        <p className="text-sm text-muted-foreground mb-3">Overall quality</p>
        <div className="text-5xl font-bold text-primary mb-2">{ratings.overallScore}</div>
        <p className="text-xs text-muted-foreground">/100</p>
      </Card>

      {/* Security Rating */}
      <Card className="rounded-3xl p-6 text-center">
        <p className="text-sm text-muted-foreground mb-3">Security</p>
        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full text-3xl font-bold mb-2 ${getRatingColor(ratings.security)}`}>
          {ratings.security}
        </div>
        <p className="text-xs text-muted-foreground">{getRatingDescription(ratings.security)}</p>
      </Card>

      {/* Reliability Rating */}
      <Card className="rounded-3xl p-6 text-center">
        <p className="text-sm text-muted-foreground mb-3">Reliability</p>
        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full text-3xl font-bold mb-2 ${getRatingColor(ratings.reliability)}`}>
          {ratings.reliability}
        </div>
        <p className="text-xs text-muted-foreground">{getRatingDescription(ratings.reliability)}</p>
      </Card>

      {/* Maintainability Rating */}
      <Card className="rounded-3xl p-6 text-center">
        <p className="text-sm text-muted-foreground mb-3">Maintainability</p>
        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full text-3xl font-bold mb-2 ${getRatingColor(ratings.maintainability)}`}>
          {ratings.maintainability}
        </div>
        <p className="text-xs text-muted-foreground">{getRatingDescription(ratings.maintainability)}</p>
      </Card>
    </div>
  )
}
