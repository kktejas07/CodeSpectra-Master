'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9)
    const newToast = { ...toast, id }
    setToasts((prev) => [...prev, newToast])

    if (toast.duration !== 0) {
      setTimeout(() => removeToast(id), toast.duration || 3000)
    }
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-md">
        {toasts.map((toast) => (
          <ToastComponent key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastComponent({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const colors = {
    success: 'bg-green-50 border-green-500 text-green-800 dark:bg-green-500/20 dark:border-green-500/50 dark:text-green-400',
    error: 'bg-red-50 border-red-500 text-red-800 dark:bg-red-500/20 dark:border-red-500/50 dark:text-red-400',
    info: 'bg-blue-50 border-blue-500 text-blue-800 dark:bg-blue-500/20 dark:border-blue-500/50 dark:text-blue-400',
    warning: 'bg-yellow-50 border-yellow-500 text-yellow-800 dark:bg-yellow-500/20 dark:border-yellow-500/50 dark:text-yellow-400',
  }

  const icons = {
    success: <CheckCircle className="w-5 h-5" />,
    error: <AlertCircle className="w-5 h-5" />,
    info: <Info className="w-5 h-5" />,
    warning: <AlertCircle className="w-5 h-5" />,
  }

  return (
    <div className={`${colors[toast.type]} border px-4 py-3 rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300`}>
      <div className="flex-shrink-0 mt-0.5">{icons[toast.type]}</div>
      <div className="flex-1">
        <p className="font-medium">{toast.title}</p>
        {toast.message && <p className="text-sm opacity-90">{toast.message}</p>}
      </div>
      <button onClick={onClose} className="flex-shrink-0 ml-2 opacity-60 hover:opacity-100">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context.addToast
}
