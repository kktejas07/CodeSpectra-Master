'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader } from 'lucide-react'

interface CodeEditorProps {
  value: string
  onChange?: (value: string) => void
  language?: string
  theme?: 'vs-dark' | 'vs-light'
  height?: number
  readOnly?: boolean
  onAnalysisComplete?: (result: any) => void
  liveAnalysis?: boolean
  diagnostics?: Diagnostic[]
}

export interface Diagnostic {
  line: number
  column: number
  message: string
  severity: 'error' | 'warning' | 'info'
  code?: string
}

declare global {
  interface Window {
    monaco: any
  }
}

export function CodeEditor({
  value,
  onChange,
  language = 'typescript',
  theme = 'vs-dark',
  height = 400,
  readOnly = false,
  onAnalysisComplete,
  liveAnalysis = true,
  diagnostics = [],
}: CodeEditorProps) {
  const editorContainer = useRef<HTMLDivElement>(null)
  const editorInstance = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [analysisRunning, setAnalysisRunning] = useState(false)
  const analysisTimeoutRef = useRef<NodeJS.Timeout>()

  // Load Monaco Editor
  useEffect(() => {
    const loadMonaco = async () => {
      if (window.monaco) {
        monacoRef.current = window.monaco
        initializeEditor()
        setLoading(false)
        return
      }

      try {
        const script = document.createElement('script')
        script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@latest/min/vs/loader.min.js'
        script.onload = () => {
          if (window.require) {
            window.require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@latest/min/vs' } })
            window.require(['vs/editor/editor.main'], () => {
              monacoRef.current = window.monaco
              initializeEditor()
              setLoading(false)
            })
          }
        }
        document.body.appendChild(script)
      } catch (error) {
        console.error('[v0] Error loading Monaco:', error)
        setLoading(false)
      }
    }

    loadMonaco()

    return () => {
      if (editorInstance.current) {
        editorInstance.current.dispose()
      }
    }
  }, [])

  const initializeEditor = () => {
    if (!editorContainer.current || !monacoRef.current) return

    editorInstance.current = monacoRef.current.editor.create(editorContainer.current, {
      value: value,
      language: language,
      theme: theme === 'vs-dark' ? 'vs-dark' : 'vs',
      readOnly: readOnly,
      minimap: { enabled: true },
      fontSize: 14,
      fontFamily: "'Fira Code', 'Courier New', monospace",
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      formatOnPaste: true,
      formatOnType: true,
      folding: true,
      foldingStrategy: 'auto',
    })

    editorInstance.current.onDidChangeModelContent(() => {
      const newValue = editorInstance.current.getValue()
      onChange?.(newValue)

      // Trigger live analysis with debounce
      if (liveAnalysis) {
        if (analysisTimeoutRef.current) {
          clearTimeout(analysisTimeoutRef.current)
        }

        setAnalysisRunning(true)
        analysisTimeoutRef.current = setTimeout(async () => {
          try {
            const response = await fetch('/api/analyze-code', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: newValue,
                language: language,
              }),
            })

            if (response.ok) {
              const result = await response.json()
              onAnalysisComplete?.(result)
            }
          } catch (error) {
            console.error('[v0] Analysis error:', error)
          } finally {
            setAnalysisRunning(false)
          }
        }, 1500) // Debounce for 1.5 seconds
      }
    })

    updateDiagnostics()
  }

  const updateDiagnostics = useCallback(() => {
    if (!editorInstance.current || !monacoRef.current || diagnostics.length === 0) return

    const markers = diagnostics.map((diag) => ({
      severity: getSeverityLevel(diag.severity),
      startLineNumber: diag.line,
      startColumn: diag.column,
      endLineNumber: diag.line,
      endColumn: diag.column + 1,
      message: diag.message,
      code: diag.code,
    }))

    monacoRef.current.editor.setModelMarkers(editorInstance.current.getModel(), 'analysis', markers)
  }, [diagnostics])

  const getSeverityLevel = (severity: string) => {
    switch (severity) {
      case 'error':
        return 8 // Error
      case 'warning':
        return 4 // Warning
      case 'info':
        return 2 // Info
      default:
        return 1 // Hint
    }
  }

  useEffect(() => {
    if (editorInstance.current) {
      updateDiagnostics()
    }
  }, [diagnostics, updateDiagnostics])

  return (
    <div className="space-y-2">
      {analysisRunning && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2 bg-secondary/50 rounded">
          <Loader className="w-3 h-3 animate-spin" />
          Analyzing code in real-time...
        </div>
      )}

      <div
        ref={editorContainer}
        style={{
          height: `${height}px`,
          border: '1px solid var(--border)',
          borderRadius: '0.5rem',
          overflow: 'hidden',
        }}
        className="bg-background"
      >
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}
      </div>
    </div>
  )
}
