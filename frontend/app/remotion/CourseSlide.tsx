'use client'

import React from 'react'
import { interpolate, spring, useCurrentFrame, useVideoConfig, AbsoluteFill } from 'remotion'

export interface CourseSlideProps {
  title: string
  content: string[] | string
  variant?: 'title' | 'concept'
}

export const CourseSlide: React.FC<CourseSlideProps> = ({ title, content, variant = 'concept' }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const bullets = Array.isArray(content) ? content : content ? [String(content)] : []

  const titleY = spring({ frame, fps, config: { damping: 12 } })
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })

  if (variant === 'title') {
    const subOpacity = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })
    return (
      <AbsoluteFill
        style={{
          backgroundColor: '#0b1b3a',
          padding: '80px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          color: 'white',
        }}
      >
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.08, fontSize: 120, fontFamily: 'monospace',
          color: '#38bdf8', padding: 40, lineHeight: 1.6, overflow: 'hidden',
        }}>
          {'{ }'}  print("hello, world!")  &lt;/&gt;
        </div>
        <h1 style={{
          fontSize: '4.2rem', fontWeight: 800, lineHeight: 1.15, maxWidth: '90%',
          transform: `translateY(${(1 - titleY) * -40}px)`, opacity: titleOpacity,
        }}>
          {title}
        </h1>
        {bullets[0] ? (
          <p style={{ fontSize: '2.2rem', color: '#facc15', marginTop: 28, opacity: subOpacity, maxWidth: '80%' }}>
            {bullets[0]}
          </p>
        ) : null}
      </AbsoluteFill>
    )
  }

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0f172a',
        padding: '60px 80px',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, sans-serif',
        color: 'white',
      }}
    >
      <h1
        style={{
          fontSize: '3.4rem',
          fontWeight: 'bold',
          marginBottom: '2rem',
          color: '#38bdf8',
          transform: `translateY(${(1 - titleY) * -50}px)`,
          opacity: titleOpacity,
        }}
      >
        {title}
      </h1>

      <ul style={{ listStyleType: 'none', padding: 0 }}>
        {bullets.map((point, index) => {
          const delay = 20 + index * 18
          const pointOpacity = interpolate(frame - delay, [0, 12], [0, 1], {
            extrapolateRight: 'clamp',
            extrapolateLeft: 'clamp',
          })
          const pointX = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 14 } })

          return (
            <li
              key={index}
              style={{
                fontSize: '2.1rem',
                marginBottom: '1.25rem',
                lineHeight: 1.35,
                opacity: pointOpacity,
                transform: `translateX(${(1 - pointX) * 80}px)`,
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
