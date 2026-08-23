'use client'

import { useEffect, useRef, useState } from 'react'
import { CapabilityIllustration } from '@/components/landing/capability-illustration'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

type Capability = { number: string; title: string; description: string }

const capabilities: Capability[] = [
  {
    number: '01',
    title: 'Understand the code you write',
    description:
      'Run scans on your work, review findings by severity, and use quality gates so you learn what to fix before it ships.',
  },
  {
    number: '02',
    title: 'Practice until it sticks',
    description:
      'Work through challenges, join arena-style sessions, and climb the leaderboard as you sharpen problem-solving skills.',
  },
  {
    number: '03',
    title: 'Learn with structure',
    description:
      'Follow learning paths, take exams to validate knowledge, and see your progress as you grow from lesson to lesson.',
  },
  {
    number: '04',
    title: 'Prepare for real interviews',
    description:
      'Train with dynamic interviews, capture feedback, polish your resume, explore roles, and earn certificates that reflect what you completed.',
  },
]

export function CapabilitiesFlow() {
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
      { threshold: 0.15 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % capabilities.length)
    }, 2800)
    return () => clearInterval(interval)
  }, [visible])

  return (
    <section
      ref={sectionRef}
      id="capabilities"
      className="scroll-mt-24 border-b border-slate-800/80 bg-[#060912] py-16 sm:py-20 lg:py-24 relative overflow-hidden"
    >
      {/* Background Grid Lines & Ambient Glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0, 197, 115, 0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 197, 115, 0.12) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[700px] rounded-full bg-gradient-radial from-teal-500/10 via-emerald-500/5 to-transparent blur-3xl" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          data-reveal
          data-revealed={visible ? 'true' : 'false'}
          className="mb-10 text-center max-w-3xl mx-auto"
        >
          <span className="text-xs font-mono font-bold text-teal-400 tracking-widest uppercase mb-3 block">
            CAPABILITIES
          </span>
          <h2 className="text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl mb-3 leading-tight">
            Everything you need.
            <br />
            <span className="text-slate-300 font-normal">Nothing you don&apos;t.</span>
          </h2>
        </div>

        {/* 2x2 Compact Grid Layout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 lg:gap-6 max-w-5xl mx-auto">
          {capabilities.map((cap, i) => {
            const isActive = i === activeStep
            return (
              <button
                key={cap.number}
                onClick={() => setActiveStep(i)}
                className={cn(
                  'group relative rounded-2xl border p-6 text-left transition-all duration-300 overflow-hidden cursor-pointer flex flex-col justify-between min-h-[200px]',
                  isActive
                    ? 'border-teal-500/60 bg-[#0d1626] shadow-xl shadow-teal-500/10 scale-[1.01]'
                    : 'border-slate-800/90 bg-[#090d16]/90 hover:border-slate-700 hover:bg-[#0b101c]'
                )}
              >
                {/* Active Indicator Bar */}
                <div
                  className={cn(
                    'absolute top-0 left-0 right-0 h-0.5 bg-linear-to-r from-teal-400 to-emerald-400 transition-all duration-300',
                    isActive ? 'opacity-100' : 'opacity-0'
                  )}
                />

                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold transition-colors',
                        isActive
                          ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                      )}
                    >
                      {cap.number}
                    </div>
                    <h3 className={cn("text-base sm:text-lg font-bold transition-colors", isActive ? "text-white" : "text-slate-200")}>
                      {cap.title}
                    </h3>
                  </div>

                  {/* Illustration */}
                  <CapabilityIllustration
                    variant={cap.number as '01' | '02' | '03' | '04'}
                    className={cn(
                      'h-12 w-16 shrink-0 transition-all duration-300',
                      isActive ? 'opacity-100 scale-105' : 'opacity-50 scale-100'
                    )}
                  />
                </div>

                <p className="mt-4 text-xs sm:text-sm leading-relaxed text-slate-300">
                  {cap.description}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Learning module</span>
                  <span className={cn(isActive ? "text-teal-400 font-bold" : "text-slate-500")}>
                    {isActive ? '● Active' : 'Select'}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
