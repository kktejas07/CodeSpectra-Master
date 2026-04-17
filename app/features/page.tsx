'use client'

import { Card } from '@/components/ui/card'
import { Code2, Zap, Shield, BarChart3, GitBranch, Cpu } from 'lucide-react'

export default function FeaturesPage() {
  const features = [
    {
      icon: Code2,
      title: 'Advanced Code Analysis',
      description: 'Deep analysis of your code to detect bugs, vulnerabilities, and code smells.',
    },
    {
      icon: Zap,
      title: 'Real-time Scanning',
      description: 'Get instant feedback on code changes with our real-time scanning engine.',
    },
    {
      icon: Shield,
      title: 'Security Scanning',
      description: 'Identify and fix security vulnerabilities before they become a problem.',
    },
    {
      icon: BarChart3,
      title: 'Detailed Reports',
      description: 'Comprehensive reports with actionable insights and recommendations.',
    },
    {
      icon: GitBranch,
      title: 'Repository Integration',
      description: 'Seamless integration with GitHub, GitLab, and other repository platforms.',
    },
    {
      icon: Cpu,
      title: 'Performance Metrics',
      description: 'Track performance metrics and optimize your code for better efficiency.',
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="pt-20 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
          Powerful Features for Better Code
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Everything you need to write cleaner, more secure, and more efficient code.
        </p>
      </div>

      {/* Features Grid */}
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pb-20">
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, idx) => {
            const Icon = feature.icon
            return (
              <Card key={idx} className="p-8 hover:shadow-lg transition-shadow">
                <Icon className="w-12 h-12 text-primary mb-4" />
                <h3 className="text-xl font-bold text-foreground mb-3">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Detailed Features */}
      <div className="bg-muted/30 px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground mb-12 text-center">
            Why Developers Love CodeSpectra
          </h2>

          <div className="grid md:grid-cols-2 gap-12">
            {[
              {
                title: '40+ Language Support',
                description: 'Analyze code in JavaScript, Python, Java, C++, Go, Rust, TypeScript, PHP, and 30+ more languages.',
              },
              {
                title: 'Customizable Rules',
                description: 'Create custom analysis rules to match your team\'s coding standards and best practices.',
              },
              {
                title: 'Team Collaboration',
                description: 'Share insights with your team, assign issues, and track progress together.',
              },
              {
                title: 'API Access',
                description: 'Integrate CodeSpectra into your workflows with our comprehensive API.',
              },
              {
                title: 'Historical Tracking',
                description: 'Monitor code quality trends over time with detailed analytics and dashboards.',
              },
              {
                title: 'CI/CD Integration',
                description: 'Automatically scan code as part of your continuous integration pipeline.',
              },
            ].map((item, idx) => (
              <div key={idx}>
                <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
