'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface Toast {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message: string
}

export function ToastNotification({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  const colors = {
    success: 'bg-green-500/10 border-green-500/30 text-green-700',
    error: 'bg-red-500/10 border-red-500/30 text-red-700',
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-700',
    warning: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-700',
  }

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠',
  }

  return (
    <div className={`${colors[toast.type]} border rounded-lg p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2`}>
      <span className="text-lg font-bold">{icons[toast.type]}</span>
      <div className="flex-1">
        <p className="font-semibold text-sm">{toast.title}</p>
        <p className="text-xs opacity-90">{toast.message}</p>
      </div>
      <button onClick={onClose} className="text-lg opacity-50 hover:opacity-100">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
