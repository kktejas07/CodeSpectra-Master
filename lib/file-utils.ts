// File Upload Utilities
export interface FileUploadOptions {
  maxSize: number
  allowedTypes: string[]
}

export const fileUploadConfig = {
  resume: {
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  } as FileUploadOptions,
  image: {
    maxSize: 2 * 1024 * 1024, // 2MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
  } as FileUploadOptions,
  document: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['application/pdf', 'text/plain', 'text/csv'],
  } as FileUploadOptions,
}

export function validateFileUpload(file: File, config: FileUploadOptions): { valid: boolean; error?: string } {
  if (file.size > config.maxSize) {
    return { valid: false, error: `File size exceeds ${config.maxSize / (1024 * 1024)}MB limit` }
  }

  if (!config.allowedTypes.includes(file.type)) {
    return { valid: false, error: 'File type not allowed' }
  }

  return { valid: true }
}

export function generateFileKey(userId: string, filename: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(7)
  return `${userId}/${timestamp}-${random}-${filename}`
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop() || ''
}
