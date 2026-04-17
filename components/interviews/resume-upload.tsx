'use client'

import { useState, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Upload, FileText, Eye, X, AlertCircle } from 'lucide-react'

interface ResumeUploadProps {
  onResumeUpload?: (file: File) => void
  onContinue?: () => void
  isOptional?: boolean
}

export function ResumeUpload({ onResumeUpload, onContinue, isOptional = true }: ResumeUploadProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const handleFileSelect = (file: File) => {
    setError('')
    
    // Validate file type
    if (!file.type.includes('pdf')) {
      setError('Only PDF files are supported')
      return
    }

    // Validate file size (max 5 MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5 MB')
      return
    }

    setIsUploading(true)
    // Simulate upload
    setTimeout(() => {
      setUploadedFile(file)
      setIsUploading(false)
      onResumeUpload?.(file)
    }, 1500)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      handleFileSelect(e.target.files[0])
    }
  }

  const handleRemoveFile = () => {
    setUploadedFile(null)
    setError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <Card className="w-full max-w-xl mx-auto p-8">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Upload Resume</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Add your resume so mock interviewer can reference it during conversation. {isOptional && '(Optional)'}
          </p>
        </div>

        {!uploadedFile ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            className="border-2 border-dashed border-muted-foreground/50 rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 bg-muted rounded-lg">
                <Upload className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Drag and drop your resume here</p>
                <p className="text-sm text-muted-foreground">Supported formats: PDF</p>
                <p className="text-xs text-muted-foreground">Max size: 5 MB</p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleInputChange}
              className="hidden"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-primary" />
                <div>
                  <p className="font-medium text-foreground">{uploadedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(uploadedFile.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              </div>
              <button
                onClick={handleRemoveFile}
                className="p-2 hover:bg-background rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground hover:text-foreground" />
              </button>
            </div>

            {isUploading && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="bg-primary h-2 rounded-full w-2/3 animate-pulse" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Uploading {uploadedFile.name}...</p>
              </div>
            )}

            {!isUploading && (
              <p className="text-sm text-green-600 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Your resume has been added
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-4">
          {isOptional && (
            <Button variant="outline" className="flex-1" onClick={onContinue}>
              Skip
            </Button>
          )}
          <Button
            className="flex-1"
            onClick={onContinue}
            disabled={isUploading}
          >
            {uploadedFile && !isUploading ? 'Continue' : isOptional ? 'Continue Anyway' : 'Continue'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

function CheckCircle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}
