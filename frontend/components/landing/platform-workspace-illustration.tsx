'use client'

import { cn } from '@/lib/utils'

/**
 * Platform section — secure web app, one account hub, and a linear journey
 * (scans → learning → interviews → certificates) aligned with section copy.
 */
export function PlatformWorkspaceIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={cn('platform-ill h-auto w-full max-w-md text-primary', className)}
      viewBox="0 0 340 368"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="20"
        y="18"
        width="300"
        height="332"
        rx="20"
        className="fill-card/70 stroke-border/55"
        strokeWidth="1"
      />

      {/* Browser chrome */}
      <rect x="40" y="38" width="260" height="40" rx="10" className="fill-muted/25 stroke-border/45" strokeWidth="1" />
      <circle cx="56" cy="58" r="3.5" className="fill-muted-foreground/22" />
      <circle cx="70" cy="58" r="3.5" className="fill-muted-foreground/16" />
      <circle cx="84" cy="58" r="3.5" className="fill-muted-foreground/12" />
      <rect x="104" y="50" width="180" height="16" rx="8" className="fill-background/85 stroke-border/40" strokeWidth="1" />
      <g className="platform-ill-lock">
        <rect x="116" y="54" width="9" height="8" rx="2" className="stroke-primary/55" strokeWidth="1.15" />
        <path
          d="M118 54v-2.2a2.8 2.8 0 0 1 5.6 0V54"
          className="stroke-primary/55"
          strokeWidth="1.15"
          strokeLinecap="round"
        />
      </g>

      {/* One account */}
      <g className="platform-ill-hub">
        <rect x="110" y="94" width="120" height="64" rx="12" className="fill-primary/8 stroke-primary/28" strokeWidth="1" />
        <circle cx="170" cy="118" r="12" className="fill-muted/45 stroke-border/45" strokeWidth="1" />
        <path d="M156 136c3.5-8 28.5-8 32 0" className="stroke-muted-foreground/32" strokeWidth="1.15" strokeLinecap="round" />
        <rect x="138" y="140" width="64" height="5" rx="2" className="fill-muted-foreground/14" />
      </g>
      <path
        d="M170 158v10H88"
        className="platform-ill-connect stroke-border/45"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Timeline */}
      <line
        x1="78"
        y1="176"
        x2="78"
        y2="318"
        className="platform-ill-spine stroke-primary/22"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="5 9"
      />

      {/* Scan / quality */}
      <circle cx="78" cy="188" r="6.5" className="platform-ill-node fill-primary/32 stroke-primary/48" strokeWidth="1" />
      <rect
        x="96"
        y="172"
        width="212"
        height="32"
        rx="9"
        className="platform-ill-row fill-muted/18 stroke-border/38"
        strokeWidth="1"
      />
      <path
        d="M110 188h-5l-3.5-3.5M110 188h-5l-3.5 3.5M110 188h9"
        className="platform-ill-icon stroke-primary/55"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M128 188h5l3.5-3.5M128 188h5l3.5 3.5M128 188h-9"
        className="platform-ill-icon stroke-primary/55"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <rect x="148" y="182" width="76" height="4" rx="2" className="cap-ill-bar fill-muted-foreground/11" />
      <rect x="148" y="190" width="54" height="3" rx="1.5" className="cap-ill-bar cap-ill-bar-delay fill-muted-foreground/7" />

      {/* Learning */}
      <circle
        cx="78"
        cy="236"
        r="6.5"
        className="platform-ill-node platform-ill-node-d1 fill-primary/26 stroke-primary/42"
        strokeWidth="1"
      />
      <rect
        x="96"
        y="220"
        width="212"
        height="32"
        rx="9"
        className="platform-ill-row platform-ill-r1 fill-muted/18 stroke-border/38"
        strokeWidth="1"
      />
      <path
        d="M112 228h12l-6 11-6-11z"
        className="platform-ill-icon platform-ill-icon-d1 stroke-primary/48"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M118 236v7"
        className="platform-ill-icon platform-ill-icon-d1 stroke-primary/48"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <rect x="148" y="230" width="84" height="4" rx="2" className="cap-ill-bar cap-ill-bar-delay fill-muted-foreground/11" />
      <rect x="148" y="238" width="60" height="3" rx="1.5" className="cap-ill-bar cap-ill-bar-delay-2 fill-muted-foreground/7" />

      {/* Interviews */}
      <circle
        cx="78"
        cy="284"
        r="6.5"
        className="platform-ill-node platform-ill-node-d2 fill-primary/22 stroke-primary/38"
        strokeWidth="1"
      />
      <rect
        x="96"
        y="268"
        width="212"
        height="32"
        rx="9"
        className="platform-ill-row platform-ill-r2 fill-muted/18 stroke-border/38"
        strokeWidth="1"
      />
      <rect
        x="110"
        y="276"
        width="9"
        height="14"
        rx="4.5"
        fill="none"
        className="platform-ill-icon platform-ill-icon-d2 stroke-primary/42"
        strokeWidth="1.15"
      />
      <path
        d="M114.5 290v5"
        className="platform-ill-icon platform-ill-icon-d2 stroke-primary/42"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <rect x="148" y="278" width="78" height="4" rx="2" className="cap-ill-bar fill-muted-foreground/11" />
      <rect x="148" y="286" width="52" height="3" rx="1.5" className="cap-ill-bar cap-ill-bar-delay fill-muted-foreground/7" />

      {/* Certificates / career */}
      <circle
        cx="78"
        cy="332"
        r="6.5"
        className="platform-ill-node platform-ill-node-d3 fill-primary/36 stroke-primary/52"
        strokeWidth="1"
      />
      <rect
        x="96"
        y="316"
        width="212"
        height="32"
        rx="9"
        className="platform-ill-row platform-ill-r3 fill-muted/18 stroke-border/38"
        strokeWidth="1"
      />
      <path
        d="M112 326l6.5 5 6.5-5v12h-13V326z"
        className="platform-ill-icon platform-ill-icon-d3 stroke-primary/48"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <circle cx="118.5" cy="329" r="1.8" className="platform-ill-icon platform-ill-icon-d3 fill-primary/50" />
      <rect x="148" y="324" width="68" height="4" rx="2" className="cap-ill-bar cap-ill-bar-delay fill-muted-foreground/11" />
      <rect x="148" y="332" width="46" height="3" rx="1.5" className="cap-ill-bar cap-ill-bar-delay-2 fill-muted-foreground/7" />
    </svg>
  )
}
