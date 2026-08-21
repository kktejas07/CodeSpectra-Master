'use client'

import React from 'react'
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'

interface ArrayWalkSceneProps {
  array: number[]
  target: number
  title: string
  explanation?: string
}

export const ArrayWalkScene: React.FC<ArrayWalkSceneProps> = ({ array, target, title, explanation }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Phase 1: Title appears (0-30 frames)
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' })

  // Phase 2: Array appears cell by cell (30-90 frames)
  const cellAppear = (index: number) => {
    const delay = 30 + index * 6
    return spring({ frame: frame - delay, fps, config: { damping: 12 } })
  }

  // Phase 3: Pointer walks through array (90-200 frames)
  // Binary search: low=0, high=9, mid=4, then low=5, high=9, mid=7, then low=5, high=6, mid=5 (found!)
  const searchSteps = [
    { low: 0, high: 9, mid: 4, phase: 'check' },    // mid=16 < 23, go right
    { low: 5, high: 9, mid: 7, phase: 'check' },    // mid=45 > 23, go left
    { low: 5, high: 6, mid: 5, phase: 'found' },    // mid=23, found!
  ]

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
      ? `Found ${target} at index ${currentStep.mid}!`
      : `Checking index ${currentStep.mid}: arr[${currentStep.mid}] = ${array[currentStep.mid]} ${array[currentStep.mid] < target ? '<' : array[currentStep.mid] > target ? '>' : '='} ${target}`
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
        {array.map((value, index) => {
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
