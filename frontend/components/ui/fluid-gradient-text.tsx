'use client'

import { useId } from 'react'

interface FluidGradientTextProps {
  text: string
  className?: string
  gradientFrom?: string
  gradientVia?: string
  gradientTo?: string
}

export function FluidGradientText({
  text,
  className = '',
  gradientFrom = '#3b82f6',
  gradientVia = '#8b5cf6',
  gradientTo = '#ec4899',
}: FluidGradientTextProps) {
  const id = useId()
  const animName = `fg-${id.replace(/:/g, '')}`

  return (
    <>
      <style>{`
        @keyframes ${animName} {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
      `}</style>
      <span
        className={`bg-clip-text text-transparent inline-block ${className}`}
        style={{
          backgroundImage: `linear-gradient(90deg, ${gradientFrom}, ${gradientVia}, ${gradientTo}, ${gradientFrom})`,
          backgroundSize: '200% 100%',
          animation: `${animName} 3.5s linear infinite`,
        }}
      >
        {text}
      </span>
    </>
  )
}
