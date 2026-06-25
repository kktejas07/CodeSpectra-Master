'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Play, Download, Volume2, Clock, CheckCircle, AlertCircle } from 'lucide-react'

export default function InterviewFeedbackPage() {
  const [audioTime, setAudioTime] = useState('00:00')
  const [playSpeed, setPlaySpeed] = useState('1x')

  const chatTranscript = [
    {
      id: 1,
      speaker: 'Interviewer',
      message: "Hey Priyanshu! Great to meet you. I've had a chance to look through your background before we got on — looks like you've been building some really interesting projects with React and modern frontend tech. I'm an AI Technical Recruiter and I'll be running your mock screening today for the **Frontend Engineer** role. Here's what we'll cover today: We'll start with a quick check on your experience and background, then dive into how you've worked with React and the broader frontend ecosystem.",
      time: '00:02'
    },
    {
      id: 2,
      speaker: 'User',
      message: "Hi, my name is Jirender and in developing the frontend engineering roles or so far. So I've gone through a couple of projects like SaaS, building the front-end pages, dashboards and collaborating with the team properly. So I'm trying to learn new things. Thank you.",
      time: '01:17'
    },
    {
      id: 3,
      speaker: 'Interviewer',
      message: "Got it, thanks for sharing that. Just to clarify — I see your resume shows Priyanshu Singh, but you mentioned your name is Jirender. Could you help me understand that?",
      time: '02:10'
    }
  ]

  const feedbackSections = [
    {
      id: 'logistics',
      title: 'Logistics',
      rating: 'Moderate Fit',
      content: 'Priyanshu claims four years of part-time professional experience at AI Access Inc., which falls within the required 2-6 year range. However, a significant discrepancy exists: his resume lists zero years of professional experience, while his verbal account describes four years of active work.'
    },
    {
      id: 'role-alignment',
      title: 'Role Alignment & Scope',
      rating: 'Moderate Fit',
      content: 'Priyanshu demonstrated relevant experience building dashboards and to-end using React and TypeScript at AI Access Inc., and he described working within a team of 10-15 people on an HRMS platform.'
    },
    {
      id: 'technical-competencies',
      title: 'Frontend Technical Competencies',
      rating: 'Weak Fit',
      content: 'Priyanshu showed some practical experience with React and integrating third-party APIs. However, critical gaps emerged when asked about state management and component architecture.'
    }
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Interview Feedback</h1>
            <p className="text-foreground/60">Technical Screen Mock Interview</p>
          </div>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Download Report
          </Button>
        </div>
      </div>

      {/* Overall Recommendation */}
      <Card className="p-6 bg-gradient-to-r from-orange-500/10 to-orange-600/5 border-orange-200/50">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Overall Recommendation</h2>
              <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Weak Fit</Badge>
            </div>
            <AlertCircle className="w-12 h-12 text-orange-500" />
          </div>
          <p className="text-foreground/70 leading-relaxed">
            While Priyanshu demonstrates some practical experience with React and frontend development, significant gaps emerged across the evaluation. His responses were often vague or incomplete, and he ended the interview prematurely before core technical competencies could be fully assessed.
          </p>
        </div>
      </Card>

      {/* Tabs for different content */}
      <Tabs defaultValue="audio" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="audio">Audio Transcript</TabsTrigger>
          <TabsTrigger value="chat">Chat Transcript</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
        </TabsList>

        {/* Audio Transcripts Tab */}
        <TabsContent value="audio" className="space-y-6">
          <Card className="p-6">
            <h3 className="text-xl font-bold text-foreground mb-6">Audio Transcripts</h3>
            
            {/* Audio Player */}
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-4">
                  <Button size="sm" className="rounded-full w-10 h-10 p-0">
                    <Play className="w-4 h-4" />
                  </Button>
                  <div className="flex-1">
                    <div className="bg-background rounded h-1"></div>
                  </div>
                  <span className="text-sm text-foreground/60">{audioTime} / 23:45</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-foreground/60" />
                    <span className="text-sm text-foreground/60">Speed:</span>
                  </div>
                  <select 
                    value={playSpeed}
                    onChange={(e) => setPlaySpeed(e.target.value)}
                    className="text-sm bg-background border border-border rounded px-2 py-1"
                  >
                    <option value="0.5x">0.5x</option>
                    <option value="0.75x">0.75x</option>
                    <option value="1x">1x</option>
                    <option value="1.25x">1.25x</option>
                    <option value="1.5x">1.5x</option>
                    <option value="2x">2x</option>
                  </select>
                </div>
              </div>

              {/* Transcript List */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {chatTranscript.map((item) => (
                  <div key={item.id} className="p-3 bg-muted rounded-lg border border-border/50">
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-semibold text-foreground text-sm">
                        {item.speaker}
                      </span>
                      <span className="text-xs text-foreground/50">{item.time}</span>
                    </div>
                    <p className="text-sm text-foreground/70 leading-relaxed">{item.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Chat Transcripts Tab */}
        <TabsContent value="chat" className="space-y-6">
          <Card className="p-6">
            <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
              <span className="inline-block w-3 h-3 bg-primary rounded-full"></span>
              Chat Transcripts
            </h3>

            <div className="space-y-4">
              {chatTranscript.map((item) => (
                <div key={item.id} className="space-y-2">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-foreground/60">
                        {item.speaker === 'User' ? 'U' : 'I'}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-foreground text-sm">
                          {item.speaker === 'Interviewer' ? 'AI Interviewer' : 'You'}
                        </span>
                        <span className="text-xs text-foreground/50">{item.time}</span>
                      </div>
                      <div className={`p-3 rounded-lg ${
                        item.speaker === 'Interviewer'
                          ? 'bg-primary/10 border border-primary/30'
                          : 'bg-muted border border-border'
                      }`}>
                        <p className="text-sm text-foreground leading-relaxed">{item.message}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* Analysis Tab */}
        <TabsContent value="analysis" className="space-y-6">
          {feedbackSections.map((section) => (
            <Card key={section.id} className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-foreground">{section.title}</h3>
                  <Badge variant={section.rating === 'Weak Fit' ? 'destructive' : 'outline'}>
                    {section.rating}
                  </Badge>
                </div>
                <p className="text-foreground/70 leading-relaxed">{section.content}</p>
                <button className="text-primary text-sm font-medium hover:underline flex items-center gap-1">
                  View Transcript References →
                </button>
              </div>
            </Card>
          ))}

          {/* Recommendations */}
          <Card className="p-6 border-green-200/50 bg-green-50/30">
            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Recommendations for Improvement
            </h3>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span className="text-green-600 font-bold">1.</span>
                <span className="text-foreground/70">Clarify resume discrepancies and ensure consistency between written and verbal accounts</span>
              </li>
              <li className="flex gap-3">
                <span className="text-green-600 font-bold">2.</span>
                <span className="text-foreground/70">Prepare concrete examples of state management approaches and React best practices</span>
              </li>
              <li className="flex gap-3">
                <span className="text-green-600 font-bold">3.</span>
                <span className="text-foreground/70">Practice explaining technical decisions and trade-offs more clearly</span>
              </li>
            </ul>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
