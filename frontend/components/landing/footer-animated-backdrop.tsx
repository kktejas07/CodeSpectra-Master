'use client'

import { FooterGlobeCanvas } from '@/components/landing/footer-globe-canvas'

/**
 * Decorative circles + drifting dot field for the footer link columns area
 * Subtle dotted backdrop for the footer band.
 */
export function FooterAnimatedBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Large soft orbs — slow drift */}
      <div
        className="footer-blob absolute -left-[12%] top-[8%] h-[min(420px,55vw)] w-[min(420px,55vw)] rounded-full bg-primary/10 blur-3xl dark:bg-primary/15"
        style={{ animationDelay: '0s' }}
      />
      <div
        className="footer-blob absolute -right-[8%] bottom-[12%] h-[min(380px,50vw)] w-[min(380px,50vw)] rounded-full bg-primary/5 blur-3xl dark:bg-primary/12"
        style={{ animationDelay: '-7s' }}
      />
      <div
        className="footer-blob absolute left-[35%] -bottom-[18%] h-[min(320px,45vw)] w-[min(320px,45vw)] rounded-full bg-muted-foreground/10 blur-3xl dark:bg-muted-foreground/15"
        style={{ animationDelay: '-14s' }}
      />

      {/* Dot field + orbiting highlight (“globe” sweep) */}
      <div className="absolute inset-0 opacity-[0.22] dark:opacity-[0.2]">
        <FooterGlobeCanvas className="h-full w-full" />
      </div>

      {/* Fade to solid at bottom so copyright row stays readable */}
      <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-background/85 dark:to-background/90" />
    </div>
  )
}
