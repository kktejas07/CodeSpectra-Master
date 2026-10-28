'use client'

import { useMemo } from 'react'
import { Card } from '@/components/ui/card'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { useT } from '@/lib/i18n/client'

export interface ChartRow {
  score: number | null
  status: string
  graded?: boolean
  released?: boolean
}

export interface QuestionStat {
  qId: string
  title: string
  type: string
  max: number
  avgPct: number | null
  graded: number
  answered: number
  total: number
}

const BUCKET_LABELS = ['0-10', '10-20', '20-30', '30-40', '40-50', '50-60', '60-70', '70-80', '80-90', '90-100']
// Released = success green, graded-unreleased = brand, awaiting = amber, none = slate.
const DONUT_COLORS = ['#16a34a', 'hsl(var(--primary))', '#f59e0b', '#64748b']

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
} as const

/** Score distribution across submitted candidates (10 buckets). */
export function ScoreHistogram({ rows }: { rows: ChartRow[] }) {
  const { t } = useT()
  const data = useMemo(() => {
    const buckets = new Array(10).fill(0)
    for (const r of rows) {
      if (r.score == null) continue
      const b = Math.min(9, Math.max(0, Math.floor(r.score / 10)))
      buckets[b]++
    }
    return BUCKET_LABELS.map((label, i) => ({ range: label, candidates: buckets[i] }))
  }, [rows])
  const total = data.reduce((s, d) => s + d.candidates, 0)
  if (total === 0) return null
  return (
    <Card className="rounded-2xl p-5">
      <p className="text-sm font-semibold mb-1">{t('exam.scoreDistribution')}</p>
      <p className="text-xs text-muted-foreground mb-3">{t('exam.totalSubmittedScore', { total })}</p>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="range" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval={1} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="candidates" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

/** Funnel: where every invited candidate stands right now. */
export function StatusDonut({ rows }: { rows: ChartRow[] }) {
  const { t } = useT()
  const data = useMemo(() => {
    let gradedReleased = 0
    let gradedPending = 0
    let awaiting = 0
    let noSubmit = 0
    for (const r of rows) {
      if (r.score == null) { noSubmit++; continue }
      if (!r.graded) { awaiting++; continue }
      if (r.released) gradedReleased++
      else gradedPending++
    }
    return [
      { name: 'Released', value: gradedReleased, color: DONUT_COLORS[0] },
      { name: 'Graded · unreleased', value: gradedPending, color: DONUT_COLORS[1] },
      { name: 'Awaiting grading', value: awaiting, color: DONUT_COLORS[2] },
      { name: 'No submission', value: noSubmit, color: DONUT_COLORS[3] },
    ].filter((d) => d.value > 0)
  }, [rows])
  if (data.length === 0) return null
  return (
    <Card className="rounded-2xl p-5">
      <p className="text-sm font-semibold mb-1">{t('exam.candidateFunnel')}</p>
      <p className="text-xs text-muted-foreground mb-3">{t('exam.countTotalInvited', { count: rows.length })}</p>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

/** Per-question average (graded answers only) — spots too-hard/too-easy outliers. */
export function QuestionBars({ stats }: { stats: QuestionStat[] }) {
  const { t } = useT()
  const data = useMemo(
    () =>
      stats.map((s, i) => ({
        name: `Q${i + 1}`,
        title: s.title,
        avg: s.avgPct,
        ungraded: s.answered - s.graded,
      })),
    [stats]
  )
  if (data.length === 0 || data.every((d) => d.avg == null)) return null
  return (
    <Card className="rounded-2xl p-5 md:col-span-2">
      <p className="text-sm font-semibold mb-1">{t('exam.questionDifficulty')}</p>
      <p className="text-xs text-muted-foreground mb-3">{t('exam.averageScorePerQuestionGradedAnswersfc0')}</p>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={36} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: unknown, name: unknown, props: any) => [
                value == null ? 'ungraded' : `${value}%`,
                props?.payload?.title || String(name),
              ]}
            />
            <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.avg == null ? '#64748b' : d.avg < 40 ? '#f43f5e' : d.avg < 70 ? '#f59e0b' : '#16a34a'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
