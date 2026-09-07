'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  Calendar,
  MapPin,
  Star,
  Briefcase,
  TrendingUp,
  MessageSquare,
  Lightbulb,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CompanyEntry } from '@/lib/companies/company-catalog'

type Tab = 'overview' | 'process' | 'questions' | 'tips'

const TABS: { id: Tab; label: string; icon: typeof Building2 }[] = [
  { id: 'overview', label: 'Overview', icon: Building2 },
  { id: 'process', label: 'Interview Process', icon: Calendar },
  { id: 'questions', label: 'Practice Questions', icon: Briefcase },
  { id: 'tips', label: 'Tips', icon: Lightbulb },
]

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-500/10 text-green-700 dark:text-green-400',
  medium: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  hard: 'bg-red-500/10 text-red-700 dark:text-red-400',
}

export function CompanyDetail({ company }: { company: CompanyEntry }) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
        {/* Back */}
        <Link
          href="/companies"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> All Companies
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-muted text-3xl">
            {company.logo}
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{company.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" /> {company.industry}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {company.headquarters}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> Founded {company.founded}
              </span>
              <span className="flex items-center gap-1 text-amber-500">
                <Star className="h-3.5 w-3.5" /> {company.glassdoor.toFixed(1)} Glassdoor
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Tech Stack */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Tech Stack</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {company.techStack.map(tech => (
                    <span
                      key={tech}
                      className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Difficulty Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Difficulty Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {([
                    { label: 'Easy', value: company.difficultyDistribution.easy, color: 'bg-green-500' },
                    { label: 'Medium', value: company.difficultyDistribution.medium, color: 'bg-yellow-500' },
                    { label: 'Hard', value: company.difficultyDistribution.hard, color: 'bg-red-500' },
                  ] as const).map(d => (
                    <div key={d.label} className="flex items-center gap-3">
                      <span className="w-16 text-sm font-medium">{d.label}</span>
                      <div className="flex-1 overflow-hidden rounded-full bg-muted h-3">
                        <div
                          className={`${d.color} h-full rounded-full transition-all`}
                          style={{ width: `${d.value}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-sm text-muted-foreground">{d.value}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Salary + Quick Facts */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardContent className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
                    <TrendingUp className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Salary Range</p>
                    <p className="text-lg font-semibold">{company.salaryRange}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
                    <Star className="h-6 w-6 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Glassdoor Rating</p>
                    <p className="text-lg font-semibold">{company.glassdoor.toFixed(1)} / 5.0</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'process' && (
          <div className="space-y-4">
            {company.interviewProcess.map((step, i) => (
              <Card key={i}>
                <CardContent>
                  <div className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold">{step.step}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                      <div className="mt-3 rounded-lg bg-primary/5 p-3 text-sm">
                        <span className="font-medium text-primary">Tip: </span>
                        {step.tip}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {activeTab === 'questions' && (
          <div className="space-y-4">
            {company.sampleQuestions.map((q, i) => (
              <Card key={i}>
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-medium">{q.question}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{q.category}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${DIFFICULTY_COLORS[q.difficulty]}`}
                    >
                      {q.difficulty}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
            <div className="pt-4 text-center">
              <Button asChild>
                <Link href="/dashboard/mock-tests">
                  Start AI Mock Interview for {company.name}
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'tips' && (
          <div className="space-y-4">
            {company.tips.map((tip, i) => (
              <Card key={i}>
                <CardContent>
                  <div className="flex gap-3">
                    <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <p className="text-sm leading-relaxed">{tip}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
            <div className="pt-4 text-center">
              <Button asChild>
                <Link href="/dashboard/interviews/ai-mock/setup">
                  Start AI Mock Interview for {company.name}
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
