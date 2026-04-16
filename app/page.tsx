'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Code2, Brain, Zap, Shield, Cpu, GitBranch, Star, CheckCircle2, TrendingUp } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-background/95 backdrop-blur-md border-b border-border/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Code2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-foreground">CodeSpectra</span>
          </div>
          
          <div className="hidden md:flex gap-12 text-sm font-medium">
            <Link href="#capabilities" className="text-muted-foreground hover:text-foreground transition-colors duration-200">Capabilities</Link>
            <Link href="#process" className="text-muted-foreground hover:text-foreground transition-colors duration-200">How It Works</Link>
            <Link href="#testimonials" className="text-muted-foreground hover:text-foreground transition-colors duration-200">Testimonials</Link>
            <Link href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors duration-200">Pricing</Link>
          </div>

          <div className="flex gap-2">
            <Link href="/auth/login">
              <Button variant="ghost" className="text-sm">Sign In</Button>
            </Link>
            <Link href="/auth/signup">
              <Button size="sm" className="gap-1">
                Get Started <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-24 px-4 sm:px-6 lg:px-8 relative">
        {/* Background gradient effect */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-background/0 pointer-events-none" />
        
        <div className="max-w-5xl mx-auto text-center space-y-10 relative z-10">
          <div className="inline-block px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium text-primary mb-4">
            Master Code Through AI
          </div>
          
          <div className="space-y-6">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-foreground tracking-tight text-balance">
              The platform for developers who <span className="text-primary">master</span> their craft
            </h1>
            <p className="text-xl sm:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Real-time code analysis, competitive challenges, and AI-powered learning all in one place. Stop configuring. Start innovating.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
            <Link href="/setup">
              <Button size="lg" className="w-full sm:w-auto gap-2 text-base font-semibold h-12 px-8">
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-base font-semibold h-12 px-8">
                Watch Demo
              </Button>
            </Link>
          </div>

          {/* Social Proof Stats */}
          <div className="pt-16 grid grid-cols-3 gap-8">
            <div className="text-center space-y-2">
              <div className="text-4xl sm:text-5xl font-bold text-primary">10K+</div>
              <div className="text-sm sm:text-base text-muted-foreground font-medium">Active Developers</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-4xl sm:text-5xl font-bold text-primary">500+</div>
              <div className="text-sm sm:text-base text-muted-foreground font-medium">Code Challenges</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-4xl sm:text-5xl font-bold text-primary">1M+</div>
              <div className="text-sm sm:text-base text-muted-foreground font-medium">Solutions Analyzed</div>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities Section */}
      <section id="capabilities" className="py-32 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20 space-y-4">
            <h2 className="text-4xl sm:text-5xl font-bold text-foreground">Everything you need</h2>
            <p className="text-xl text-muted-foreground">Nothing you don&apos;t</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Feature 1 */}
            <div className="space-y-4 flex flex-col">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-primary/20">
                  <Cpu className="w-7 h-7 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-foreground">Real-time Code Analysis</h3>
                  <p className="text-muted-foreground mt-3 leading-relaxed">AI-powered analysis across 8+ languages. Get instant feedback on code quality, performance, security, and maintainability with actionable suggestions.</p>
                </div>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="space-y-4 flex flex-col">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-primary/20">
                  <Zap className="w-7 h-7 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-foreground">Competitive Challenges</h3>
                  <p className="text-muted-foreground mt-3 leading-relaxed">Solve 500+ algorithmic problems, compete on global leaderboards, and earn badges. Test your skills against developers worldwide with real-time rankings.</p>
                </div>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="space-y-4 flex flex-col">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-primary/20">
                  <Brain className="w-7 h-7 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-foreground">AI-Powered Learning</h3>
                  <p className="text-muted-foreground mt-3 leading-relaxed">Personalized learning paths with AI tutoring. Get real-time hints, code explanations, and optimization suggestions to accelerate your growth.</p>
                </div>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="space-y-4 flex flex-col">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 border border-primary/20">
                  <Shield className="w-7 h-7 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-foreground">Enterprise Security</h3>
                  <p className="text-muted-foreground mt-3 leading-relaxed">Bank-grade encryption, SOC 2 compliance, and granular access controls. Your code stays private, secure, and compliant with enterprise standards.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section id="process" className="py-32 px-4 sm:px-6 lg:px-8 bg-secondary/30 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20 space-y-4">
            <h2 className="text-4xl sm:text-5xl font-bold text-foreground">Three steps</h2>
            <p className="text-xl text-muted-foreground">Infinite possibilities</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { 
                number: 'I', 
                title: 'Connect your code', 
                description: 'Paste your code or connect GitHub. Start analysis in seconds.',
                icon: <GitBranch className="w-6 h-6" />
              },
              { 
                number: 'II', 
                title: 'Get instant feedback', 
                description: 'Real-time analysis with 8+ metrics and AI-powered suggestions.',
                icon: <Zap className="w-6 h-6" />
              },
              { 
                number: 'III', 
                title: 'Improve & compete', 
                description: 'Apply fixes, solve challenges, and track your progress over time.',
                icon: <TrendingUp className="w-6 h-6" />
              }
            ].map((step, i) => (
              <div key={i} className="space-y-6">
                <div className="space-y-3">
                  <div className="text-6xl font-light text-primary">{step.number}</div>
                  <h3 className="text-2xl font-bold text-foreground">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations Section */}
      <section className="py-32 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20 space-y-4">
            <h2 className="text-4xl sm:text-5xl font-bold text-foreground">Works with everything</h2>
            <p className="text-lg text-muted-foreground">Integrates seamlessly with your favorite developer tools</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-6">
            {['GitHub', 'Slack', 'Stripe', 'PostgreSQL', 'Docker', 'Vercel'].map((integration) => (
              <div key={integration} className="flex items-center justify-center p-6 rounded-lg border border-border bg-card hover:border-primary/20 hover:bg-primary/5 transition-all">
                <span className="font-semibold text-foreground text-center">{integration}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-32 px-4 sm:px-6 lg:px-8 bg-secondary/30 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20 space-y-4">
            <h2 className="text-4xl sm:text-5xl font-bold text-foreground">Simple, transparent pricing</h2>
            <p className="text-lg text-muted-foreground">Start free and scale as you grow. No hidden fees.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { 
                name: 'Starter', 
                price: '0', 
                features: [
                  'Up to 3 projects',
                  '10 challenges/month',
                  '1GB storage',
                  'Basic analytics',
                  'Community support'
                ] 
              },
              { 
                name: 'Pro', 
                price: '24', 
                features: [
                  'Unlimited projects',
                  'Unlimited challenges',
                  '100GB storage',
                  'Advanced analytics',
                  'Priority support',
                  'API access',
                  'Custom domains'
                ], 
                highlight: true 
              },
              { 
                name: 'Enterprise', 
                price: 'Custom', 
                features: [
                  'Everything in Pro',
                  'Unlimited storage',
                  '24/7 dedicated support',
                  'Custom integrations',
                  'SLA guarantee',
                  'On-premise option',
                  'Security audit'
                ] 
              }
            ].map((plan, i) => (
              <div
                key={i}
                className={`p-8 rounded-lg border transition-all ${
                  plan.highlight
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20 md:scale-105'
                    : 'border-border bg-background hover:border-primary/20'
                }`}
              >
                {plan.highlight && (
                  <div className="inline-block px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary mb-4">
                    Most Popular
                  </div>
                )}
                <h3 className="text-2xl font-bold text-foreground mb-4">{plan.name}</h3>
                <div className="mb-6">
                  <span className="text-5xl font-bold text-foreground">{plan.price}</span>
                  {plan.price !== 'Custom' && <span className="text-muted-foreground ml-2">/month</span>}
                </div>
                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="text-foreground flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button 
                  className="w-full" 
                  variant={plan.highlight ? 'default' : 'outline'}
                >
                  {plan.name === 'Enterprise' ? 'Contact Sales' : 'Get Started'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-24 px-4 sm:px-6 lg:px-8 bg-secondary/30 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl sm:text-5xl font-bold text-foreground">Loved by developers worldwide</h2>
            <p className="text-lg text-muted-foreground">See what developers are saying about CodeSpectra</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                name: 'Alex Johnson',
                role: 'Full Stack Engineer',
                company: 'Tech Startup',
                content: 'CodeSpectra transformed how I approach code quality. The AI suggestions are spot-on and helped me improve my skills significantly.',
                rating: 5
              },
              {
                name: 'Maria Chen',
                role: 'Tech Lead',
                company: 'Enterprise Corp',
                content: 'Best decision for our team. The competitive arena keeps everyone engaged while the analysis tools ensure quality standards.',
                rating: 5
              },
              {
                name: 'David Kumar',
                role: 'Junior Developer',
                company: 'StartUp Inc',
                content: 'As a junior, the learning path and AI tutoring have been incredible. I went from struggling to confident in 3 months.',
                rating: 5
              }
            ].map((testimonial, i) => (
              <div key={i} className="p-8 rounded-lg border border-border bg-card hover:border-primary/20 transition-colors">
                <div className="flex gap-1 mb-4">
                  {Array(testimonial.rating).fill(null).map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-foreground mb-6 leading-relaxed">{testimonial.content}</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center text-sm font-semibold text-primary">
                    {testimonial.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">{testimonial.name}</p>
                    <p className="text-xs text-muted-foreground">{testimonial.role} at {testimonial.company}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-12 sm:p-16 text-center space-y-8">
            <div className="space-y-4">
              <h2 className="text-4xl sm:text-5xl font-bold text-foreground">Ready to master code?</h2>
              <p className="text-lg text-muted-foreground">Join 10,000+ developers improving their craft with CodeSpectra.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/auth/signup">
                <Button size="lg" className="gap-2 text-base font-semibold">
                  Start Your Free Trial <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/auth/login">
                <Button size="lg" variant="outline" className="text-base font-semibold">
                  Sign In
                </Button>
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">No credit card required. Free access to all starter features.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-16 px-4 sm:px-6 lg:px-8 bg-secondary/30">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Code2 className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="font-bold text-foreground">CodeSpectra</span>
              </div>
              <p className="text-sm text-muted-foreground">Master code through AI</p>
            </div>
            <div className="space-y-4">
              <p className="font-semibold text-foreground text-sm">Product</p>
              <div className="space-y-3 text-sm">
                <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors block">Features</Link>
                <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors block">Pricing</Link>
                <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors block">Challenges</Link>
              </div>
            </div>
            <div className="space-y-4">
              <p className="font-semibold text-foreground text-sm">Company</p>
              <div className="space-y-3 text-sm">
                <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors block">About</Link>
                <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors block">Blog</Link>
                <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors block">Careers</Link>
              </div>
            </div>
            <div className="space-y-4">
              <p className="font-semibold text-foreground text-sm">Legal</p>
              <div className="space-y-3 text-sm">
                <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors block">Privacy</Link>
                <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors block">Terms</Link>
                <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors block">Security</Link>
              </div>
            </div>
          </div>
          
          <div className="border-t border-border pt-8 flex flex-col sm:flex-row justify-between items-center text-sm text-muted-foreground">
            <p>© 2026 CodeSpectra. All rights reserved.</p>
            <div className="flex gap-8 mt-6 sm:mt-0">
              <Link href="#" className="hover:text-foreground transition-colors">Twitter</Link>
              <Link href="#" className="hover:text-foreground transition-colors">GitHub</Link>
              <Link href="#" className="hover:text-foreground transition-colors">LinkedIn</Link>
              <Link href="#" className="hover:text-foreground transition-colors">Discord</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
