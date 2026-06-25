'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ProcessStep = {
  numeral: string
  title: string
  description: string
  /** Shown in the code panel tab (real paths in this repo). */
  filename?: string
  code: string
  footerStatus: string
}

/** Typing speed (ms per character). Lower = faster. */
const TYPING_MS_PER_CHAR = 5

/** Pause after the last character before advancing (lets users read the full snippet). */
const STEP_TAIL_MS = 900

/** Floor / ceiling for step length so short snippets still feel deliberate. */
const STEP_MIN_MS = 4200
const STEP_MAX_MS = 22000

function stepDurationForCode(code: string): number {
  const n = code.length
  const typingBudget = n * TYPING_MS_PER_CHAR
  return Math.min(STEP_MAX_MS, Math.max(STEP_MIN_MS, typingBudget + STEP_TAIL_MS))
}

const KEYWORDS = new Set([
  'import',
  'export',
  'default',
  'async',
  'await',
  'return',
  'const',
  'let',
  'from',
  'true',
  'false',
  'new',
  'typeof',
  'function',
  'if',
  'else',
  'try',
  'catch',
  'method',
  'POST',
  'GET',
  'body',
  'JSON',
  'stringify',
  'parse',
])

/** Syntax on dark code surface — blues + emerald strings (brand-aligned). */
function highlightLine(line: string, lineIndex: number, showCaret: boolean, isLastLine: boolean): ReactNode {
  const trimmed = line.trimStart()
  if (trimmed.startsWith('//')) {
    return (
      <span key={`c-${lineIndex}`} className="text-zinc-500">
        {line || ' '}
      </span>
    )
  }

  const parts: ReactNode[] = []
  const push = (s: string, cls: string, key: string) => {
    if (!s) return
    parts.push(
      <span key={key} className={cls}>
        {s}
      </span>
    )
  }

  const rest = line
  const stringRe = /('(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`)/g
  let last = 0
  let m: RegExpExecArray | null
  let part = 0
  while ((m = stringRe.exec(rest)) !== null) {
    const before = rest.slice(last, m.index)
    tokenizeNonString(before, parts, lineIndex, part)
    part += 1
    push(m[0], 'text-emerald-400', `s-${lineIndex}-${m.index}`)
    last = m.index + m[0].length
  }
  tokenizeNonString(rest.slice(last), parts, lineIndex, part)
  if (parts.length === 0) push(rest, 'text-sky-200/90', `f-${lineIndex}`)

  return (
    <span key={`ln-${lineIndex}`} className="whitespace-pre-wrap wrap-anywhere">
      {parts}
      {isLastLine && showCaret ? (
        <span className="inline-block h-[1.05em] w-[2px] translate-y-[0.08em] rounded-sm bg-sky-400 align-[-0.12em] shadow-[0_0_12px_rgba(56,189,248,0.55)] animate-pulse" />
      ) : null}
    </span>
  )
}

function tokenizeNonString(chunk: string, parts: ReactNode[], lineIndex: number, basePart: number) {
  if (!chunk) return
  const tokenRe = /(\b\d+\.?\d*\b)|(\b[a-zA-Z_$][\w$]*\b)|([{}()[\];,:.+\-*/%=<>!&|]+)|(\s+)/g
  let last = 0
  let m: RegExpExecArray | null
  let idx = 0
  while ((m = tokenRe.exec(chunk)) !== null) {
    if (m.index > last) {
      parts.push(
        <span key={`x-${lineIndex}-${basePart}-${idx++}`} className="text-sky-100/85">
          {chunk.slice(last, m.index)}
        </span>
      )
    }
    const [full, num, word, sym, ws] = m
    if (num) {
      parts.push(
        <span key={`n-${lineIndex}-${basePart}-${idx++}`} className="text-amber-300/95">
          {full}
        </span>
      )
    } else if (word) {
      const kw = KEYWORDS.has(word)
      parts.push(
        <span
          key={`w-${lineIndex}-${basePart}-${idx++}`}
          className={kw ? 'font-medium text-sky-400' : 'text-cyan-200/90'}
        >
          {full}
        </span>
      )
    } else if (sym) {
      parts.push(
        <span key={`y-${lineIndex}-${basePart}-${idx++}`} className="text-slate-300/85">
          {full}
        </span>
      )
    } else if (ws) {
      parts.push(
        <span key={`z-${lineIndex}-${basePart}-${idx++}`} className="text-sky-100/35">
          {full}
        </span>
      )
    }
    last = m.index + full.length
  }
  if (last < chunk.length) {
    parts.push(
      <span key={`e-${lineIndex}-${basePart}-${idx}`} className="text-sky-100/80">
        {chunk.slice(last)}
      </span>
    )
  }
}

function highlightCode(src: string, showCaret: boolean) {
  if (!src && !showCaret) return null
  const lines = src.length ? src.split('\n') : ['']
  return lines.map((line, i) => {
    const isLast = i === lines.length - 1
    return (
      <div key={`${i}-${line.slice(0, 16)}`} className="table-row">
        <span className="table-cell w-9 shrink-0 pr-2 text-right align-top font-mono text-[11px] text-zinc-600 tabular-nums select-none sm:w-10 sm:pr-3 sm:text-xs">
          {i + 1}
        </span>
        <span className="table-cell min-w-0 w-full align-top font-mono text-[12px] leading-relaxed sm:text-[13px] md:text-sm lg:text-[14px] xl:text-sm">
          {highlightLine(line, i, showCaret && isLast, isLast)}
        </span>
      </div>
    )
  })
}

type ProcessShowcaseProps = {
  steps: ProcessStep[]
  className?: string
}

/**
 * Isolated from parent typing re-renders (`React.memo`) so RAF width updates are not lost.
 * Width-based fill (no `scale-x` + `w-full` conflict).
 */
const StepProgressBar = memo(function StepProgressBar({
  durationMs,
  paused,
  onComplete,
}: {
  durationMs: number
  paused: boolean
  onComplete: () => void
}) {
  const fillRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (paused) {
      return
    }

    let raf = 0
    let elapsed = 0
    let last = Date.now()

    const tick = () => {
      const now = Date.now()
      elapsed += now - last
      last = now

      const p = Math.min(1, elapsed / durationMs)
      const el = fillRef.current
      if (el) {
        el.style.width = `${(p * 100).toFixed(2)}%`
      }

      if (p >= 1) {
        onComplete()
        return
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused, durationMs, onComplete])

  return (
    <div
      className="mt-3 h-px w-full overflow-hidden rounded-full bg-[hsl(var(--marketing-band-fg)/0.14)] sm:mt-4 sm:h-0.5"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext="In progress"
      aria-label="Step timer"
    >
      <div ref={fillRef} className="h-full w-0 rounded-full bg-primary shadow-[0_0_4px_hsl(var(--primary)/0.28)]" />
    </div>
  )
})

export function ProcessShowcase({ steps, className }: ProcessShowcaseProps) {
  const sectionRef = useRef<HTMLElement>(null)

  const [active, setActive] = useState(0)
  const [sectionVisible, setSectionVisible] = useState(true)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [typedCode, setTypedCode] = useState('')
  const [typingDone, setTypingDone] = useState(true)
  const typeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearType = useCallback(() => {
    if (typeTimerRef.current) {
      clearInterval(typeTimerRef.current)
      typeTimerRef.current = null
    }
  }, [])

  const targetCode = steps[active]?.code ?? ''
  const stepDurationMs = useMemo(() => stepDurationForCode(targetCode), [targetCode])

  const advanceStep = useCallback(() => {
    setActive((a) => (a + 1) % steps.length)
  }, [steps.length])

  const pickStep = useCallback(
    (index: number) => {
      if (index < 0 || index >= steps.length) return
      setActive(index)
    },
    [steps.length]
  )

  useEffect(() => {
    clearType()
    setTypedCode('')
    setTypingDone(false)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setTypedCode(targetCode)
      setTypingDone(true)
      return
    }

    let i = 0
    typeTimerRef.current = setInterval(() => {
      i += 1
      setTypedCode(targetCode.slice(0, i))
      if (i >= targetCode.length) {
        if (typeTimerRef.current) clearInterval(typeTimerRef.current)
        typeTimerRef.current = null
        setTypingDone(true)
      }
    }, TYPING_MS_PER_CHAR)

    return () => clearType()
  }, [active, targetCode, clearType])

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => setSectionVisible(e.isIntersecting),
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setPrefersReducedMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const step = steps[active] ?? steps[0]

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      className={cn(
        'relative scroll-mt-24 overflow-hidden bg-[hsl(var(--marketing-band-bg))] py-12 text-[hsl(var(--marketing-band-fg))] sm:py-14 lg:py-16',
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035] text-[hsl(var(--marketing-band-fg))]"
        aria-hidden
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(-45deg, transparent, transparent 40px, currentcolor 40px, currentcolor 41px)',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mb-10 text-center sm:mb-12 lg:mb-14">
          <span className="mb-4 inline-flex items-center justify-center gap-3 font-mono text-xs text-[hsl(var(--marketing-band-fg)/0.45)] sm:mb-5 sm:text-sm">
            <span className="h-px w-6 bg-[hsl(var(--marketing-band-fg)/0.25)] sm:w-8" />
            Process
            <span className="h-px w-6 bg-[hsl(var(--marketing-band-fg)/0.25)] sm:w-8" />
          </span>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl xl:text-6xl">
            Three steps.
            <br />
            <span className="text-[hsl(var(--marketing-band-fg)/0.45)]">Infinite possibilities.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-pretty text-xs leading-relaxed text-[hsl(var(--marketing-band-fg)/0.5)] sm:mt-4 sm:text-sm">
            The timer matches each code sample: the bar fills while the snippet types, pauses briefly when complete, then
            advances (looping while this section is in view). Tap a step to jump and restart.
          </p>
        </header>

        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-stretch gap-8 sm:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.18fr)] lg:items-center lg:gap-10 xl:gap-14">
          {/* Steps — second on mobile so code shows first */}
          <div className="order-2 min-w-0 space-y-0 self-start lg:order-1">
            {steps.map((s, i) => {
              const on = i === active
              return (
                <button
                  key={s.numeral}
                  type="button"
                  onClick={() => pickStep(i)}
                  className={cn(
                    'w-full border-b border-[hsl(var(--marketing-band-fg)/0.1)] py-5 text-left transition-opacity duration-300 sm:py-6',
                    on ? 'opacity-100' : 'opacity-[0.38] hover:opacity-[0.72]'
                  )}
                >
                  <div className="flex items-start gap-4 sm:gap-5">
                    <span
                      className={cn(
                        'shrink-0 font-serif text-2xl tabular-nums transition-colors sm:text-3xl lg:text-4xl',
                        on ? 'text-[hsl(var(--marketing-band-fg)/0.88)]' : 'text-[hsl(var(--marketing-band-fg)/0.28)]'
                      )}
                    >
                      {s.numeral}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3
                        className={cn(
                          'text-lg font-semibold tracking-tight sm:text-xl lg:text-2xl xl:text-3xl',
                          on && 'text-[hsl(var(--marketing-band-fg)/0.98)]'
                        )}
                      >
                        {s.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--marketing-band-fg)/0.58)] sm:text-[15px]">
                        {s.description}
                      </p>
                      {on ? (
                        prefersReducedMotion ? (
                          <div
                            className="mt-3 h-px w-full overflow-hidden rounded-full bg-[hsl(var(--marketing-band-fg)/0.14)] sm:mt-4 sm:h-0.5"
                            role="progressbar"
                            aria-valuetext="Complete"
                            aria-label={`Step ${s.numeral} progress`}
                          >
                            <div className="h-full w-full rounded-full bg-primary shadow-[0_0_4px_hsl(var(--primary)/0.28)]" />
                          </div>
                        ) : (
                          <StepProgressBar
                            key={s.numeral}
                            durationMs={stepDurationMs}
                            paused={!sectionVisible}
                            onComplete={advanceStep}
                          />
                        )
                      ) : (
                        <div className="mt-3 h-px sm:mt-4 sm:h-0.5" aria-hidden />
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Code — first on mobile; vertically centered in column on lg */}
          <div className="order-1 flex w-full min-w-0 items-center justify-center lg:order-2 lg:justify-end">
            <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-[hsl(var(--marketing-band-fg)/0.12)] bg-zinc-950 shadow-xl shadow-black/35 sm:max-w-3xl sm:rounded-xl lg:mx-0 lg:max-w-none lg:w-full">
              <div className="flex items-center justify-between border-b border-[hsl(var(--marketing-band-fg)/0.1)] px-4 py-3.5 sm:px-5">
                <div className="flex gap-1.5 sm:gap-2">
                  <span className="h-2 w-2 rounded-full bg-[hsl(var(--marketing-band-fg)/0.2)] sm:h-2.5 sm:w-2.5" />
                  <span className="h-2 w-2 rounded-full bg-[hsl(var(--marketing-band-fg)/0.2)] sm:h-2.5 sm:w-2.5" />
                  <span className="h-2 w-2 rounded-full bg-[hsl(var(--marketing-band-fg)/0.2)] sm:h-2.5 sm:w-2.5" />
                </div>
                <span className="truncate font-mono text-[10px] text-zinc-500 sm:text-xs">
                  {step.filename ?? 'workflow.ts'}
                </span>
              </div>
              <pre className="min-h-[176px] max-h-[min(280px,40svh)] overflow-x-auto overflow-y-auto bg-black/95 p-4 sm:min-h-[200px] sm:max-h-[min(320px,42svh)] sm:p-5 md:min-h-[210px] md:max-h-[min(360px,38vh)] md:p-6 lg:min-h-[220px] lg:max-h-[min(380px,36vh)]">
                <code className="table w-full min-w-0 table-fixed">{highlightCode(typedCode, !typingDone)}</code>
              </pre>
              <div className="flex items-center gap-2 border-t border-zinc-800/90 bg-zinc-900/85 px-4 py-3.5 sm:px-5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)]" />
                <span className="truncate font-mono text-[10px] text-zinc-500 sm:text-xs">{step.footerStatus}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
