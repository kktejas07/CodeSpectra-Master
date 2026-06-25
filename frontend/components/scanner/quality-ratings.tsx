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
      <Card className="p-8 text-center bg-card/30 border border-dashed border-border">
        <AlertCircle className="w-12 h-12 text-foreground/40 mx-auto mb-3" />
        <p className="text-foreground/60">No ratings available yet</p>
      </Card>
    )
  }

  const getRatingColor = (rating: string) => {
    if (rating === 'A') return 'bg-green-500 text-white'
    if (rating === 'B') return 'bg-lime-500 text-white'
    if (rating === 'C') return 'bg-yellow-500 text-white'
    if (rating === 'D') return 'bg-orange-500 text-white'
    return 'bg-red-500 text-white'
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
      <Card className="p-6 text-center bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30">
        <p className="text-sm text-foreground/60 mb-3">Overall Quality</p>
        <div className="text-5xl font-bold text-primary mb-2">{ratings.overallScore}</div>
        <p className="text-xs text-foreground/50">/100</p>
      </Card>

      {/* Security Rating */}
      <Card className="p-6 text-center border border-border">
        <p className="text-sm text-foreground/60 mb-3">Security</p>
        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full text-3xl font-bold mb-2 ${getRatingColor(ratings.security)}`}>
          {ratings.security}
        </div>
        <p className="text-xs text-foreground/50">{getRatingDescription(ratings.security)}</p>
      </Card>

      {/* Reliability Rating */}
      <Card className="p-6 text-center border border-border">
        <p className="text-sm text-foreground/60 mb-3">Reliability</p>
        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full text-3xl font-bold mb-2 ${getRatingColor(ratings.reliability)}`}>
          {ratings.reliability}
        </div>
        <p className="text-xs text-foreground/50">{getRatingDescription(ratings.reliability)}</p>
      </Card>

      {/* Maintainability Rating */}
      <Card className="p-6 text-center border border-border">
        <p className="text-sm text-foreground/60 mb-3">Maintainability</p>
        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full text-3xl font-bold mb-2 ${getRatingColor(ratings.maintainability)}`}>
          {ratings.maintainability}
        </div>
        <p className="text-xs text-foreground/50">{getRatingDescription(ratings.maintainability)}</p>
      </Card>
    </div>
  )
}
