'use client'

import React from 'react'
import { interpolate, spring, useCurrentFrame, useVideoConfig, AbsoluteFill } from 'remotion'

export interface CourseSlideProps {
  title: string
  content: string[]
}

export const CourseSlide: React.FC<CourseSlideProps> = ({ title, content }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Animate title sliding in from top
  const titleY = spring({
    frame,
    fps,
    config: { damping: 12 },
  })
  
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0f172a', // slate-900
        padding: '60px 80px',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'sans-serif',
        color: 'white',
      }}
    >
      <h1
        style={{
          fontSize: '4rem',
          fontWeight: 'bold',
          marginBottom: '2rem',
          color: '#38bdf8', // sky-400
          transform: `translateY(${(1 - titleY) * -50}px)`,
          opacity: titleOpacity,
        }}
      >
        {title}
      </h1>

      <ul style={{ listStyleType: 'none', padding: 0 }}>
        {content.map((point, index) => {
          // Stagger the animation of each bullet point
          const delay = 30 + index * 45 // 1.5s delay between points
          const pointOpacity = interpolate(frame - delay, [0, 15], [0, 1], {
            extrapolateRight: 'clamp',
            extrapolateLeft: 'clamp',
          })
          const pointX = spring({
            frame: frame - delay,
            fps,
            config: { damping: 14 },
          })

          return (
            <li
              key={index}
              style={{
                fontSize: '2.5rem',
                marginBottom: '1.5rem',
                lineHeight: 1.4,
                opacity: pointOpacity,
                transform: `translateX(${(1 - pointX) * 100}px)`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '1rem',
              }}
            >
              <span style={{ color: '#facc15' }}>▹</span>
              <span>{point}</span>
            </li>
          )
        })}
      </ul>
    </AbsoluteFill>
  )
}
