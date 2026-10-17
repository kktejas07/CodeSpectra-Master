'use client'

import { type LucideIcon, CheckCircle } from 'lucide-react'

interface Step {
  n: number
  label: string
  icon: LucideIcon
}

interface EventStepIndicatorProps {
  steps: Step[]
  currentStep: number
  onStepClick?: (n: number) => void
}

export function EventStepIndicator({ steps, currentStep, onStepClick }: EventStepIndicatorProps) {
  return (
    <div className="flex items-center justify-between">
      {/* Mobile: show current step only */}
      <div className="sm:hidden flex items-center gap-2">
        {steps.map((s) => {
          const isCurrent = currentStep === s.n
          const isCompleted = currentStep > s.n
          if (!isCurrent && !isCompleted) return null
          const Icon = s.icon
          return (
            <div key={s.n} className="flex items-center gap-2">
              {isCompleted ? (
                <CheckCircle className="w-4 h-4 text-primary" />
              ) : (
                <Icon className="w-4 h-4 text-primary" />
              )}
              <span className="text-sm font-medium">
                {isCompleted ? 'Done' : s.label}
              </span>
            </div>
          )
        })}
        <span className="text-xs text-muted-foreground ml-2">
          Step {currentStep} of {steps.length}
        </span>
      </div>

      {/* Desktop: show full stepper */}
      <div className="hidden sm:flex items-center gap-1">
        {steps.map((s, i) => {
          const isCompleted = currentStep > s.n
          const isCurrent = currentStep === s.n
          const Icon = s.icon
          return (
            <div key={s.n} className="flex items-center">
              <button
                onClick={() => onStepClick?.(s.n)}
                disabled={!onStepClick}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isCurrent
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : isCompleted
                    ? 'bg-primary/10 text-primary hover:bg-primary/15'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                } ${onStepClick ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {isCompleted ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
                <span className="hidden md:inline">{s.label}</span>
                <span className="md:hidden">{s.n}</span>
              </button>
              {i < steps.length - 1 && (
                <div className={`w-6 lg:w-10 h-px mx-1 transition-colors ${
                  isCompleted ? 'bg-primary/60' : 'bg-border'
                }`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Step counter */}
      <span className="text-xs text-muted-foreground shrink-0 ml-3">
        {currentStep < steps.length
          ? `${steps.length - currentStep} step${steps.length - currentStep > 1 ? 's' : ''} remaining`
          : 'Ready'}
      </span>
    </div>
  )
}
