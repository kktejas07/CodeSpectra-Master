'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  CheckCircle2,
  ShieldCheck,
  Smartphone,
  Eye,
  Users,
  Code2,
  Video,
  Sparkles,
  BarChart3,
  Library,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ECOSYSTEM = [
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

const STEPS = [
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

const FAQ = [
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

export default function AssessmentPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="assessment-page">
      {/* Top nav */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-linear-to-br from-primary to-primary/70">
              <Code2 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight">CodeSpectra</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/assessment" className="text-foreground">Assessment</Link>
            <Link href="/problems" className="hover:text-foreground">Problems</Link>
            <Link href="/dashboard/agent" className="hover:text-foreground">Agent</Link>
            <Link href="/dashboard" className="hover:text-foreground">Dashboard</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/auth/login">
              <Button variant="ghost" size="sm">Log in</Button>
            </Link>
            <Link href="/auth/signup">
              <Button size="sm" data-testid="cta-signup">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-primary/8 via-background to-background" />
        <div className="mx-auto max-w-7xl px-4 py-16 lg:py-24">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary mb-5">
              <Sparkles className="h-3 w-3" /> AI-Powered Assessments
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
              Streamline your recruitment with{' '}
              <span className="text-primary">intelligent assessments</span>
            </h1>
            <p className="mt-5 text-base text-muted-foreground max-w-2xl">
              Build successful teams by combining fresh talent with data-driven insights and
              verified technical execution. Real-time AI proctoring, automated environments,
              and deep skill analytics — all in one platform.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/auth/signup">
                <Button size="lg" data-testid="hero-get-started">
                  Get started <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
              <Link href="/problems">
                <Button size="lg" variant="outline" data-testid="hero-try-ide">
                  Try the IDE
                </Button>
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              {['Precision', 'Scalability', 'Intelligence', 'Efficiency', 'Insight'].map((v) => (
                <span key={v} className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {v}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Ecosystem */}
      <section className="border-t border-border/40">
        <div className="mx-auto max-w-7xl px-4 py-16 lg:py-20">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold">Complete assessment ecosystem</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              From AI proctoring to detailed analytics, everything you need to hire the best.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ECOSYSTEM.map((f) => (
              <div
                key={f.title}
                className="group rounded-xl border border-border/60 bg-card/40 p-5 hover:border-primary/40 hover:bg-card/60 transition"
                data-testid={f.testid}
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-4 w-4" />
                </div>
                <h3 className="font-semibold text-sm">{f.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border/40 bg-card/20">
        <div className="mx-auto max-w-7xl px-4 py-16 lg:py-20">
          <h2 className="text-2xl sm:text-3xl font-bold mb-10 text-center">
            How it works
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-xl border border-border/60 bg-background p-5"
                data-testid={`step-${s.n}`}
              >
                <div className="text-3xl font-bold text-primary/90">{s.n}.</div>
                <h3 className="mt-1 font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Automated Technical Assessment */}
      <section className="border-t border-border/40">
        <div className="mx-auto max-w-3xl px-4 py-16 lg:py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold">Automated technical assessment</h2>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Aligning fresh talent with corporate objectives requires more than a resume scan.
            We provide a comprehensive evaluation ecosystem that navigates the complexities of
            technical recruiting, giving you the data-driven insights needed to achieve lasting
            business success.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border/40 bg-card/10">
        <div className="mx-auto max-w-3xl px-4 py-16 lg:py-20">
          <div className="mb-8 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold">Frequently asked questions</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Everything you need to know about the product and billing.
            </p>
          </div>
          <div className="space-y-2">
            {FAQ.map((q, i) => (
              <div
                key={q.q}
                className="rounded-xl border border-border/60 bg-background overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
                  data-testid={`faq-toggle-${i}`}
                >
                  <span>{q.q}</span>
                  <span
                    className={cn(
                      'inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-xs transition',
                      openFaq === i ? 'rotate-45 bg-primary text-primary-foreground border-primary' : '',
                    )}
                  >
                    +
                  </span>
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-4 text-sm text-muted-foreground">{q.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/40">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold">Still thinking about it?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign up for free — no card required. Run your first assessment in under 5 minutes.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/auth/signup">
              <Button size="lg" data-testid="footer-cta">
                Book a free demo <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} CodeSpectra · We care about your data — see our{' '}
        <Link href="/privacy" className="underline">privacy policy</Link>.
      </footer>
    </div>
  )
}
