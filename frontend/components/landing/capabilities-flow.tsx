'use client'

import { useEffect, useRef, useState } from 'react'
import { CapabilityIllustration } from '@/components/landing/capability-illustration'

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

function FlowConnector({ active }: { active: boolean }) {
  return (
    <div className="flex justify-center py-1 sm:py-2">
      <div className="relative flex h-7 w-7 items-center justify-center sm:h-9 sm:w-9">
        <svg
          className="h-5 w-5 sm:h-6 sm:w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="hsl(var(--primary) / 0.25)"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
        {active && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-2 w-2 animate-ping rounded-full bg-primary/30" style={{ animationDuration: '1.5s' }} />
          </div>
        )}
      </div>
    </div>
  )
}

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
    }, 2500)
    return () => clearInterval(interval)
  }, [visible])

  return (
    <section
      ref={sectionRef}
      id="capabilities"
      className="scroll-mt-24 border-b border-border/40 py-24 lg:py-32 relative overflow-hidden"
    >
      {/* Subtle background pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02] dark:opacity-[0.03]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          data-reveal
          data-revealed={visible ? 'true' : 'false'}
          className="mb-14 max-w-3xl lg:mb-20"
        >
          <span className="mb-6 inline-flex items-center gap-3 font-mono text-sm text-muted-foreground">
            <span className="h-px w-8 bg-border" />
            Capabilities
          </span>
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Everything you need.
            <br />
            <span className="text-muted-foreground">Nothing you don&apos;t.</span>
          </h2>
        </div>

        {/* Flow indicator */}
        <div
          data-reveal
          data-revealed={visible ? 'true' : 'false'}
          className="mb-8 flex items-center justify-center gap-3 sm:mb-10"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/30 bg-muted/30 px-3 py-1 font-mono text-[10px] text-muted-foreground sm:text-xs">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Learning flow
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/50 sm:text-xs">
            Step <span className="tabular-nums text-muted-foreground/70">{activeStep + 1}</span> / {capabilities.length}
          </span>
        </div>

        <div className="mx-auto flex max-w-3xl flex-col items-center">
          {capabilities.map((cap, i) => {
            const isActive = i === activeStep
            return (
              <div key={cap.number} className="w-full">
                <div
                  className={`group relative rounded-xl border p-5 transition-all duration-700 sm:p-6 ${
                    visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
                  } ${
                    isActive
                      ? 'border-primary/40 bg-primary/[0.03] shadow-lg shadow-primary/5'
                      : 'border-border/40 bg-card/30 hover:border-primary/20 hover:bg-primary/[0.01]'
                  }`}
                  style={{ transitionDelay: `${i * 150}ms` }}
                >
                  <div className="flex items-start gap-4 sm:gap-5">
                    {/* Number badge */}
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold transition-all duration-500 sm:h-12 sm:w-12 sm:text-base ${
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                          : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                      }`}
                    >
                      {cap.number}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3
                          className={`text-lg font-semibold tracking-tight transition-colors sm:text-xl lg:text-2xl ${
                            isActive ? 'text-foreground' : 'text-foreground/90'
                          }`}
                        >
                          {cap.title}
                        </h3>
                        {isActive && (
                          <span className="inline-flex gap-1">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                            <span
                              className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"
                              style={{ animationDelay: '300ms' }}
                            />
                            <span
                              className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"
                              style={{ animationDelay: '600ms' }}
                            />
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                        {cap.description}
                      </p>
                    </div>

                    {/* Illustration */}
                    <div className="hidden shrink-0 sm:block">
                      <CapabilityIllustration
                        variant={cap.number as '01' | '02' | '03' | '04'}
                        className={`h-14 w-20 transition-all duration-500 md:h-18 md:w-28 ${
                          isActive ? 'opacity-100 scale-110' : 'opacity-60 scale-100'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Active indicator bar */}
                  <div
                    className={`absolute bottom-0 left-0 h-0.5 rounded-full bg-primary transition-all duration-700 ${
                      isActive ? 'w-full' : 'w-0'
                    }`}
                  />
                </div>

                {/* Animated connector */}
                {i < capabilities.length - 1 && <FlowConnector active={isActive} />}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
