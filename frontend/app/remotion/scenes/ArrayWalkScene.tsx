import React from 'react'
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'

interface ArrayWalkSceneProps {
  array: number[]
  target?: number
  title: string
  explanation?: string
}

type SearchStep = { low: number; high: number; mid: number; phase: 'check' | 'found' | 'done' }

/** Search steps derived from the ACTUAL array: binary search on sorted input,
 * linear scan otherwise. A trailing 'done' step honestly reports a miss. */
function stepsFor(data: number[], t: number): SearchStep[] {
  if (!data.length) return []
  let sorted = true
  for (let i = 1; i < data.length; i++) {
    if ((data[i] ?? 0) < (data[i - 1] ?? 0)) { sorted = false; break }
  }
  const steps: SearchStep[] = []
  if (sorted) {
    let low = 0
    let high = data.length - 1
    while (low <= high) {
      const mid = (low + high) >> 1
      if (data[mid] === t) { steps.push({ low, high, mid, phase: 'found' }); break }
      steps.push({ low, high, mid, phase: 'check' })
      if ((data[mid] ?? 0) < t) low = mid + 1
      else high = mid - 1
    }
  } else {
    for (let i = 0; i < data.length; i++) {
      const found = data[i] === t
      steps.push({ low: 0, high: i, mid: i, phase: found ? 'found' : 'check' })
      if (found) break
    }
  }
  const last = steps[steps.length - 1]
  if (!last || last.phase !== 'found') {
    steps.push({ low: 0, high: data.length - 1, mid: Math.max(0, Math.min(data.length - 1, last ? last.mid : 0)), phase: 'done' })
  }
  return steps
}

export const ArrayWalkScene: React.FC<ArrayWalkSceneProps> = ({ array, target, title, explanation }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Slide-owned data only, clamped for layout; empty → neutral title card below.
  const data = (Array.isArray(array) ? array : []).filter(n => typeof n === 'number' && Number.isFinite(n)).slice(0, 12)
  const t = typeof target === 'number' && Number.isFinite(target) ? target : (data[Math.floor(data.length / 2)] ?? 0)

  // Phase 1: Title appears (0-30 frames)
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' })

  if (!data.length) {
    return (
      <div style={{
        width: '100%', height: '100%',
        backgroundColor: '#0f172a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ fontSize: 48, fontWeight: 'bold', color: '#f8fafc', opacity: titleOpacity, textAlign: 'center' }}>
          {title}
        </div>
      </div>
    )
  }

  // Phase 2: Array appears cell by cell (30-90 frames)
  const cellAppear = (index: number) => {
    const delay = 30 + index * 6
    return spring({ frame: frame - delay, fps, config: { damping: 12 } })
  }

  // Phase 3: Pointer walks through the actual array (90 frames on)
  const searchSteps = stepsFor(data, t)

  const stepDuration = 35
  const searchStart = 90
  const currentStepIndex = Math.min(
    Math.floor((frame - searchStart) / stepDuration),
    searchSteps.length - 1
  )
  const currentStep = frame >= searchStart ? searchSteps[Math.max(0, currentStepIndex)] : null

  // Pointer position animation
  const pointerX = currentStep ? interpolate(
    (frame - searchStart) % stepDuration,
    [0, 10],
    [currentStep.mid * 120 + 60, currentStep.mid * 120 + 60],
    { extrapolateRight: 'clamp' }
  ) : -100

  const pointerOpacity = frame >= searchStart ? 1 : 0

  // Color coding
  const cellColor = (index: number) => {
    if (!currentStep) return '#1e293b'
    if (currentStep.phase === 'found' && index === currentStep.mid) return '#22c55e'
    if (index === currentStep.mid) return '#3b82f6'
    if (index >= currentStep.low && index <= currentStep.high) return '#1e3a5f'
    return '#1e293b'
  }

  // Highlight found
  const foundScale = currentStep?.phase === 'found'
    ? spring({ frame: frame - (searchStart + 2 * stepDuration), fps, config: { damping: 8 } })
    : 1

  // Explanation text - use prop if provided, otherwise use step-based explanation
  const explanationText = explanation || (currentStep
    ? currentStep.phase === 'found'
      ? `Found ${t} at index ${currentStep.mid}!`
      : currentStep.phase === 'done'
        ? `${t} is not in this list — checked every candidate.`
        : `Checking index ${currentStep.mid}: arr[${currentStep.mid}] = ${data[currentStep.mid] ?? ''} ${(data[currentStep.mid] ?? 0) < t ? '<' : (data[currentStep.mid] ?? 0) > t ? '>' : '='} ${t}`
    : '')

  const explanationOpacity = currentStep ? interpolate(
    (frame - searchStart) % stepDuration,
    [5, 15],
    [0, 1],
    { extrapolateRight: 'clamp' }
  ) : 0

  return (
    <div style={{
      width: '100%', height: '100%',
      backgroundColor: '#0f172a',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      padding: 60,
    }}>
      {/* Title */}
      <div style={{
        fontSize: 48, fontWeight: 'bold', color: '#f8fafc',
        marginBottom: 60, opacity: titleOpacity,
        textAlign: 'center',
      }}>
        {title}
      </div>

      {/* Array visualization */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 80,
        alignItems: 'flex-end',
      }}>
        {data.map((value, index) => {
          const appear = cellAppear(index)
          const isHighlighted = currentStep && index >= currentStep.low && index <= currentStep.high
          const isMid = currentStep && index === currentStep.mid
          const isFound = currentStep?.phase === 'found' && index === currentStep.mid

          return (
            <div key={index} style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 8,
            }}>
              {/* Index label */}
              <div style={{
                fontSize: 16, color: '#64748b',
                opacity: appear,
              }}>
                {index}
              </div>

              {/* Cell */}
              <div style={{
                width: 100, height: 100,
                backgroundColor: cellColor(index),
                border: `3px solid ${isFound ? '#22c55e' : isMid ? '#3b82f6' : isHighlighted ? '#1e40af' : '#334155'}`,
                borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 36, fontWeight: 'bold',
                color: isFound ? '#22c55e' : isMid ? '#60a5fa' : '#f8fafc',
                transform: `scale(${isFound ? foundScale : appear}) ${isFound ? 'translateY(-20px)' : ''}`,
                boxShadow: isFound ? '0 0 30px rgba(34, 197, 94, 0.5)' : isMid ? '0 0 20px rgba(59, 130, 246, 0.3)' : 'none',
                transition: 'all 0.2s',
              }}>
                {value}
              </div>
            </div>
          )
        })}
      </div>

      {/* Pointer */}
      {currentStep && (
        <div style={{
          position: 'absolute',
          left: pointerX,
          top: '52%',
          opacity: pointerOpacity,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center',
        }}>
          <div style={{
            width: 0, height: 0,
            borderLeft: '15px solid transparent',
            borderRight: '15px solid transparent',
            borderBottom: '20px solid #3b82f6',
          }} />
          <div style={{
            width: 4, height: 30,
            backgroundColor: '#3b82f6',
          }} />
          <div style={{
            fontSize: 18, color: '#3b82f6',
            fontWeight: 'bold', marginTop: 8,
          }}>
            mid = {currentStep.mid}
          </div>
        </div>
      )}

      {/* Low/High markers */}
      {currentStep && (
        <div style={{
          position: 'absolute',
          left: 60,
          bottom: 200,
          display: 'flex', gap: 40,
          fontSize: 20, color: '#94a3b8',
        }}>
          <span>low = {currentStep.low}</span>
          <span>high = {currentStep.high}</span>
        </div>
      )}

      {/* Explanation */}
      <div style={{
        position: 'absolute',
        bottom: 100,
        fontSize: 28,
        color: currentStep?.phase === 'found' ? '#22c55e' : '#94a3b8',
        fontWeight: currentStep?.phase === 'found' ? 'bold' : 'normal',
        opacity: explanationOpacity,
        textAlign: 'center',
        maxWidth: '80%',
      }}>
        {explanationText}
      </div>

      {/* Complexity badge */}
      <div style={{
        position: 'absolute',
        top: 40, right: 40,
        backgroundColor: '#1e293b',
        border: '2px solid #334155',
        borderRadius: 8,
        padding: '8px 16px',
        fontSize: 18, color: '#94a3b8',
        opacity: titleOpacity,
      }}>
        Time: O(log n)
      </div>
    </div>
  )
}
