'use client'

import { useEffect, useRef, useState } from 'react'
import { CodeXml, GitBranch, Scan, Trophy, GraduationCap, Briefcase, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PipelineStep = {
  num: string
  icon: ReactNode
  title: string
  description: string
  tag: string
  snippet: string
  color: string
}

const steps: PipelineStep[] = [
  {
    num: '01',
    icon: <CodeXml className="h-5 w-5" />,
    title: 'Write Code',
    description: 'Push your repositories or solve assignments in the workspace',
    tag: 'IDE & REPO',
    snippet: `export async function build() {\n  return await workspace.compile()\n}`,
    color: 'from-teal-500/20 to-emerald-500/20',
  },
  {
    num: '02',
    icon: <Scan className="h-5 w-5" />,
    title: 'Analyze & Scan',
    description: 'Automated quality checks catch issues and anti-patterns',
    tag: 'STATIC SCAN',
    snippet: `✓ 0 Critical Errors\n✓ 100% Type Coverage verified`,
    color: 'from-emerald-500/20 to-cyan-500/20',
  },
  {
    num: '03',
    icon: <GitBranch className="h-5 w-5" />,
    title: 'Learn & Fix',
    description: 'AI-guided explanations help you understand every finding',
    tag: 'AI ASSISTANT',
    snippet: `AI Suggestion: Refactor array iteration to map() for 3.2x speedup`,
    color: 'from-cyan-500/20 to-blue-500/20',
  },
  {
    num: '04',
    icon: <Trophy className="h-5 w-5" />,
    title: 'Practice & Compete',
    description: 'Reinforce skills with challenges and arena sessions',
    tag: 'ARENA & PRACTICE',
    snippet: `Arena Rank #14 · 98% Test Cases Passed`,
    color: 'from-blue-500/20 to-purple-500/20',
  },
  {
    num: '05',
    icon: <GraduationCap className="h-5 w-5" />,
    title: 'Certify & Grow',
    description: 'Earn certificates, train for interviews, explore roles',
    tag: 'VERIFIED CERT',
    snippet: `Certificate Issued: Senior TypeScript Engineer (ID: 0924)`,
    color: 'from-purple-500/20 to-pink-500/20',
  },
  {
    num: '06',
    icon: <Briefcase className="h-5 w-5" />,
    title: 'Advance Career',
    description: 'Build your profile with verified skills and credentials',
    tag: 'CAREER LOOP',
    snippet: `Profile Active: 12 Scans · 3 Certs · Ready for Hire`,
    color: 'from-pink-500/20 to-teal-500/20',
  },
]

export function PipelineFlow() {
  const sectionRef = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          io.unobserve(el)
        }
      },
      { threshold: 0.2 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length)
    }, 2800)
    return () => clearInterval(interval)
  }, [visible])

  const active = steps[activeStep]

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      className="relative overflow-hidden border-t border-slate-800/80 bg-[#060912] py-24 lg:py-32 scroll-mt-24"
    >
      {/* Background Ambient Grid & Radial Glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0, 197, 115, 0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 197, 115, 0.12) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[800px] rounded-full bg-gradient-radial from-teal-500/10 via-emerald-500/5 to-transparent blur-3xl" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center max-w-3xl mx-auto">
          <span className="text-xs font-mono font-bold text-teal-400 tracking-widest uppercase mb-3 block">
            PIPELINE FLOW
          </span>
          <h2 className="text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl mb-4 leading-tight">
            From code to career.
            <br />
            <span className="text-slate-300 font-normal">A continuous loop.</span>
          </h2>
          <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
            Every line of code you write feeds into automated scans, AI learning loops, skill challenges, and career credentials.
          </p>
        </div>

        {/* 6 Step Grid + Interactive Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center max-w-6xl mx-auto">
          {/* Step Cards List (7 Cols) */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {steps.map((step, i) => {
              const isActive = activeStep === i
              return (
                <button
                  key={step.num}
                  onClick={() => setActiveStep(i)}
                  className={cn(
                    'group relative rounded-xl border p-4 text-left transition-all duration-300 overflow-hidden cursor-pointer',
                    isActive
                      ? 'border-teal-500/60 bg-[#0d1626] shadow-xl shadow-teal-500/10 scale-[1.02]'
                      : 'border-slate-800/90 bg-[#090d16]/80 hover:border-slate-700 hover:bg-[#0b101c]'
                  )}
                >
                  {/* Subtle top indicator bar for active item */}
                  <div
                    className={cn(
                      'absolute top-0 left-0 right-0 h-0.5 bg-linear-to-r from-teal-400 to-emerald-400 transition-all duration-300',
                      isActive ? 'opacity-100' : 'opacity-0'
                    )}
                  />

                  <div className="flex items-start gap-3.5">
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                        isActive
                          ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                          : 'bg-slate-900 text-slate-400 border border-slate-800 group-hover:text-slate-200'
                      )}
                    >
                      {step.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-mono text-[10px] font-semibold text-slate-400">
                          {step.num}
                        </span>
                        <span className="text-[9px] font-mono font-medium text-teal-400/80 bg-teal-950/60 px-1.5 py-0.5 rounded border border-teal-900/40">
                          {step.tag}
                        </span>
                      </div>
                      <h3 className={cn("text-sm font-bold transition-colors", isActive ? "text-white" : "text-slate-200")}>
                        {step.title}
                      </h3>
                      <p className="mt-1 text-xs text-slate-400 line-clamp-2 leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Active Step Real-time Terminal / Code Snippet Preview (5 Cols) */}
          <div className="lg:col-span-5">
            <div className="relative rounded-2xl border border-slate-800 bg-[#080d18] p-6 shadow-2xl overflow-hidden min-h-85 flex flex-col justify-between">
              {/* Radial color backdrop for active step */}
              <div className={cn("absolute inset-0 bg-linear-to-br opacity-40 pointer-events-none transition-all duration-500", active.color)} />

              <div>
                <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-800/80 mb-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-teal-400 animate-ping" />
                    <span className="font-mono text-xs font-bold text-teal-300 uppercase tracking-wider">
                      STEP {active.num} · {active.tag}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    Live Status
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white mb-2">
                  {active.title}
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed mb-6">
                  {active.description}
                </p>
              </div>

              {/* Code Snippet Box */}
              <div className="relative rounded-xl border border-slate-800/90 bg-[#04070e] p-4 font-mono text-xs text-teal-300">
                <div className="text-slate-400 text-[10px] mb-2 flex items-center justify-between">
                  <span>// live output snippet</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                </div>
                <div className="whitespace-pre-wrap text-slate-200 font-mono text-xs">
                  {active.snippet}
                </div>
              </div>

              {/* Step indicator footer */}
              <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>Loop progress</span>
                <span className="text-teal-400 font-bold">{activeStep + 1} of {steps.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Auto-advancing indicator pill */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-3 rounded-full border border-slate-800 bg-slate-900/90 px-4 py-2 text-xs text-slate-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-400" />
            </span>
            Continuous loop active
            <span className="font-mono text-[10px] text-slate-400">
              Step <span className="tabular-nums text-teal-300 font-bold">{activeStep + 1}</span> / {steps.length}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
