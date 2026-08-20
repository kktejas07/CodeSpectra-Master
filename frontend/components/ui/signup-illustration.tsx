export function SignupIllustration() {
  return (
    <svg viewBox="0 0 800 600" className="w-full h-auto drop-shadow-2xl animate-in fade-in zoom-in duration-1000" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="grad2" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.9" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      
      {/* Floating Elements */}
      <g className="animate-[bounce_4s_infinite]">
        <rect x="150" y="100" width="80" height="80" rx="20" fill="url(#grad1)" transform="rotate(15 150 100)" />
      </g>
      <g className="animate-[bounce_5s_infinite_reverse]">
        <circle cx="650" cy="150" r="45" fill="url(#grad2)" />
      </g>
      <g className="animate-[bounce_6s_infinite]">
        <polygon points="120,450 180,550 60,550" fill="url(#grad1)" opacity="0.6" />
      </g>
      
      {/* Central Interface Mockup */}
      <rect x="200" y="200" width="400" height="250" rx="16" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="2" />
      <rect x="200" y="200" width="400" height="40" rx="16" fill="hsl(var(--muted))" />
      <circle cx="225" cy="220" r="6" fill="#FF5F56" />
      <circle cx="245" cy="220" r="6" fill="#FFBD2E" />
      <circle cx="265" cy="220" r="6" fill="#27C93F" />
      
      {/* Code Lines */}
      <rect x="230" y="270" width="200" height="12" rx="6" fill="url(#grad1)" />
      <rect x="230" y="300" width="300" height="12" rx="6" fill="hsl(var(--muted-foreground))" opacity="0.4" />
      <rect x="230" y="330" width="250" height="12" rx="6" fill="hsl(var(--muted-foreground))" opacity="0.4" />
      <rect x="230" y="360" width="150" height="12" rx="6" fill="url(#grad2)" />
      
      {/* Sparkles */}
      <path d="M 600 350 Q 625 350 625 325 Q 625 350 650 350 Q 625 350 625 375 Q 625 350 600 350 Z" fill="hsl(var(--primary))" className="animate-pulse" />
      <path d="M 180 250 Q 190 250 190 240 Q 190 250 200 250 Q 190 250 190 260 Q 190 250 180 250 Z" fill="hsl(var(--primary))" className="animate-pulse" />
    </svg>
  )
}
