'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Download, Trash2, Brain, FileText, Upload } from 'lucide-react'

interface Resume {
  id: string
  fileName: string
  fileSize: number
  uploadedAt: string
  isPrimary: boolean
  extractedData?: {
    skills: string[]
    experience: string
    education: string
  }
  analysisStatus: 'pending' | 'completed' | 'failed'
}

export default function ResumesPage() {
  const [resumes, setResumes] = useState<Resume[]>([
    {
      id: '1',
      fileName: 'John_Doe_Resume.pdf',
      fileSize: 245,
      uploadedAt: '2024-04-15',
      isPrimary: true,
      analysisStatus: 'completed',
      extractedData: {
        skills: ['JavaScript', 'React', 'Node.js', 'TypeScript', 'Python'],
        experience: '5 years in full-stack development',
        education: 'BS in Computer Science',
      },
    },
    {
      id: '2',
      fileName: 'John_Doe_Resume_v2.pdf',
      fileSize: 256,
      uploadedAt: '2024-04-10',
      isPrimary: false,
      analysisStatus: 'completed',
    },
  ])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const newResume: Resume = {
      id: String(resumes.length + 1),
      fileName: file.name,
      fileSize: file.size,
      uploadedAt: new Date().toISOString().split('T')[0],
      isPrimary: false,
      analysisStatus: 'pending',
    }

    setResumes([newResume, ...resumes])
  }

  const handleDelete = (id: string) => {
    setResumes(resumes.filter(r => r.id !== id))
  }

  const handleSetPrimary = (id: string) => {
    setResumes(resumes.map(r => ({ ...r, isPrimary: r.id === id })))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-8 h-8 text-primary" />
            My Resumes
          </h1>
          <p className="text-muted-foreground mt-2">Upload and manage your resumes with AI analysis</p>
        </div>
        <label className="cursor-pointer">
          <Button className="gap-2" asChild>
            <span>
              <Plus className="w-4 h-4" />
              Upload Resume
            </span>
          </Button>
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>

      {/* Upload Area */}
      <Card className="p-8 border-2 border-dashed border-border">
        <label className="cursor-pointer flex items-center justify-center">
          <div className="text-center">
            <Upload className="w-12 h-12 text-primary/40 mx-auto mb-2" />
            <p className="font-medium text-foreground">Drag and drop your resume here</p>
            <p className="text-sm text-muted-foreground">or click to browse (PDF, DOC, DOCX)</p>
          </div>
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </Card>

      {/* Resumes List */}
      <div className="space-y-4">
        {resumes.map((resume) => (
          <Card key={resume.id} className="p-6 hover:bg-muted/30 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold text-foreground">{resume.fileName}</h3>
                  {resume.isPrimary && <Badge className="bg-primary/20 text-primary">Primary</Badge>}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{(resume.fileSize / 1024).toFixed(2)} KB</span>
                  <span>Uploaded {resume.uploadedAt}</span>
                  <Badge className={
                    resume.analysisStatus === 'completed'
                      ? 'bg-green-500/20 text-green-700'
                      : resume.analysisStatus === 'pending'
                      ? 'bg-yellow-500/20 text-yellow-700'
                      : 'bg-red-500/20 text-red-700'
                  }>
                    {resume.analysisStatus}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2">
                {resume.analysisStatus === 'completed' && (
                  <Button variant="outline" size="sm" className="gap-2">
                    <Brain className="w-4 h-4" />
                    View Analysis
                  </Button>
                )}
                {!resume.isPrimary && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetPrimary(resume.id)}
                  >
                    Set Primary
                  </Button>
                )}
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(resume.id)}
                  className="text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {resume.extractedData && (
              <div className="grid md:grid-cols-3 gap-4 pt-4 border-t border-border">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Skills</p>
                  <div className="flex flex-wrap gap-2">
                    {resume.extractedData.skills.map((skill) => (
                      <Badge key={skill} variant="outline" className="text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Experience</p>
                  <p className="text-sm text-foreground">{resume.extractedData.experience}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Education</p>
                  <p className="text-sm text-foreground">{resume.extractedData.education}</p>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {resumes.length === 0 && (
        <Card className="p-12 text-center">
          <FileText className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-foreground font-medium mb-2">No resumes uploaded yet</p>
          <p className="text-muted-foreground text-sm">Upload your first resume to get started with AI analysis</p>
        </Card>
      )}
    </div>
  )
}
