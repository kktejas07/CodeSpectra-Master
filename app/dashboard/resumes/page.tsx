'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Download, Trash2, Brain } from 'lucide-react'

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
  const [resumes, setResumes] = useState<Resume[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadLoading, setUploadLoading] = useState(false)

  useEffect(() => {
    fetchResumes()
  }, [])

  const fetchResumes = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/resumes')
      const data = await res.json()
      setResumes(data)
    } catch (error) {
      console.error('Failed to fetch resumes:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setUploadLoading(true)
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/resumes/upload', {
        method: 'POST',
        body: formData
      })

      if (res.ok) {
        fetchResumes()
      }
    } catch (error) {
      console.error('Failed to upload resume:', error)
    } finally {
      setUploadLoading(false)
    }
  }

  const handleSetPrimary = async (resumeId: string) => {
    try {
      await fetch(`/api/resumes/${resumeId}/set-primary`, { method: 'POST' })
      fetchResumes()
    } catch (error) {
      console.error('Failed to set primary resume:', error)
    }
  }

  const handleAnalyze = async (resumeId: string) => {
    try {
      await fetch(`/api/resumes/${resumeId}/analyze`, { method: 'POST' })
      fetchResumes()
    } catch (error) {
      console.error('Failed to analyze resume:', error)
    }
  }

  const handleDelete = async (resumeId: string) => {
    if (!confirm('Are you sure?')) return
    try {
      await fetch(`/api/resumes/${resumeId}`, { method: 'DELETE' })
      fetchResumes()
    } catch (error) {
      console.error('Failed to delete resume:', error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">My Resumes</h1>
          <p className="text-muted-foreground">Upload and manage your resumes</p>
        </div>
      </div>

      <Card className="p-6 border-2 border-dashed">
        <label className="cursor-pointer block">
          <div className="text-center py-8">
            <Plus className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="font-semibold mb-1">Upload Resume</p>
            <p className="text-sm text-muted-foreground">Click to upload or drag and drop (PDF, DOC, DOCX)</p>
          </div>
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={handleFileUpload}
            disabled={uploadLoading}
            className="hidden"
          />
        </label>
      </Card>

      <div className="space-y-2">
        {loading ? (
          <Card className="p-6 text-center">Loading resumes...</Card>
        ) : resumes.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">No resumes uploaded yet</Card>
        ) : (
          resumes.map((resume) => (
            <Card key={resume.id} className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{resume.fileName}</h3>
                    {resume.isPrimary && <Badge>Primary</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {(resume.fileSize / 1024).toFixed(1)} KB • Uploaded {new Date(resume.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge variant={resume.analysisStatus === 'completed' ? 'default' : 'secondary'}>
                    {resume.analysisStatus}
                  </Badge>
                </div>
              </div>

              {resume.extractedData && (
                <div className="mb-3 pt-3 border-t text-sm">
                  <p className="font-medium mb-1">Extracted Skills:</p>
                  <div className="flex flex-wrap gap-1">
                    {resume.extractedData.skills.slice(0, 5).map((skill) => (
                      <Badge key={skill} variant="outline" className="text-xs">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t">
                {!resume.isPrimary && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetPrimary(resume.id)}
                  >
                    Set as Primary
                  </Button>
                )}
                {resume.analysisStatus !== 'completed' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAnalyze(resume.id)}
                    className="flex items-center gap-1"
                  >
                    <Brain className="w-3 h-3" />
                    Analyze
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => handleDelete(resume.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
