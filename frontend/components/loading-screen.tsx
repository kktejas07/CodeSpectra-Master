'use client'

import { useState, useEffect, useCallback } from 'react'

const bootLines = [
  { text: 'Initializing CodeSpectra engine...', delay: 400 },
  { text: 'Loading analysis modules...', delay: 600 },
  { text: 'Connecting AI services...', delay: 500 },
  { text: 'Calibrating code scanner...', delay: 450 },
  { text: 'Preparing workspace...', delay: 350 },
  { text: 'System ready.', delay: 300, isFinal: true },
]

function LoadingBar({ done }: { done: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-[10px] text-emerald-400/80 sm:text-xs">
        {done ? 'OK' : '..'}
      </span>
      {!done && (
        <span className="relative inline-block h-2 w-8 overflow-hidden rounded-full bg-zinc-800 sm:w-10">
          <span className="absolute inset-y-0 left-0 w-1/2 animate-loading-bar rounded-full bg-emerald-400" />
        </span>
      )}
    </span>
  )
}

export function LoadingScreen({ onDone }: { onDone: () => void }) {
  const [visibleLines, setVisibleLines] = useState<{ text: string; done: boolean }[]>([])
  const [currentLineIndex, setCurrentLineIndex] = useState(0)
  const [typedChars, setTypedChars] = useState(0)
  const [fadingOut, setFadingOut] = useState(false)

  const currentBootLine = bootLines[currentLineIndex]

  const advanceLine = useCallback(() => {
    const nextIndex = currentLineIndex + 1
    if (nextIndex >= bootLines.length) {
      setFadingOut(true)
      setTimeout(onDone, 600)
      return
    }
    setCurrentLineIndex(nextIndex)
    setTypedChars(0)
  }, [currentLineIndex, onDone])

  useEffect(() => {
    if (!currentBootLine) return
    const target = currentBootLine.text

    if (typedChars < target.length) {
      const t = setTimeout(() => setTypedChars((c) => c + 1), 18 + Math.random() * 20)
      return () => clearTimeout(t)
    }

    setVisibleLines((prev) => [
      ...prev.filter((l) => l.text !== target),
      { text: target, done: currentBootLine.isFinal ?? false },
    ])

    const t = setTimeout(advanceLine, currentBootLine.delay)
    return () => clearTimeout(t)
  }, [typedChars, currentBootLine, advanceLine])

  const allLines = [...visibleLines]
  if (currentBootLine && typedChars < currentBootLine.text.length) {
    const partial = currentBootLine.text.slice(0, typedChars)
    const existing = allLines.findIndex((l) => l.text === currentBootLine.text)
    if (existing >= 0) {
      allLines[existing] = { text: partial, done: false }
    } else {
      allLines.push({ text: partial, done: false })
    }
  }

  const isReady = visibleLines.some((l) => l.text === 'System ready.')

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950 transition-opacity duration-700 ${
        fadingOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Subtle grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative w-full max-w-lg px-6">
        <div className="mb-6 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
          <span className="font-mono text-[10px] tracking-widest text-zinc-500 uppercase sm:text-xs">
            CodeSpectra Terminal v2.0
          </span>
        </div>

        <div className="space-y-2 font-mono text-xs leading-relaxed sm:text-sm">
          {allLines.map((line, i) => (
            <div key={`${i}-${line.text}`} className="flex items-start gap-2">
              <span className="shrink-0 text-zinc-600 select-none">{'>'}</span>
              <span
                className={`${
                  line.text === 'System ready.' || line.text.startsWith('System ready')
                    ? 'text-emerald-400'
                    : 'text-zinc-300'
                }`}
              >
                {line.text}
                {i === allLines.length - 1 && !line.done && (
                  <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-cursor-blink bg-zinc-300 align-[-1px]" />
                )}
              </span>
              {line.done && <LoadingBar done />}
              {line.text.startsWith('System ready') && (
                <span className="inline-flex items-center gap-1">
                  <span className="font-mono text-[10px] text-emerald-400 sm:text-xs">OK</span>
                </span>
              )}
            </div>
          ))}

          {isReady && (
            <div className="mt-4 border-t border-zinc-800 pt-3 text-[10px] text-zinc-600 sm:text-xs">
              {new Date().toLocaleTimeString()} — All systems operational
            </div>
          )}
        </div>

        {/* Bottom glow bar */}
        <div
          className="mt-8 h-px w-full bg-linear-to-r from-transparent via-emerald-400/30 to-transparent"
          style={{
            animation: 'pulse 2s ease-in-out infinite',
          }}
        />
      </div>
    </div>
  )
}
