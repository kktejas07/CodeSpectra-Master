'use client'

import { cn } from '@/lib/utils'

export type CapabilityIllustrationVariant = '01' | '02' | '03' | '04'

type CapabilityIllustrationProps = {
  variant: CapabilityIllustrationVariant
  className?: string
}

/**
 * Small abstract SVG accents with CSS motion — same role as illustrations on
 * Lightweight SVG accents for capability cards.
 */
export function CapabilityIllustration({ variant, className }: CapabilityIllustrationProps) {
  const base = cn('text-primary/90 dark:text-primary/80', className)

  if (variant === '01') {
    return (
      <svg className={cn(base, 'cap-ill-01')} viewBox="0 0 112 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <circle cx="56" cy="44" r="28" className="text-primary/25" stroke="currentColor" strokeWidth="1" />
        <circle cx="56" cy="44" r="18" className="text-primary/35" stroke="currentColor" strokeWidth="1" strokeDasharray="4 6" />
        <path
          className="cap-ill-stroke"
          d="M32 52c12-18 36-18 48 0"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="60"
          strokeDashoffset="60"
        />
        <circle cx="56" cy="30" r="4" className="cap-ill-pulse fill-primary/50" />
      </svg>
    )
  }

  if (variant === '02') {
    return (
      <svg className={cn(base, 'cap-ill-02')} viewBox="0 0 112 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <g className="cap-ill-orbit origin-[56px_44px]">
          <circle cx="56" cy="44" r="26" className="text-primary/20" stroke="currentColor" strokeWidth="1" />
          <circle cx="82" cy="44" r="3" className="fill-primary/50" />
          <circle cx="30" cy="44" r="3" className="fill-primary/35" />
        </g>
        <path
          className="cap-ill-stroke"
          d="M40 62h32M40 68h24"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="40"
          strokeDashoffset="40"
        />
      </svg>
    )
  }

  if (variant === '03') {
    return (
      <svg className={cn(base, 'cap-ill-03')} viewBox="0 0 112 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <rect x="34" y="22" width="44" height="48" rx="6" className="text-primary/25" stroke="currentColor" strokeWidth="1" />
        <path className="cap-ill-bar" d="M44 36h24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path className="cap-ill-bar cap-ill-bar-delay" d="M44 46h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path className="cap-ill-bar cap-ill-bar-delay-2" d="M44 56h22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="56" cy="70" r="3" className="cap-ill-pulse fill-primary/45" />
      </svg>
    )
  }

  /* 04 */
  return (
    <svg className={cn(base, 'cap-ill-04')} viewBox="0 0 112 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M56 20 L78 32 V56 C78 68 56 76 56 76 C56 76 34 68 34 56 V32 Z"
        className="text-primary/30"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        className="cap-ill-stroke"
        d="M48 48 L54 54 L68 40"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="48"
        strokeDashoffset="48"
      />
    </svg>
  )
}
