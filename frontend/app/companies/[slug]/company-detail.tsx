'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  Calendar,
  MapPin,
  Briefcase,
  MessageSquare,
  Lightbulb,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CompanyEntry } from '@/lib/companies/company-catalog'
import { CompanyPractice } from './company-practice'

type Tab = 'overview' | 'process' | 'questions' | 'tips'

const TABS: { id: Tab; label: string; icon: typeof Building2 }[] = [
  { id: 'overview', label: 'Overview', icon: Building2 },
  { id: 'process', label: 'Interview process', icon: Calendar },
  { id: 'questions', label: 'Practice questions', icon: Briefcase },
  { id: 'tips', label: 'Tips', icon: Lightbulb },
]

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-500/10 text-green-700 dark:text-green-400',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  hard: 'bg-red-500/10 text-red-700 dark:text-red-400',
}

export function CompanyDetail({ company }: { company: CompanyEntry }) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  return (
    <div>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        {/* Back */}
        <Link
          href="/companies"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-cs-ink-soft transition-colors hover:text-cs-accent-text"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> All companies
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-cs-accent/10 text-3xl" aria-hidden>
            {company.logo}
          </div>
          <div>
            <h1 className="cs-display text-4xl sm:text-5xl">{company.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-cs-ink-soft">
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" /> {company.industry}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {company.headquarters}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> Founded {company.founded}
              </span>
            </div>
          </div>
        </div>

        {company.verifyNote ? (
          <p className="mb-6 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">{company.verifyNote}</p>
        ) : null}

        {/* Tabs */}
        <div className="mb-6 flex gap-1 overflow-x-auto border-b border-cs-grid" role="tablist" aria-label={`${company.name} interview prep`}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors duration-200 ${
                activeTab === tab.id
                  ? 'border-cs-accent text-cs-accent-text'
                  : 'border-transparent text-cs-ink-soft hover:text-cs-ink'
              }`}
            >
              <tab.icon className="h-4 w-4" aria-hidden />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <CompanyPractice companySlug={company.slug} companyName={company.name} />
            {/* Tech Stack */}
            <section className="rounded-3xl border border-cs-grid bg-cs-sheet p-6 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] dark:shadow-none">
              <h2 className="mb-4 text-lg font-bold text-cs-ink">Tech stack</h2>
              <div>
                <div className="flex flex-wrap gap-2">
                  {company.techStack.map(tech => (
                    <span
                      key={tech}
                      className="rounded-full bg-cs-accent/10 px-3 py-1 text-sm font-semibold text-cs-accent-text"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            {/* Difficulty Distribution */}
            <section className="rounded-3xl border border-cs-grid bg-cs-sheet p-6 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] dark:shadow-none">
              <h2 className="mb-1 text-lg font-bold text-cs-ink">Difficulty mix</h2>
              <p className="mb-4 text-sm text-cs-ink-soft">An editorial estimate, not measured data.</p>
              <div>
                <div className="space-y-3">
                  {([
                    { label: 'Easy', value: company.difficultyDistribution.easy, color: 'bg-green-500' },
                    { label: 'Medium', value: company.difficultyDistribution.medium, color: 'bg-amber-500' },
                    { label: 'Hard', value: company.difficultyDistribution.hard, color: 'bg-red-500' },
                  ] as const).map(d => (
                    <div key={d.label} className="flex items-center gap-3">
                      <span className="w-16 text-sm font-medium text-cs-ink">{d.label}</span>
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-cs-grid" aria-hidden>
                        <div
                          className={`${d.color} h-full rounded-full`}
                          style={{ width: `${d.value}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-sm tabular-nums text-cs-ink-soft">{d.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'process' && (
          <div className="space-y-4">
            {company.interviewProcess.map((step, i) => (
              <div key={i} className="rounded-3xl border border-cs-grid bg-cs-sheet p-6 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] dark:shadow-none">
                <div>
                  <div className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cs-accent text-sm font-bold tabular-nums text-cs-accent-ink">
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold tracking-tight text-cs-ink">{step.step}</h3>
                      <p className="mt-1 text-sm text-cs-ink-soft">{step.description}</p>
                      <div className="mt-3 rounded-xl bg-cs-accent/5 p-3 text-sm text-cs-ink">
                        <span className="font-semibold text-cs-accent-text">Tip: </span>
                        {step.tip}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'questions' && (
          <div className="space-y-4">
            {company.sampleQuestions.map((q, i) => (
              <div key={i} className="rounded-3xl border border-cs-grid bg-cs-sheet p-6 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] dark:shadow-none">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-medium text-cs-ink">{q.question}</p>
                      <p className="mt-1 text-sm text-cs-ink-soft">{q.category}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${DIFFICULTY_COLORS[q.difficulty]}`}
                    >
                      {q.difficulty}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            <div className="pt-4 text-center">
              <Button asChild>
                <Link href="/dashboard/interviews/ai-mock/setup">
                  Start AI mock interview for {company.name}
                  <ChevronRight className="ml-2 h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'tips' && (
          <div className="space-y-4">
            {company.tips.map((tip, i) => (
              <div key={i} className="rounded-3xl border border-cs-grid bg-cs-sheet p-6 shadow-[0_1px_2px_rgba(15,23,41,0.04),0_8px_24px_-12px_rgba(15,23,41,0.10)] dark:shadow-none">
                <div>
                  <div className="flex gap-3">
                    <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-cs-accent-text" aria-hidden />
                    <p className="text-[15px] leading-relaxed text-cs-ink">{tip}</p>
                  </div>
                </div>
              </div>
            ))}
            <div className="pt-4 text-center">
              <Button asChild>
                <Link href="/dashboard/interviews/ai-mock/setup">
                  Start AI mock interview for {company.name}
                  <ChevronRight className="ml-2 h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
