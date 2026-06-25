'use client'

import React from 'react'
import { getLanguageConfig, LanguageType } from '@/lib/language-icons'
import { Badge } from '@/components/ui/badge'
import * as Icons from 'lucide-react'

interface LanguageBadgeProps {
  language: LanguageType | string
  variant?: 'default' | 'outline' | 'secondary' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  className?: string
}

export function LanguageBadge({
  language,
  variant = 'secondary',
  size = 'md',
  showIcon = true,
  className = '',
}: LanguageBadgeProps) {
  const config = getLanguageConfig(language)
  const IconComponent = Icons[config.icon as keyof typeof Icons] as React.ComponentType<{ className: string }>

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs gap-1',
    md: 'px-3 py-1.5 text-sm gap-1.5',
    lg: 'px-4 py-2 text-base gap-2',
  }

  return (
    <Badge
      variant={variant}
      className={`inline-flex items-center ${sizeClasses[size]} ${className}`}
    >
      {showIcon && IconComponent && (
        <IconComponent className={`w-${size === 'sm' ? '3' : size === 'lg' ? '5' : '4'} h-${size === 'sm' ? '3' : size === 'lg' ? '5' : '4'}`} />
      )}
      <span>{config.label}</span>
    </Badge>
  )
}

interface LanguageBadgeGroupProps {
  languages: (LanguageType | string)[]
  maxDisplay?: number
  variant?: 'default' | 'outline' | 'secondary' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  showIcons?: boolean
  className?: string
}

export function LanguageBadgeGroup({
  languages,
  maxDisplay = 5,
  variant = 'secondary',
  size = 'md',
  showIcons = true,
  className = '',
}: LanguageBadgeGroupProps) {
  const displayed = languages.slice(0, maxDisplay)
  const remaining = languages.length - maxDisplay

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {displayed.map((lang) => (
        <LanguageBadge
          key={lang}
          language={lang}
          variant={variant}
          size={size}
          showIcon={showIcons}
        />
      ))}
      {remaining > 0 && (
        <Badge variant={variant} className={sizeClasses[size]}>
          +{remaining} more
        </Badge>
      )}
    </div>
  )
}

const sizeClasses = {
  sm: 'px-2 py-1 text-xs gap-1',
  md: 'px-3 py-1.5 text-sm gap-1.5',
  lg: 'px-4 py-2 text-base gap-2',
}
