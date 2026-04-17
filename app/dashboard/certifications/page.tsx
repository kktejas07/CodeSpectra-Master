'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Award, Lock, CheckCircle, ArrowRight, BookOpen } from 'lucide-react'

interface Certification {
  id: string
  title: string
  level: 'Basic' | 'Intermediate' | 'Advanced'
  description: string
  icon: string
  duration: number
  questions: number
  passingScore: number
  earned?: boolean
  progress?: number
}

const SKILLS_CERTIFICATIONS: Certification[] = [
  {
    id: 'angular-basic',
    title: 'Angular (Basic)',
    level: 'Basic',
    description: 'Foundational knowledge of Angular framework',
    icon: 'A',
    duration: 90,
    questions: 50,
    passingScore: 70,
    earned: false,
  },
  {
    id: 'angular-intermediate',
    title: 'Angular (Intermediate)',
    level: 'Intermediate',
    description: 'Advanced Angular concepts and patterns',
    icon: 'A',
    duration: 120,
    questions: 60,
    passingScore: 75,
    earned: false,
  },
  {
    id: 'csharp-basic',
    title: 'C# (Basic)',
    level: 'Basic',
    description: 'Introduction to C# programming language',
    icon: 'C',
    duration: 90,
    questions: 50,
    passingScore: 70,
    earned: false,
  },
  {
    id: 'css-basic',
    title: 'CSS (Basic)',
    level: 'Basic',
    description: 'CSS styling and layout fundamentals',
    icon: 'S',
    duration: 75,
    questions: 40,
    passingScore: 70,
    earned: true,
  },
  {
    id: 'go-intermediate',
    title: 'Go (Intermediate)',
    level: 'Intermediate',
    description: 'Go language patterns and concurrency',
    icon: 'G',
    duration: 120,
    questions: 60,
    passingScore: 75,
    earned: false,
  },
  {
    id: 'go-basic',
    title: 'Go (Basic)',
    level: 'Basic',
    description: 'Go programming fundamentals',
    icon: 'G',
    duration: 90,
    questions: 50,
    passingScore: 70,
    earned: true,
  },
  {
    id: 'java-basic',
    title: 'Java (Basic)',
    level: 'Basic',
    description: 'Java programming fundamentals',
    icon: 'J',
    duration: 90,
    questions: 50,
    passingScore: 70,
    earned: false,
  },
  {
    id: 'javascript-intermediate',
    title: 'JavaScript (Intermediate)',
    level: 'Intermediate',
    description: 'Advanced JavaScript concepts',
    icon: 'J',
    duration: 120,
    questions: 60,
    passingScore: 75,
    earned: false,
  },
  {
    id: 'javascript-basic',
    title: 'JavaScript (Basic)',
    level: 'Basic',
    description: 'JavaScript programming fundamentals',
    icon: 'J',
    duration: 90,
    questions: 50,
    passingScore: 70,
    earned: true,
  },
]

const ROLE_CERTIFICATIONS: Certification[] = [
  {
    id: 'frontend-react',
    title: 'Frontend Developer (React)',
    level: 'Intermediate',
    description: 'Master React and modern frontend development',
    icon: 'R',
    duration: 180,
    questions: 80,
    passingScore: 75,
    earned: true,
  },
  {
    id: 'software-engineer',
    title: 'Software Engineer',
    level: 'Advanced',
    description: 'Complete software engineering assessment',
    icon: 'E',
    duration: 240,
    questions: 100,
    passingScore: 80,
    earned: false,
    progress: 65,
  },
  {
    id: 'software-engineer-intern',
    title: 'Software Engineer Intern',
    level: 'Intermediate',
    description: 'Assessment for engineering intern positions',
    icon: 'I',
    duration: 150,
    questions: 60,
    passingScore: 70,
    earned: false,
  },
]

export default function CertificationsPage() {
  const earnedSkills = SKILLS_CERTIFICATIONS.filter((c) => c.earned).length
  const totalSkills = SKILLS_CERTIFICATIONS.length

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Get Certified</h1>
        <p className="text-muted-foreground">Get certified in technical skills and roles to showcase your expertise to peers and employers</p>
      </div>

      {/* Benefits Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 bg-blue-500/5 border-blue-500/20">
          <div className="flex items-start gap-3">
            <Award className="w-5 h-5 text-blue-400 flex-shrink-0 mt-1" />
            <div>
              <p className="font-semibold text-foreground">Stand out from the crowd</p>
              <p className="text-sm text-muted-foreground mt-1">
                Get certified in technical skills by taking the HackerRank Certification Test
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-purple-500/5 border-purple-500/20">
          <div className="flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-purple-400 flex-shrink-0 mt-1" />
            <div>
              <p className="font-semibold text-foreground">Standardised Assessment</p>
              <p className="text-sm text-muted-foreground mt-1">
                Assessments are organized around specific skills and carefully curated based on recruiting data
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-green-500/5 border-green-500/20">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-1" />
            <div>
              <p className="font-semibold text-foreground">Enrich your profile</p>
              <p className="text-sm text-muted-foreground mt-1">
                Upon successfully clearing an assessment, you can promote yourself using the certificate
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Role Certifications */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold mb-1">Get Your Roles Certified</h2>
          <p className="text-sm text-muted-foreground">Specialized assessments for different job roles</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ROLE_CERTIFICATIONS.map((cert) => (
            <Card
              key={cert.id}
              className={`p-6 border-border/40 hover:border-primary/40 transition-all ${
                cert.earned ? 'bg-green-500/5' : ''
              }`}
            >
              <div className="space-y-4">
                {/* Icon and Title */}
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary">
                    {cert.icon}
                  </div>
                  {cert.earned && <CheckCircle className="w-5 h-5 text-green-500" />}
                </div>

                <div>
                  <h3 className="font-semibold text-foreground">{cert.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{cert.description}</p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>Duration: {cert.duration} min</div>
                  <div>Questions: {cert.questions}</div>
                </div>

                {/* Progress or Button */}
                {cert.progress ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium">Progress</span>
                      <span className="text-xs font-bold text-primary">{cert.progress}%</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${cert.progress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <Button className="w-full gap-2" variant={cert.earned ? 'outline' : 'default'}>
                    {cert.earned ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        View Certificate
                      </>
                    ) : (
                      <>
                        Get Certified
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Skills Certifications */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold mb-1">Get Your Skills Certified</h2>
            <p className="text-sm text-muted-foreground">Master programming languages and technologies</p>
          </div>
          <Badge variant="outline" className="text-xs">
            {earnedSkills}/{totalSkills} Earned
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {SKILLS_CERTIFICATIONS.map((cert) => (
            <Card
              key={cert.id}
              className={`p-6 border-border/40 transition-all ${
                cert.earned ? 'bg-green-500/5 border-green-500/20 hover:border-green-500/40' : 'hover:border-primary/40'
              }`}
            >
              <div className="space-y-3">
                {/* Icon and Title */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">
                      {cert.icon}
                    </div>
                  </div>
                  {cert.earned ? (
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      {cert.level}
                    </Badge>
                  )}
                </div>

                <div>
                  <h3 className="font-semibold text-foreground text-sm">{cert.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{cert.description}</p>
                </div>

                {/* Details */}
                <div className="text-xs text-muted-foreground space-y-1 border-t border-border/40 pt-3">
                  <div>Duration: {cert.duration} minutes</div>
                  <div>Questions: {cert.questions}</div>
                  <div>Passing Score: {cert.passingScore}%</div>
                </div>

                {/* Button */}
                <Button className="w-full h-8 text-xs gap-2" variant={cert.earned ? 'outline' : 'default'}>
                  {cert.earned ? (
                    <>
                      <CheckCircle className="w-3 h-3" />
                      Verified
                    </>
                  ) : (
                    <>Get Certified</>
                  )}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* CTA */}
      <Card className="p-8 text-center bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <Award className="w-12 h-12 text-primary mx-auto mb-4" />
        <h3 className="text-xl font-bold mb-2">Ready to showcase your skills?</h3>
        <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
          Start a certification test today and earn a badge to display on your profile and resume
        </p>
        <Button size="lg" className="gap-2">
          Start a Certification
          <ArrowRight className="w-4 h-4" />
        </Button>
      </Card>
    </div>
  )
}
