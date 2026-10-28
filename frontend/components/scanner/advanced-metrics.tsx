'use client'

import { AlertCircle, TrendingDown, TrendingUp, Shield, Zap, Code2, Bug, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useT } from '@/lib/i18n/client'

interface AdvancedMetricsProps {
  quality: number
  bugs: number
  vulnerabilities: number
  codeSmells: number
  securityHotspots: number
  duplicatePercentage: number
  complexityScore: number
  maintainabilityIndex: number
  testCoveragePercentage: number
}

export function AdvancedMetrics({
  quality,
  bugs,
  vulnerabilities,
  codeSmells,
  securityHotspots,
  duplicatePercentage,
  complexityScore,
  maintainabilityIndex,
  testCoveragePercentage,
}: AdvancedMetricsProps) {
  const { t } = useT()
  const getSeverityColor = (value: number, threshold: number) => {
    if (value === 0) return 'text-green-500'
    if (value <= threshold * 0.5) return 'text-yellow-500'
    return 'text-red-500'
  }

  const getQualityBadgeColor = (score: number) => {
    if (score >= 80) return 'bg-green-500/20 text-green-600 border-green-500/30'
    if (score >= 60) return 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30'
    return 'bg-red-500/20 text-red-600 border-red-500/30'
  }

  const MetricCard = ({
    icon: Icon,
    label,
    value,
    unit = '',
    color = 'text-primary',
    secondaryValue,
  }: {
    icon: any
    label: string
    value: number | string
    unit?: string
    color?: string
    secondaryValue?: string
  }) => (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-2">
        <Icon className={`w-5 h-5 ${color}`} />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {secondaryValue && <p className="text-xs text-muted-foreground mt-1">{secondaryValue}</p>}
    </Card>
  )

  return (
    <div className="space-y-6">
      {/* Quality Score Banner */}
      <div className="relative overflow-hidden rounded-lg bg-linear-to-r from-primary/20 to-primary/10 border border-primary/30 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-foreground/70 mb-2">{t('tools.overallCodeQuality')}</p>
            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-bold text-primary">{quality}</span>
              <span className="text-lg text-muted-foreground">/100</span>
            </div>
          </div>
          <div className={`px-4 py-2 rounded-lg border ${getQualityBadgeColor(quality)}`}>
            <p className="font-semibold text-sm">
              {quality >= 80 ? t('tools.excellent') : quality >= 60 ? t('tools.good') : t('tools.needsWork')}
            </p>
          </div>
        </div>

        {/* Quality gauge background */}
        <div className="absolute right-0 top-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16" />
      </div>

      {/* Issue Counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          icon={Bug}
          label={t('tools.bugs')}
          value={bugs}
          color={getSeverityColor(bugs, 5)}
          secondaryValue={bugs > 0 ? 'Issues to fix' : 'No bugs found'}
        />
        <MetricCard
          icon={Shield}
          label={t('tools.vulnerabilities')}
          value={vulnerabilities}
          color={getSeverityColor(vulnerabilities, 2)}
          secondaryValue={vulnerabilities > 0 ? 'Security risks' : 'No vulnerabilities'}
        />
        <MetricCard
          icon={AlertTriangle}
          label={t('tools.codeSmells')}
          value={codeSmells}
          color={getSeverityColor(codeSmells, 50)}
          secondaryValue="Quality issues"
        />
        <MetricCard
          icon={AlertCircle}
          label={t('tools.hotspots')}
          value={securityHotspots}
          color={getSeverityColor(securityHotspots, 5)}
          secondaryValue="Need review"
        />
      </div>

      {/* Code Quality Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <MetricCard
          icon={Code2}
          label={t('tools.duplicatedCode')}
          value={duplicatePercentage.toFixed(1)}
          unit="%"
          color={duplicatePercentage < 10 ? 'text-green-500' : 'text-yellow-500'}
          secondaryValue="Code repetition"
        />
        <MetricCard
          icon={Zap}
          label={t('tools.complexity')}
          value={complexityScore}
          color={complexityScore < 20 ? 'text-green-500' : 'text-yellow-500'}
          secondaryValue="Cyclomatic complexity"
        />
        <MetricCard
          icon={TrendingUp}
          label={t('tools.maintainability')}
          value={maintainabilityIndex}
          unit="/100"
          color={maintainabilityIndex >= 70 ? 'text-green-500' : 'text-yellow-500'}
          secondaryValue="Long-term health"
        />
        <MetricCard
          icon={TrendingDown}
          label={t('tools.testCoverage')}
          value={testCoveragePercentage.toFixed(1)}
          unit="%"
          color={testCoveragePercentage >= 50 ? 'text-green-500' : 'text-red-500'}
          secondaryValue="Code covered by tests"
        />
      </div>

      {/* Metrics Information */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold text-foreground mb-3">{t('tools.understandingTheMetrics')}</h4>
        <div className="space-y-2 text-xs text-foreground/70">
          <p>
            <strong>{t('tools.bugs2')}</strong>{' '}{t('tools.potentialRuntimeErrorsAndLogicalIssues59c')}</p>
          <p>
            <strong>{t('tools.vulnerabilities2')}</strong>{' '}{t('tools.securityRisksThatCouldBeExploited158')}</p>
          <p>
            <strong>{t('tools.codeSmells2')}</strong>{' '}{t('tools.designAndReadabilityIssuesThatDontf27')}</p>
          <p>
            <strong>{t('tools.duplicatedCode2')}</strong>{' '}{t('tools.repeatedCodeSegmentsThatViolateDry4c0')}</p>
          <p>
            <strong>{t('tools.complexity2')}</strong>{' '}{t('tools.higherScoresIndicateHarderToUnderstanda54')}</p>
          <p>
            <strong>{t('tools.testCoverage2')}</strong>{' '}{t('tools.percentageOfCodeExecutedByTests483')}</p>
        </div>
      </Card>
    </div>
  )
}
