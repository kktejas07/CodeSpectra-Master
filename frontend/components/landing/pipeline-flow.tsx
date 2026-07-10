'use client'

import { useEffect, useRef, useState } from 'react'
import { CodeXml, GitBranch, Scan, Trophy, GraduationCap, Briefcase } from 'lucide-react'
import type { ReactNode } from 'react'

type PipelineStep = {
  icon: ReactNode
  title: string
  description: string
}

const steps: PipelineStep[] = [
  {
    icon: <CodeXml className="h-5 w-5" />,
    title: 'Write Code',
    description: 'Push your projects or solve challenges in the workspace',
  },
  {
    icon: <Scan className="h-5 w-5" />,
    title: 'Analyze & Scan',
    description: 'Automated quality checks catch issues and anti-patterns',
  },
  {
    icon: <GitBranch className="h-5 w-5" />,
    title: 'Learn & Fix',
    description: 'AI-guided explanations help you understand every finding',
  },
  {
    icon: <Trophy className="h-5 w-5" />,
    title: 'Practice & Compete',
    description: 'Reinforce skills with challenges and arena sessions',
  },
  {
    icon: <GraduationCap className="h-5 w-5" />,
    title: 'Certify & Grow',
    description: 'Earn certificates, train for interviews, explore roles',
  },
  {
    icon: <Briefcase className="h-5 w-5" />,
    title: 'Advance Career',
    description: 'Build your profile with verified skills and credentials',
  },
]

function FlowArrow({ index, total, containerRef }: { index: number; total: number; containerRef: React.RefObject<HTMLDivElement | null> }) {
  const pathRef = useRef<SVGPathElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const [pathLength, setPathLength] = useState(0)

  useEffect(() => {
    const el = pathRef.current
    if (!el) return
    setPathLength(el.getTotalLength())
  }, [])

  if (index >= total - 1) return null

  return (
    <div className="relative flex items-center justify-center py-1 sm:py-2">
      <svg
        className="h-8 w-full sm:h-10"
        viewBox="0 0 120 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <path
          ref={pathRef}
          d="M0 16 C 30 16, 50 2, 80 2 C 100 2, 110 10, 120 16 C 110 22, 100 30, 80 30 C 50 30, 30 16, 0 16"
          stroke="hsl(var(--primary) / 0.2)"
          strokeWidth="1.5"
          fill="none"
          strokeDasharray="4 4"
          className="dark:opacity-60"
        />
        <circle r="2.5" fill="hsl(var(--primary) / 0.5)" className="dark:opacity-80">
          <animateMotion dur={`${2 + index * 0.3}s`} repeatCount="indefinite">
            <mpath href={`#flow-path-${index}`} />
          </animateMotion>
        </circle>
        <defs>
          <path
            id={`flow-path-${index}`}
            d="M0 16 C 30 16, 50 2, 80 2 C 100 2, 110 10, 120 16 C 110 22, 100 30, 80 30 C 50 30, 30 16, 0 16"
          />
        </defs>
      </svg>
    </div>
  )
}

export function PipelineFlow() {
  const sectionRef = useRef<HTMLElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
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
    }, 2200)
    return () => clearInterval(interval)
  }, [visible])

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden border-t border-border/40 py-24 lg:py-32"
    >
      {/* Subtle background grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02] dark:opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          data-reveal
          data-revealed={visible ? 'true' : 'false'}
          className="mb-14 text-center lg:mb-20"
        >
          <span className="mb-6 inline-flex items-center gap-3 font-mono text-sm text-muted-foreground">
            <span className="h-px w-8 bg-border" />
            Pipeline
            <span className="h-px w-8 bg-border" />
          </span>
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            From code to career.
            <br />
            <span className="text-muted-foreground">A continuous loop.</span>
          </h2>
        </div>

        <div
          ref={containerRef}
          className="mx-auto flex max-w-5xl flex-col items-center"
        >
          {steps.map((step, i) => (
            <div key={i} className="w-full max-w-lg">
              <div
                className={`group relative rounded-xl border p-5 transition-all duration-500 sm:p-6 ${
                  visible
                    ? 'translate-y-0 opacity-100'
                    : 'translate-y-8 opacity-0'
                } ${
                  activeStep === i
                    ? 'border-primary/40 bg-primary/[0.03] shadow-lg shadow-primary/5'
                    : 'border-border/40 bg-card/30 hover:border-primary/20 hover:bg-primary/[0.01]'
                }`}
                style={{
                  transitionDelay: `${i * 120}ms`,
                }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-all duration-500 ${
                      activeStep === i
                        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                        : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                    }`}
                  >
                    {step.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-medium text-muted-foreground/50 sm:text-xs">
                        STEP {String(i + 1).padStart(2, '0')}
                      </span>
                      {activeStep === i && (
                        <span className="inline-flex gap-1">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" style={{ animationDelay: '300ms' }} />
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" style={{ animationDelay: '600ms' }} />
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 text-base font-semibold tracking-tight sm:text-lg">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>

                {/* Active indicator bar */}
                <div
                  className={`-bottom-px left-0 h-0.5 rounded-full bg-primary transition-all duration-700 ${
                    activeStep === i ? 'w-full' : 'w-0'
                  }`}
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                  }}
                />
              </div>

              {/* Animated connector arrow between steps */}
              {i < steps.length - 1 && (
                <div className="flex justify-center py-2">
                  <div className="relative flex h-8 w-8 items-center justify-center sm:h-10 sm:w-10">
                    <svg
                      className="h-6 w-6 sm:h-7 sm:w-7"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="hsl(var(--primary) / 0.25)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                    {activeStep === i && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div
                          className="h-2 w-2 animate-ping rounded-full bg-primary/40"
                          style={{ animationDuration: '1.5s' }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Flow line indicators */}
        <div
          data-reveal
          data-revealed={visible ? 'true' : 'false'}
          className="mt-12 text-center"
        >
          <div className="inline-flex items-center gap-3 rounded-full border border-border/30 bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Auto-advancing
            <span className="font-mono text-[10px] text-muted-foreground/50">
              Step <span className="tabular-nums text-muted-foreground/70">{activeStep + 1}</span> / {steps.length}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
