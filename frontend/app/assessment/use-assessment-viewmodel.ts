'use client'

import { useState } from 'react'
import {
  ShieldCheck,
  Smartphone,
  Eye,
  Users,
  Code2,
  Video,
  Sparkles,
  BarChart3,
  Library,
} from 'lucide-react'

export interface EcosystemItem {
  icon: any
  title: string
  desc: string
  testid: string
}

export interface StepItem {
  n: number
  title: string
  desc: string
}

export interface FaqItem {
  q: string
  a: string
}

export const ECOSYSTEM: EcosystemItem[] = [
  {
    icon: ShieldCheck,
    title: 'Tab Switch Monitoring',
    desc: 'Tracks focus loss instantly. If a candidate switches tabs or windows to search for answers, the system flags the violation and alerts the admin.',
    testid: 'feat-tab-switch',
  },
  {
    icon: Smartphone,
    title: 'Mobile Phone Detection',
    desc: "AI vision continuously monitors the video feed. If a phone is detected in the candidate's hand or on the desk, the session is flagged as suspicious.",
    testid: 'feat-mobile',
  },
  {
    icon: Eye,
    title: 'Object Detection',
    desc: 'Identifies unauthorized items such as books, external monitors, or smartwatches to ensure candidates rely solely on their own knowledge.',
    testid: 'feat-object',
  },
  {
    icon: Users,
    title: 'Human Presence AI',
    desc: 'Ensures the registered candidate is the one taking the test. Flags incidents if the face disappears or if multiple people are detected in the frame.',
    testid: 'feat-presence',
  },
  {
    icon: Code2,
    title: 'Multi-Language IDE',
    desc: 'A powerful in-browser code editor supporting 40+ languages (Python, Java, C++, JS, Go, Rust…) with intelligent syntax highlighting and compilation.',
    testid: 'feat-ide',
  },
  {
    icon: Video,
    title: 'Session Playback',
    desc: 'Full video recording of every assessment session. Recruiters can review the timeline to verify flagged behaviors manually at any time.',
    testid: 'feat-playback',
  },
  {
    icon: Sparkles,
    title: 'Instant AI Grading',
    desc: "Don't wait for manual reviews. Our AI evaluates code quality, efficiency, and edge cases instantly, giving you a score in seconds.",
    testid: 'feat-grading',
  },
  {
    icon: BarChart3,
    title: 'Deep Skill Analytics',
    desc: "Go beyond pass/fail. Get detailed reports on a candidate's problem-solving speed, code maintainability, and logical accuracy.",
    testid: 'feat-analytics',
  },
  {
    icon: Library,
    title: 'Smart Question Library',
    desc: 'Access thousands of pre-vetted coding challenges or use AI to generate unique questions tailored to your specific job description.',
    testid: 'feat-library',
  },
]

export const STEPS: StepItem[] = [
  {
    n: 1,
    title: 'Sign Up & Start',
    desc: 'Create your organization account in seconds to access the dashboard and build your talent pipeline instantly.',
  },
  {
    n: 2,
    title: 'Generate with AI',
    desc: 'Select difficulty and skills. Our AI instantly builds relevant, code-compliant questions for you.',
  },
  {
    n: 3,
    title: 'Set Controls',
    desc: 'Define time limits, strict deadlines, and proctoring rules to ensure test integrity and fairness.',
  },
  {
    n: 4,
    title: 'Invite Candidates',
    desc: 'Send secure access links directly to candidates via email. No account creation required for them.',
  },
]

export const FAQ: FaqItem[] = [
  {
    q: 'Is there a free trial available?',
    a: 'Yes, you can try CodeSpectra free for 30 days — no credit card required.',
  },
  {
    q: 'Can I change my plan later?',
    a: 'Of course. Plans scale with your team size and feature needs. Upgrade or downgrade any time.',
  },
  {
    q: 'How does AI grading work?',
    a: 'After a candidate submits, our AI runs all test cases, then evaluates code quality, time/space complexity, edge cases, and readability against your rubric.',
  },
  {
    q: 'What languages are supported?',
    a: 'Python, JavaScript, TypeScript, Java, C++, C#, Go, Rust, Ruby, PHP, Kotlin, Swift and 30+ more via the in-browser IDE.',
  },
  {
    q: 'Do candidates need an account?',
    a: 'No — they receive a secure access link by email and join the assessment directly.',
  },
]

export function useAssessmentViewModel() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index)
  }

  return {
    openFaq,
    toggleFaq,
    ecosystem: ECOSYSTEM,
    steps: STEPS,
    faq: FAQ,
  }
}
