'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Plus, Trash2, Brain, Download } from 'lucide-react'
import { usePageGuard } from '@/lib/use-page-guard'

interface Resume {
  id: string
  fileName: string
  uploadedDate: string
  analyzed: boolean
  score: number
  matchPercentage?: number
  skills: string[]
}

export default function AdminResumesPage() {
  const gate = usePageGuard('superadmin')
  if (!gate.ready) return <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">Loading…</div>

  const [resumes] = useState<Resume[]>([
    {
      id: '1',
      fileName: 'John_Doe_Resume.pdf',
      uploadedDate: '2024-04-15',
      analyzed: true,
      score: 85,
      matchPercentage: 92,
      skills: ['JavaScript', 'React', 'Node.js'],
    },
    {
      id: '2',
      fileName: 'Jane_Smith_Resume.pdf',
      uploadedDate: '2024-04-14',
      analyzed: true,
      score: 78,
      matchPercentage: 85,
      skills: ['Python', 'ML', 'Data Science'],
    },
  ])

  const [jdText, setJdText] = useState('Looking for a Full-Stack Developer with React and Node.js experience')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <FileText className="w-8 h-8 text-primary" />
          Resume AI Analysis
        </h1>
        <p className="text-muted-foreground mt-2">Analyze resumes with AI and match against job descriptions</p>
      </div>

      {/* JD Matcher */}
      <Card className="p-6">
        <h2 className="text-xl font-bold text-foreground mb-4">Job Description Matcher</h2>
        <textarea
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          placeholder="Paste job description here..."
          className="w-full px-3 py-2 rounded border border-border bg-background text-foreground h-24 resize-none"
        />
        <Button className="mt-3">Analyze Matches</Button>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Resumes</p>
          <p className="text-3xl font-bold text-foreground">{resumes.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Analyzed</p>
          <p className="text-3xl font-bold text-green-600">{resumes.filter(r => r.analyzed).length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Avg Score</p>
          <p className="text-3xl font-bold text-primary">
            {(resumes.reduce((sum, r) => sum + r.score, 0) / resumes.length).toFixed(1)}
          </p>
        </Card>
      </div>

      {/* Resumes List */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">File Name</th>
                <th className="px-6 py-3 text-left font-semibold">Uploaded</th>
                <th className="px-6 py-3 text-left font-semibold">Analysis Score</th>
                <th className="px-6 py-3 text-left font-semibold">JD Match</th>
                <th className="px-6 py-3 text-left font-semibold">Top Skills</th>
                <th className="px-6 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {resumes.map((resume) => (
                <tr key={resume.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-6 py-3 font-medium">{resume.fileName}</td>
                  <td className="px-6 py-3">{resume.uploadedDate}</td>
                  <td className="px-6 py-3">
                    <Badge className="bg-blue-500/20 text-blue-700">{resume.score}%</Badge>
                  </td>
                  <td className="px-6 py-3">
                    {resume.matchPercentage && (
                      <Badge className="bg-green-500/20 text-green-700">{resume.matchPercentage}%</Badge>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex gap-1">
                      {resume.skills.slice(0, 2).map((skill) => (
                        <Badge key={skill} variant="outline" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm">
                        <Brain className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
