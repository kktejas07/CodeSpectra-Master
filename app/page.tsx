'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Code2, Brain, Trophy, Zap } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Code2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">CodeSpectra</span>
          </div>
          
          <div className="hidden md:flex gap-8">
            <Link href="#features" className="text-foreground/70 hover:text-foreground transition">Features</Link>
            <Link href="#pricing" className="text-foreground/70 hover:text-foreground transition">Pricing</Link>
            <Link href="#faq" className="text-foreground/70 hover:text-foreground transition">FAQ</Link>
          </div>

          <div className="flex gap-3">
            <Link href="/auth/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/auth/signup">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block mb-6 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full">
            <span className="text-primary text-sm font-medium">AI-Powered Code Mastery</span>
          </div>
          
          <h1 className="text-5xl sm:text-6xl font-bold text-foreground mb-6 leading-tight">
            Master Code Through <span className="text-primary">Intelligence</span>
          </h1>
          
          <p className="text-xl text-foreground/70 mb-8 max-w-2xl mx-auto">
            Get real-time code analysis, solve competitive challenges, learn from AI, and climb the leaderboards. CodeSpectra transforms how developers grow their skills.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/setup">
              <Button size="lg" className="w-full sm:w-auto">
                Try Demo <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Create Account
              </Button>
            </Link>
          </div>

          {/* Hero Stats */}
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div className="p-6 rounded-lg bg-card border border-border">
              <div className="text-3xl font-bold text-primary mb-2">10K+</div>
              <div className="text-foreground/60 text-sm">Active Developers</div>
            </div>
            <div className="p-6 rounded-lg bg-card border border-border">
              <div className="text-3xl font-bold text-primary mb-2">500+</div>
              <div className="text-foreground/60 text-sm">Code Challenges</div>
            </div>
            <div className="p-6 rounded-lg bg-card border border-border">
              <div className="text-3xl font-bold text-primary mb-2">1M+</div>
              <div className="text-foreground/60 text-sm">Submissions Analyzed</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-foreground mb-4">Powerful Features</h2>
            <p className="text-foreground/70 text-lg">Everything you need to level up your coding skills</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Code Scanner */}
            <div className="p-8 rounded-xl bg-card border border-border hover:border-primary/50 transition">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Code2 className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">Code Scanner</h3>
              <p className="text-foreground/70">AI-powered real-time analysis of your code. Get instant feedback on quality, performance, and best practices.</p>
            </div>

            {/* Arena Challenges */}
            <div className="p-8 rounded-xl bg-card border border-border hover:border-primary/50 transition">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Trophy className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">Coding Arena</h3>
              <p className="text-foreground/70">Compete with challenges ranging from beginner to expert. Execute code securely and test against real test cases.</p>
            </div>

            {/* Learning Paths */}
            <div className="p-8 rounded-xl bg-card border border-border hover:border-primary/50 transition">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Brain className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">Learning Platform</h3>
              <p className="text-foreground/70">Structured courses from industry experts. Learn concepts, see practical examples, and apply skills immediately.</p>
            </div>

            {/* Leaderboards */}
            <div className="p-8 rounded-xl bg-card border border-border hover:border-primary/50 transition">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">Global Leaderboards</h3>
              <p className="text-foreground/70">Track your progress with streaks, badges, and rankings. Compare with developers worldwide and climb the ranks.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 rounded-2xl p-12 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Ready to Transform Your Coding Skills?</h2>
          <p className="text-foreground/70 text-lg mb-8">Join thousands of developers improving their craft with CodeSpectra.</p>
          <Link href="/auth/signup">
            <Button size="lg" className="w-full sm:w-auto">
              Start Your Free Trial Now
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-4 sm:px-6 lg:px-8 bg-card/50">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Code2 className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground">CodeSpectra</span>
            </div>
            
            <div className="flex gap-8 text-foreground/70 text-sm">
              <Link href="#" className="hover:text-foreground transition">Privacy</Link>
              <Link href="#" className="hover:text-foreground transition">Terms</Link>
              <Link href="#" className="hover:text-foreground transition">Contact</Link>
            </div>

            <div className="text-foreground/50 text-sm">
              © 2026 CodeSpectra. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
