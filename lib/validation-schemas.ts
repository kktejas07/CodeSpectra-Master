// Validation Schemas
export interface JobValidation {
  title: string
  company: string
  location: string
  salary_min?: number
  salary_max?: number
  description: string
}

export interface ExamValidation {
  title: string
  subject: string
  level: string
  duration: number
  questions: number
  passingScore: number
}

export interface CodeathonValidation {
  title: string
  description: string
  startDate: string
  endDate: string
  prizePool: string
}

export interface ResumeValidation {
  fileName: string
  fileSize: number
  fileType: string
}

export interface BillingValidation {
  planId: string
  paymentMethodId: string
}

// Validation Functions
export function validateJob(data: unknown): { valid: boolean; errors?: string[] } {
  const errors: string[] = []
  const job = data as any

  if (!job.title || job.title.length < 3) errors.push('Title must be at least 3 characters')
  if (!job.company || job.company.length < 2) errors.push('Company name is required')
  if (!job.location || job.location.length < 2) errors.push('Location is required')
  if (!job.description || job.description.length < 10) errors.push('Description must be at least 10 characters')

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
}

export function validateExam(data: unknown): { valid: boolean; errors?: string[] } {
  const errors: string[] = []
  const exam = data as any

  if (!exam.title || exam.title.length < 3) errors.push('Title must be at least 3 characters')
  if (!exam.subject) errors.push('Subject is required')
  if (!exam.level) errors.push('Level is required')
  if (!exam.duration || exam.duration < 5) errors.push('Duration must be at least 5 minutes')
  if (!exam.questions || exam.questions < 1) errors.push('Questions must be at least 1')

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
}

export function validateResume(data: unknown): { valid: boolean; errors?: string[] } {
  const errors: string[] = []
  const resume = data as any

  const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  if (!validTypes.includes(resume.fileType)) errors.push('Only PDF and Word documents are supported')
  if (!resume.fileName) errors.push('File name is required')
  if (resume.fileSize > 5242880) errors.push('File size must be less than 5MB')

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
}
