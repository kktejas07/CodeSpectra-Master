'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { MessageSquare, Send, Sparkles, Loader2, FileCode, Bot, User } from 'lucide-react'

interface FileMetric {
  path: string
  language: string
  loc: number
  complexity: number
  bugs: number
  vulnerabilities: number
  codeSmells: number
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface CodebaseChatSidebarProps {
  files?: FileMetric[]
  scanId?: string
}

export function CodebaseChatSidebar({ files = [], scanId }: CodebaseChatSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hi! I am your CodeSpectra assistant. Select files below and ask me any questions about their quality, complexity, or security.',
    },
  ])
  const [input, setInput] = useState('')
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const togglePath = (path: string) => {
    const next = new Set(selectedPaths)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
    }
    setSelectedPaths(next)
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage: Message = { role: 'user', content: input }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai/codebase-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          selectedFiles: Array.from(selectedPaths),
          scanId,
        }),
      })
      const data = await res.json()
      if (res.ok && data.reply) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${data.error || 'Failed to analyze files.'}` },
        ])
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Connection error: ${String(e)}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="flex flex-col h-[550px] border border-border bg-card/60 backdrop-blur overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/20">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Codebase Assistant</h3>
        </div>
        <Badge variant="outline" className="text-xs gap-1 border-primary/20 text-primary">
          <Sparkles className="w-3 h-3" />
          AI Powered
        </Badge>
      </div>

      {/* File Selector */}
      <div className="border-b border-border p-3 max-h-[140px] overflow-y-auto bg-muted/10 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-1.5">
          <FileCode className="w-3.5 h-3.5" />
          Attach Context Files ({selectedPaths.size})
        </div>
        {files.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">No scanned files available</div>
        ) : (
          <div className="space-y-1.5">
            {files.map((file) => (
              <div key={file.path} className="flex items-center gap-2">
                <Checkbox
                  id={`chat-file-${file.path}`}
                  checked={selectedPaths.has(file.path)}
                  onCheckedChange={() => togglePath(file.path)}
                />
                <label
                  htmlFor={`chat-file-${file.path}`}
                  className="text-xs font-mono truncate text-foreground/80 cursor-pointer flex-1"
                >
                  {file.path.split('/').pop()}
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role !== 'user' && (
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
            )}
            <div
              className={`rounded-lg p-3 text-sm max-w-[80%] whitespace-pre-wrap ${
                msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted border border-border text-foreground'
              }`}
            >
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center border border-border shrink-0">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-3 justify-start items-center">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="rounded-lg p-3 text-sm bg-muted border border-border text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              Analyzing attached codebase files...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 bg-muted/20">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={selectedPaths.size > 0 ? "Ask about attached files..." : "Select files above to begin..."}
            disabled={loading}
            className="h-10"
          />
          <Button onClick={handleSend} disabled={loading} size="icon" className="h-10 w-10 shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  )
}
