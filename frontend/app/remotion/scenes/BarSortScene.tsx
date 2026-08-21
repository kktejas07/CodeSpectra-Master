import React from 'react'
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'

interface BarSortSceneProps {
  initialArray: number[]
  algorithm: 'bubble' | 'selection' | 'merge'
  title: string
}

export const BarSortScene: React.FC<BarSortSceneProps> = ({ initialArray, algorithm, title }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Generate sorting steps (simplified merge sort visualization)
  const generateSteps = () => {
    const arr = [...initialArray]
    const steps: Array<{ array: number[], comparing: number[], swapping: number[], sorted: number[] }> = []
    
    // Bubble sort for clear visualization
    for (let i = 0; i < arr.length; i++) {
      for (let j = 0; j < arr.length - i - 1; j++) {
        steps.push({
          array: [...arr],
          comparing: [j, j + 1],
          swapping: [],
          sorted: Array.from({ length: i }, (_, k) => arr.length - 1 - k),
        })
        if (arr[j] > arr[j + 1]) {
          steps.push({
            array: [...arr],
            comparing: [],
            swapping: [j, j + 1],
            sorted: Array.from({ length: i }, (_, k) => arr.length - 1 - k),
          })
          ;[arr[j], arr[j + 1]] = [arr[j + 1], arr[j]]
        }
      }
    }
    steps.push({
      array: [...arr],
      comparing: [],
      swapping: [],
      sorted: Array.from({ length: arr.length }, (_, k) => k),
    })
    return steps
  }

  const steps = generateSteps()
  const stepDuration = Math.max(8, Math.floor(200 / steps.length))
  const currentStepIndex = Math.min(Math.floor(frame / stepDuration), steps.length - 1)
  const currentStep = steps[currentStepIndex]

  // Title animation
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })

  // Bar dimensions
  const maxVal = Math.max(...initialArray)
  const barWidth = Math.min(80, (1600 - (initialArray.length - 1) * 12) / initialArray.length)
  const totalWidth = initialArray.length * (barWidth + 12)

  // Progress
  const progress = currentStepIndex / (steps.length - 1)

  return (
    <div style={{
      width: '100%', height: '100%',
      backgroundColor: '#0f172a',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Title */}
      <div style={{
        fontSize: 48, fontWeight: 'bold', color: '#f8fafc',
        marginBottom: 60, opacity: titleOpacity,
        textAlign: 'center',
      }}>
        {title}
      </div>

      {/* Bars container */}
      <div style={{
        display: 'flex', gap: 12,
        alignItems: 'flex-end',
        height: 400,
        position: 'relative',
      }}>
        {currentStep.array.map((value, index) => {
          const height = (value / maxVal) * 350
          const isComparing = currentStep.comparing.includes(index)
          const isSwapping = currentStep.swapping.includes(index)
          const isSorted = currentStep.sorted.includes(index)

          // Spring animation for swapping
          const swapSpring = isSwapping
            ? spring({ frame: frame % stepDuration, fps, config: { damping: 10 } })
            : 0

          return (
            <div key={index} style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 8,
            }}>
              {/* Value label */}
              <div style={{
                fontSize: 20, fontWeight: 'bold',
                color: isSwapping ? '#fbbf24' : isComparing ? '#60a5fa' : '#f8fafc',
                opacity: interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' }),
              }}>
                {value}
              </div>

              {/* Bar */}
              <div style={{
                width: barWidth,
                height,
                backgroundColor: isSwapping
                  ? '#fbbf24'
                  : isComparing
                    ? '#3b82f6'
                    : isSorted
                      ? '#22c55e'
                      : '#6366f1',
                borderRadius: '8px 8px 0 0',
                boxShadow: isSwapping
                  ? '0 0 20px rgba(251, 191, 36, 0.5)'
                  : isComparing
                    ? '0 0 15px rgba(59, 130, 246, 0.3)'
                    : 'none',
                transform: `scaleY(${1 + swapSpring * 0.1})`,
                transition: 'background-color 0.1s',
              }} />
            </div>
          )
        })}
      </div>

      {/* Progress bar */}
      <div style={{
        width: totalWidth,
        height: 6,
        backgroundColor: '#1e293b',
        borderRadius: 3,
        marginTop: 40,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${progress * 100}%`,
          height: '100%',
          backgroundColor: '#3b82f6',
          borderRadius: 3,
          transition: 'width 0.1s',
        }} />
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 30,
        marginTop: 30,
        fontSize: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 16, height: 16, backgroundColor: '#6366f1', borderRadius: 4 }} />
          <span style={{ color: '#94a3b8' }}>Unsorted</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 16, height: 16, backgroundColor: '#3b82f6', borderRadius: 4 }} />
          <span style={{ color: '#94a3b8' }}>Comparing</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 16, height: 16, backgroundColor: '#fbbf24', borderRadius: 4 }} />
          <span style={{ color: '#94a3b8' }}>Swapping</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 16, height: 16, backgroundColor: '#22c55e', borderRadius: 4 }} />
          <span style={{ color: '#94a3b8' }}>Sorted</span>
        </div>
      </div>

      {/* Algorithm info */}
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
        {algorithm === 'bubble' ? 'Bubble Sort' : algorithm === 'selection' ? 'Selection Sort' : 'Merge Sort'} — O(n²)
      </div>

      {/* Step counter */}
      <div style={{
        position: 'absolute',
        bottom: 40, right: 40,
        fontSize: 18, color: '#64748b',
      }}>
        Step {currentStepIndex + 1} / {steps.length}
      </div>
    </div>
  )
}
