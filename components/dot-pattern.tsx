'use client'

export function DotPattern() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id="dots"
          x="0"
          y="0"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <circle
            cx="20"
            cy="20"
            r="1.5"
            fill="currentColor"
            opacity="0.15"
          />
        </pattern>
        <pattern
          id="dots-grid"
          x="0"
          y="0"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <circle
            cx="10"
            cy="10"
            r="1"
            fill="currentColor"
            opacity="0.1"
          />
          <circle
            cx="30"
            cy="10"
            r="1"
            fill="currentColor"
            opacity="0.1"
          />
          <circle
            cx="10"
            cy="30"
            r="1"
            fill="currentColor"
            opacity="0.1"
          />
          <circle
            cx="30"
            cy="30"
            r="1"
            fill="currentColor"
            opacity="0.1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots-grid)" />
    </svg>
  )
}
