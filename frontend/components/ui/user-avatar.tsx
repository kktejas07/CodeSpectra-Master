'use client'

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { dicebearUrl, initialsFor } from '@/lib/avatar'
import { cn } from '@/lib/utils'

interface UserAvatarProps {
  /** Real photo URL. DiceBear fallback is used when absent. */
  src?: string | null
  /** DiceBear seed (email or id). Falls back to `name`. */
  seed?: string | null
  /** Alt text, initials source, and last-resort seed. */
  name?: string | null
  /** Sizing/ring on the root (default size-8). Rounded overrides allowed. */
  className?: string
  imageClassName?: string
  fallbackClassName?: string
}

/**
 * One avatar everywhere: real photo → seeded DiceBear → initials.
 * Replaces ~10 hand-rolled `api.dicebear.com/7.x` <img> copies so a future
 * style/endpoint change touches one file. Radix shows the initials
 * automatically if every image fails (offline DiceBear, broken photo URL).
 */
export function UserAvatar({ src, seed, name, className, imageClassName, fallbackClassName }: UserAvatarProps) {
  const label = (name || '').trim()
  return (
    <Avatar className={cn('bg-muted text-muted-foreground', className)}>
      <AvatarImage src={src || dicebearUrl(seed || label)} alt={label || 'User'} className={imageClassName} />
      <AvatarFallback className={fallbackClassName}>{initialsFor(label || seed)}</AvatarFallback>
    </Avatar>
  )
}
