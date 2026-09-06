import { useEffect } from 'react'
import { useTour } from './tour-context'
import type { TourStep } from './tour-context'

export function useAutoTour(steps: TourStep[], enabled = true, tourId?: string) {
  const { startTour, setTourSeen } = useTour()

  useEffect(() => {
    if (enabled && steps.length > 0) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        startTour(steps, tourId)
        if (tourId) setTourSeen(tourId)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [steps, enabled, startTour, tourId, setTourSeen])
}

// Pre-built tours for key pages
export const DASHBOARD_TOURS: Record<string, TourStep[]> = {
  welcome: [
    {
      target: '[data-tour="dashboard-overview"]',
      title: 'Welcome to CodeSpectra!',
      description: 'Your AI-powered engineering platform. Get insights into your code, practice challenges, and showcase your skills.',
      position: 'bottom',
    },
    {
      target: '[data-tour="practice-arena"]',
      title: 'Practice Arena',
      description: 'Challenge yourself with coding problems and interview questions. Track your progress and compete with peers.',
      position: 'bottom',
    },
    {
      target: '[data-tour="scanner-tool"]',
      title: 'Code Scanner',
      description: 'AI-powered code analysis that identifies issues, suggests improvements, and provides security insights.',
      position: 'bottom',
    },
  ],
  scanner: [
    {
      target: '[data-tour="scanner-input"]',
      title: 'Paste Your Code',
      description: 'Drop or paste your code here for instant AI analysis.',
      position: 'bottom',
    },
    {
      target: '[data-tour="scan-button"]',
      title: 'Start Analysis',
      description: 'Click to scan your code for bugs, security issues, and optimization opportunities.',
      position: 'bottom',
    },
    {
      target: '[data-tour="results-panel"]',
      title: 'View Results',
      description: 'Detailed findings with severity ratings, explanations, and actionable fix suggestions.',
      position: 'left',
    },
  ],
  arena: [
    {
      target: '[data-tour="problem-list"]',
      title: 'Challenge Library',
      description: 'Browse coding problems by difficulty, topic, and popularity.',
      position: 'bottom',
    },
    {
      target: '[data-tour="solve-button"]',
      title: 'Solve Problems',
      description: 'Use our built-in IDE to write, test, and submit solutions with instant feedback.',
      position: 'bottom',
    },
    {
      target: '[data-tour="leaderboard"]',
      title: 'Leaderboard',
      description: 'See how you rank against other developers and track your progress over time.',
      position: 'bottom',
    },
  ],
}