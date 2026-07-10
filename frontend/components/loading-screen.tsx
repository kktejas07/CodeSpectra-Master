'use client'

import { useEffect, useRef, useState } from 'react'

const LOAD_DURATION = 2200

const codeLines = [
  'import { Scanner } from "codespectra"',
  'const analyzer = new Scanner()',
  'const issues = analyzer.scan(code)',
  'issues.forEach(i => {',
  '  const fix = ai.suggestFix(i)',
  '  console.log(\`Fixed: ${i.id}\`)',
  '})',
  'if (issues.length === 0) {',
  '  console.log("Clean build")',
  '}',
  'analyzer.generateReport()',
]

export function LoadingScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0)
  const [scanLine, setScanLine] = useState(0)
  const [visibleLines, setVisibleLines] = useState<number[]>([])
  const lineRef = useRef<number[]>([])

  useEffect(() => {
    let raf = 0
    let lineTimer = 0
    const start = performance.now()

    const tick = (now: number) => {
      const elapsed = now - start
      const pct = Math.min(elapsed / LOAD_DURATION, 1)
      setProgress(pct)
      setScanLine(pct * 100)

      // Reveal code lines progressively
      const lineCount = Math.floor(pct * codeLines.length * 1.5)
      const newLines: number[] = []
      for (let i = 0; i < Math.min(lineCount, codeLines.length); i++) {
        newLines.push(i)
      }
      if (newLines.length !== lineRef.current.length) {
        lineRef.current = newLines
        setVisibleLines(newLines)
      }

      if (pct >= 1) {
        onDone()
        return
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [onDone])

  const pct = Math.round(progress * 100)

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-zinc-950">
      {/* Grid bg */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Scan beam glow */}
      <div
        className="pointer-events-none absolute left-0 right-0 h-40 transition-all duration-75 ease-linear"
        style={{
          top: `${scanLine - 10}%`,
          background:
            'linear-gradient(180deg, transparent 0%, rgba(52,211,153,0.06) 30%, rgba(52,211,153,0.12) 50%, rgba(52,211,153,0.06) 70%, transparent 100%)',
        }}
      />

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center gap-8 px-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(52,211,153,0.3)]" />
          </span>
          <span className="text-lg font-bold tracking-tight text-zinc-100 sm:text-xl">
            CodeSpectra
          </span>
        </div>

        {/* Code window */}
        <div className="w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-lg shadow-black/40">
          {/* Window chrome */}
          <div className="flex items-center gap-1.5 border-b border-zinc-800/80 px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-zinc-700" />
            <span className="h-2 w-2 rounded-full bg-zinc-700" />
            <span className="h-2 w-2 rounded-full bg-zinc-700" />
            <span className="ml-3 font-mono text-[9px] tracking-wider text-zinc-700 sm:text-[10px]">
              scan — codespectra
            </span>
          </div>

          {/* Code content */}
          <div className="relative min-h-[180px] overflow-hidden p-4 font-mono text-xs leading-relaxed sm:min-h-[200px] sm:p-5 sm:text-sm">
            {/* Scan line */}
            <div
              className="pointer-events-none absolute left-0 right-0 h-6 transition-all duration-75 ease-linear"
              style={{
                top: `${scanLine * 1.6 - 2}%`,
                background:
                  'linear-gradient(90deg, transparent 0%, rgba(52,211,153,0.15) 20%, rgba(52,211,153,0.25) 50%, rgba(52,211,153,0.15) 80%, transparent 100%)',
              }}
            />
            <div
              className="pointer-events-none absolute left-0 right-0 h-px transition-all duration-75 ease-linear"
              style={{
                top: `${scanLine * 1.6}%`,
                background:
                  'linear-gradient(90deg, transparent 5%, rgba(52,211,153,0.7) 30%, rgba(52,211,153,0.9) 50%, rgba(52,211,153,0.7) 70%, transparent 95%)',
                boxShadow: '0 0 8px rgba(52,211,153,0.3), 0 0 20px rgba(52,211,153,0.1)',
              }}
            />

            {codeLines.map((line, i) => {
              const isScanned = i < visibleLines.length
              const isActive =
                isScanned &&
                i === Math.min(visibleLines.length - 1, codeLines.length - 1)

              return (
                <div
                  key={i}
                  className={`whitespace-pre transition-all duration-300 ${
                    isActive
                      ? 'text-emerald-300'
                      : isScanned
                        ? 'text-zinc-400'
                        : 'text-zinc-800'
                  }`}
                >
                  <span className="mr-3 inline-block w-5 text-right text-zinc-700 select-none">
                    {i + 1}
                  </span>
                  {line}
                  {isActive && (
                    <span className="ml-1 inline-block h-4 w-1.5 animate-pulse bg-emerald-400 align-[-2px]" />
                  )}
                </div>
              )
            })}

            {/* Blur fade for bottom */}
            <div className="pointer-events-none sticky bottom-0 left-0 right-0 h-8 bg-linear-to-t from-zinc-950 to-transparent" />
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex w-full flex-col items-center gap-2">
          <div className="h-[2px] w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-linear-to-r from-emerald-600 via-emerald-400 to-emerald-300 transition-all duration-150 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex w-full items-center justify-between font-mono text-[10px] tracking-wider text-zinc-600 sm:text-xs">
            <span>SCANNING</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
