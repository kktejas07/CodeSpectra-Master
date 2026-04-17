'use client'

import { Card } from '@/components/ui/card'
import { Users, Zap, Target, Award } from 'lucide-react'

export default function AboutPage() {
  const team = [
    { name: 'Alice Chen', role: 'CEO & Founder', image: '👩‍💼' },
    { name: 'Bob Kumar', role: 'CTO', image: '👨‍💻' },
    { name: 'Carol Davis', role: 'Head of Product', image: '👩‍🔬' },
    { name: 'David Wilson', role: 'Lead Engineer', image: '👨‍🏫' },
  ]

  const values = [
    {
      icon: Zap,
      title: 'Innovation',
      description: 'We constantly push the boundaries of what\'s possible in code analysis.',
    },
    {
      icon: Users,
      title: 'Community',
      description: 'Our platform thrives on collaboration and shared learning.',
    },
    {
      icon: Target,
      title: 'Quality',
      description: 'We maintain the highest standards in accuracy and reliability.',
    },
    {
      icon: Award,
      title: 'Excellence',
      description: 'Excellence is not a goal, it\'s our standard in everything we do.',
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="pt-20 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
          About CodeSpectra
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Empowering developers worldwide to write better, more secure, and more efficient code.
        </p>
      </div>

      {/* Mission */}
      <div className="px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto py-12">
        <Card className="p-12 bg-primary/5 border-primary/20">
          <h2 className="text-3xl font-bold text-foreground mb-4">Our Mission</h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            CodeSpectra is dedicated to revolutionizing code quality analysis. We believe that every developer deserves access to advanced tools that help them write cleaner, more secure, and more maintainable code. Our mission is to make professional-grade code analysis accessible to everyone.
          </p>
        </Card>
      </div>

      {/* Values */}
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-20">
        <h2 className="text-3xl font-bold text-foreground mb-12 text-center">Our Values</h2>
        <div className="grid md:grid-cols-4 gap-8">
          {values.map((value, idx) => {
            const Icon = value.icon
            return (
              <Card key={idx} className="p-6 text-center">
                <Icon className="w-12 h-12 text-primary mx-auto mb-4" />
                <h3 className="text-lg font-bold text-foreground mb-2">{value.title}</h3>
                <p className="text-sm text-muted-foreground">{value.description}</p>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Team */}
      <div className="bg-muted/30 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-20">
        <h2 className="text-3xl font-bold text-foreground mb-12 text-center">Leadership Team</h2>
        <div className="grid md:grid-cols-4 gap-8">
          {team.map((member, idx) => (
            <Card key={idx} className="p-6 text-center">
              <div className="text-5xl mb-4">{member.image}</div>
              <h3 className="text-lg font-bold text-foreground">{member.name}</h3>
              <p className="text-sm text-muted-foreground">{member.role}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-20">
        <div className="grid md:grid-cols-4 gap-8 text-center">
          {[
            { label: 'Active Users', value: '50K+' },
            { label: 'Code Scans', value: '5M+' },
            { label: 'Issues Found', value: '10M+' },
            { label: 'Countries', value: '120+' },
          ].map((stat, idx) => (
            <div key={idx}>
              <p className="text-4xl font-bold text-primary mb-2">{stat.value}</p>
              <p className="text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
