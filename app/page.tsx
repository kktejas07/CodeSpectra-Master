'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Code2, Brain, Zap, Shield, Cpu, GitBranch } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
              <Code2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-foreground">CodeSpectra</span>
          </div>
          
          <div className="hidden md:flex gap-8 text-sm">
            <Link href="#capabilities" className="text-muted-foreground hover:text-foreground transition">Capabilities</Link>
            <Link href="#process" className="text-muted-foreground hover:text-foreground transition">Process</Link>
            <Link href="#pricing" className="text-muted-foreground hover:text-foreground transition">Pricing</Link>
          </div>

          <div className="flex gap-3">
            <Link href="/auth/login">
              <Button variant="ghost" className="text-sm">Sign In</Button>
            </Link>
            <Link href="/auth/signup">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold text-foreground tracking-tight">
              The platform to <span className="text-primary">master</span> code
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              Your toolkit to stop configuring and start innovating. Real-time code analysis, competitive challenges, and AI-powered learning.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link href="/setup">
              <Button size="lg" className="w-full sm:w-auto gap-2">
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Watch Demo
              </Button>
            </Link>
          </div>

          {/* Stats */}
          <div className="pt-12 grid grid-cols-3 gap-6 sm:gap-12">
            <div className="text-center">
              <div className="text-3xl sm:text-4xl font-semibold text-foreground">10K+</div>
              <div className="text-sm text-muted-foreground mt-1">Developers</div>
            </div>
            <div className="text-center">
              <div className="text-3xl sm:text-4xl font-semibold text-foreground">500+</div>
              <div className="text-sm text-muted-foreground mt-1">Challenges</div>
            </div>
            <div className="text-center">
              <div className="text-3xl sm:text-4xl font-semibold text-foreground">1M+</div>
              <div className="text-sm text-muted-foreground mt-1">Submissions</div>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities Section */}
      <section id="capabilities" className="py-24 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl sm:text-5xl font-semibold text-foreground">Capabilities</h2>
            <p className="text-lg text-muted-foreground">Everything you need. Nothing you don't.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Feature 1 */}
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded flex items-center justify-center flex-shrink-0">
                  <Cpu className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Real-time Code Analysis</h3>
                  <p className="text-muted-foreground mt-2">AI-powered analysis across multiple languages with instant feedback on code quality, performance, and security.</p>
                </div>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded flex items-center justify-center flex-shrink-0">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Competitive Challenges</h3>
                  <p className="text-muted-foreground mt-2">Solve algorithmic problems, compete on leaderboards, and earn badges. Test your skills against developers worldwide.</p>
                </div>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded flex items-center justify-center flex-shrink-0">
                  <Brain className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">AI-Powered Learning</h3>
                  <p className="text-muted-foreground mt-2">Personalized learning paths with AI tutoring, code explanations, and real-time hints to accelerate your growth.</p>
                </div>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded flex items-center justify-center flex-shrink-0">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Enterprise Security</h3>
                  <p className="text-muted-foreground mt-2">Bank-grade encryption, SOC 2 compliance, and granular access controls. Your code stays private and secure.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section id="process" className="py-24 px-4 sm:px-6 lg:px-8 bg-secondary/30 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl sm:text-5xl font-semibold text-foreground">Three steps</h2>
            <p className="text-lg text-muted-foreground">Infinite possibilities</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { number: 'I', title: 'Connect your repos', description: 'Link your GitHub repositories and other integrations in seconds.' },
              { number: 'II', title: 'Analyze & Learn', description: 'Get instant feedback on your code. Solve challenges and learn from solutions.' },
              { number: 'III', title: 'Ship with confidence', description: 'Deploy knowing your code meets quality standards and security best practices.' }
            ].map((step, i) => (
              <div key={i} className="space-y-4">
                <div className="text-5xl font-light text-primary">{step.number}</div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl sm:text-5xl font-semibold text-foreground">Works with everything</h2>
            <p className="text-lg text-muted-foreground">Integrates with your entire developer stack</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-8">
            {['GitHub', 'Slack', 'Stripe', 'PostgreSQL', 'Docker', 'Vercel'].map((integration) => (
              <div key={integration} className="flex items-center justify-center p-6 rounded-lg border border-border bg-card/30">
                <span className="text-sm font-medium text-foreground text-center">{integration}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8 bg-secondary/30 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl sm:text-5xl font-semibold text-foreground">Simple, transparent pricing</h2>
            <p className="text-lg text-muted-foreground">Start free and scale as you grow</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { name: 'Starter', price: '0', features: ['Up to 3 projects', '1GB storage', 'Community support'] },
              { name: 'Pro', price: '24', features: ['Unlimited projects', '100GB storage', 'Priority support', 'API access'], highlight: true },
              { name: 'Enterprise', price: 'Custom', features: ['Everything in Pro', 'Unlimited storage', '24/7 support', 'Custom integrations'] }
            ].map((plan, i) => (
              <div
                key={i}
                className={`p-8 rounded-lg border transition-all ${
                  plan.highlight
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-border bg-card/30'
                }`}
              >
                <h3 className="text-xl font-semibold text-foreground mb-2">{plan.name}</h3>
                <div className="mb-6">
                  <span className="text-4xl font-semibold text-foreground">{plan.price}</span>
                  {plan.price !== 'Custom' && <span className="text-muted-foreground">/mo</span>}
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="text-sm text-muted-foreground flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button className="w-full" variant={plan.highlight ? 'default' : 'outline'}>
                  {plan.name === 'Enterprise' ? 'Contact Sales' : 'Get Started'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-4xl sm:text-5xl font-semibold text-foreground">Ready to master code?</h2>
            <p className="text-lg text-muted-foreground">Join thousands of developers improving their craft with CodeSpectra.</p>
          </div>
          <Link href="/auth/signup">
            <Button size="lg" className="gap-2">
              Start Your Free Trial <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-4 sm:px-6 lg:px-8 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Code2 className="w-5 h-5 text-primary" />
                <span className="font-semibold text-foreground">CodeSpectra</span>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <p className="font-medium text-foreground">Product</p>
              <Link href="#" className="text-muted-foreground hover:text-foreground transition">Features</Link>
              <Link href="#" className="text-muted-foreground hover:text-foreground transition">Pricing</Link>
            </div>
            <div className="space-y-3 text-sm">
              <p className="font-medium text-foreground">Company</p>
              <Link href="#" className="text-muted-foreground hover:text-foreground transition">About</Link>
              <Link href="#" className="text-muted-foreground hover:text-foreground transition">Blog</Link>
            </div>
            <div className="space-y-3 text-sm">
              <p className="font-medium text-foreground">Legal</p>
              <Link href="#" className="text-muted-foreground hover:text-foreground transition">Privacy</Link>
              <Link href="#" className="text-muted-foreground hover:text-foreground transition">Terms</Link>
            </div>
          </div>
          
          <div className="border-t border-border pt-8 flex flex-col sm:flex-row justify-between items-center text-sm text-muted-foreground">
            <p>© 2026 CodeSpectra. All rights reserved.</p>
            <div className="flex gap-6 mt-4 sm:mt-0">
              <Link href="#" className="hover:text-foreground transition">Twitter</Link>
              <Link href="#" className="hover:text-foreground transition">GitHub</Link>
              <Link href="#" className="hover:text-foreground transition">LinkedIn</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
