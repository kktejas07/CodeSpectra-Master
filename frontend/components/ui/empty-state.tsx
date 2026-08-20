import React from 'react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface EmptyStateProps {
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
}

export function EmptyState({ title, description, actionLabel, actionHref, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center min-h-[400px]">
      <div className="w-64 h-64 mb-6 relative opacity-90">
        <svg viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-muted-foreground/20">
          {/* A cute astronaut / space exploration themed SVG */}
          <circle cx="250" cy="250" r="180" fill="currentColor" opacity="0.1" />
          <circle cx="250" cy="250" r="140" fill="currentColor" opacity="0.2" />
          
          {/* Planet */}
          <circle cx="350" cy="150" r="40" fill="currentColor" opacity="0.4" />
          <path d="M300 150 C330 180, 370 180, 400 150" stroke="currentColor" strokeWidth="8" strokeLinecap="round" opacity="0.6"/>
          
          {/* Stars */}
          <circle cx="100" cy="100" r="3" fill="currentColor" opacity="0.8" />
          <circle cx="150" cy="300" r="4" fill="currentColor" opacity="0.6" />
          <circle cx="400" cy="350" r="2" fill="currentColor" opacity="0.9" />
          <circle cx="120" cy="400" r="5" fill="currentColor" opacity="0.5" />
          
          {/* Astronaut */}
          <g transform="translate(200, 200) rotate(15)">
            {/* Backpack */}
            <rect x="-30" y="-10" width="20" height="60" rx="5" fill="currentColor" opacity="0.5" />
            {/* Body */}
            <rect x="-15" y="0" width="50" height="70" rx="20" fill="currentColor" opacity="0.8" />
            {/* Helmet */}
            <circle cx="10" cy="-20" r="25" fill="currentColor" opacity="0.9" />
            {/* Visor */}
            <path d="M-5 -20 Q10 -35 25 -20 Q10 -5 -5 -20" fill="var(--background)" stroke="currentColor" strokeWidth="3" />
            {/* Left Arm */}
            <path d="M-5 10 Q-25 20 -20 40" stroke="currentColor" strokeWidth="12" strokeLinecap="round" fill="none" opacity="0.8"/>
            {/* Right Arm pointing up */}
            <path d="M25 10 Q45 -10 60 5" stroke="currentColor" strokeWidth="12" strokeLinecap="round" fill="none" opacity="0.8"/>
            {/* Legs */}
            <path d="M0 60 Q-5 80 -10 100" stroke="currentColor" strokeWidth="14" strokeLinecap="round" fill="none" opacity="0.8"/>
            <path d="M20 60 Q25 80 30 100" stroke="currentColor" strokeWidth="14" strokeLinecap="round" fill="none" opacity="0.8"/>
            
            {/* Tether */}
            <path d="M-30 20 C-80 50, -100 -50, -150 -20" stroke="currentColor" strokeWidth="2" strokeDasharray="5,5" fill="none" opacity="0.6"/>
          </g>
        </svg>
      </div>
      
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        {description}
      </p>
      
      {actionLabel && (
        actionHref ? (
          <Link href={actionHref}>
            <Button variant="outline" className="rounded-full px-6">{actionLabel}</Button>
          </Link>
        ) : (
          <Button variant="outline" className="rounded-full px-6" onClick={onAction}>{actionLabel}</Button>
        )
      )}
    </div>
  )
}
