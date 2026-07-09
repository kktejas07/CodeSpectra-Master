'use client'

import { useEffect, useState } from 'react'

interface CountdownProps {
  targetIso: string
  label?: string
  onEnd?: () => void
}

export function Countdown({ targetIso, label, onEnd }: CountdownProps) {
  const [display, setDisplay] = useState('')
  const [ended, setEnded] = useState(false)

  useEffect(() => {
    const target = new Date(targetIso).getTime()
    if (isNaN(target)) { setDisplay('—'); return }

    function tick() {
      const now = Date.now()
      const diff = target - now
      if (diff <= 0) {
        setDisplay('0d 0h 0m')
        if (!ended) { setEnded(true); onEnd?.() }
        return
      }
      const d = Math.floor(diff / 86_400_000)
      const h = Math.floor((diff % 86_400_000) / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      const s = Math.floor((diff % 60_000) / 1000)
      setDisplay(`${d}d ${h}h ${m}m ${s}s`)
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetIso, ended, onEnd])

  return (
    <span className="tabular-nums" title={label || targetIso}>
      {display}
    </span>
  )
}
