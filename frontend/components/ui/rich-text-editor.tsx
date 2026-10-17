'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  Heading1, Heading2, Link2, Image as ImageIcon, Quote, Code,
  Undo2, Redo2, Minus, RemoveFormatting
} from 'lucide-react'
import { compressImageDataUrl } from '@/lib/image-compress'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: number
}

export function RichTextEditor({ value, onChange, placeholder = 'Write your content...', minHeight = 250 }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isInternalEdit = useRef(false)
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  // Set initial content on mount
  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML && value) {
      editorRef.current.innerHTML = value
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Synchronize when value changes externally (e.g. AI draft generation)
  useEffect(() => {
    if (!isInternalEdit.current && editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value
    }
  }, [value])

  const syncContent = useCallback(() => {
    if (editorRef.current) {
      isInternalEdit.current = true
      onChange(editorRef.current.innerHTML)
      // Reset flag after React processes the state update
      setTimeout(() => { isInternalEdit.current = false }, 0)
    }
  }, [onChange])

  const execCommand = useCallback((command: string, val?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, val)
    syncContent()
  }, [syncContent])

  const insertLink = useCallback(() => {
    if (linkUrl) {
      execCommand('createLink', linkUrl)
      setLinkUrl('')
      setShowLinkInput(false)
    }
  }, [linkUrl, execCommand])

  const insertImage = useCallback(() => {
    const url = prompt('Enter image URL:')
    if (url) execCommand('insertImage', url)
  }, [execCommand])

  // Compress pasted images via the native canvas so base64 screenshots pasted
  // into contentEditable can't inflate an email past Gmail's ~102KB clip limit.
  // ponytail: downscales to maxW (email renders at 600px, so 2x = retina-crisp)
  // and re-encodes as JPEG (lossy, but alpha-free images lose nothing visible).
  // Transparent images stay PNG. No server dependency; runs entirely in-browser.
  const compressPastedImage = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      compressImageDataUrl(url)
        .then(resolve)
        .catch(reject)
        .finally(() => URL.revokeObjectURL(url))
    })
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items || [])
    const images = items.filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean) as File[]
    if (images.length === 0) return
    e.preventDefault()
    void (async () => {
      for (const file of images) {
        try {
          const dataUrl = await compressPastedImage(file)
          execCommand('insertImage', dataUrl)
        } catch { /* fall back to default paste of the original file */ }
      }
    })()
  }, [compressPastedImage, execCommand])

  const toolbarButtons = [
    { icon: Bold, command: 'bold', tooltip: 'Bold (Ctrl+B)' },
    { icon: Italic, command: 'italic', tooltip: 'Italic (Ctrl+I)' },
    { icon: Underline, command: 'underline', tooltip: 'Underline (Ctrl+U)' },
    { icon: Strikethrough, command: 'strikeThrough', tooltip: 'Strikethrough' },
    { divider: true },
    { icon: Heading1, command: 'formatBlock', value: '<h1>', tooltip: 'Heading 1' },
    { icon: Heading2, command: 'formatBlock', value: '<h2>', tooltip: 'Heading 2' },
    { divider: true },
    { icon: List, command: 'insertUnorderedList', tooltip: 'Bullet list' },
    { icon: ListOrdered, command: 'insertOrderedList', tooltip: 'Numbered list' },
    { icon: Quote, command: 'formatBlock', value: '<blockquote>', tooltip: 'Quote' },
    { icon: Code, command: 'formatBlock', value: '<pre>', tooltip: 'Code block' },
    { divider: true },
    { icon: Minus, command: 'insertHorizontalRule', tooltip: 'Divider' },
    { icon: RemoveFormatting, command: 'removeFormat', tooltip: 'Clear formatting' },
  ]

  return (
    <div className="rounded-lg border border-border/60 bg-background overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-border/40 bg-muted/30">
        {toolbarButtons.map((btn, i) => {
          if ('divider' in btn && btn.divider) {
            return <div key={i} className="w-px h-5 bg-border/60 mx-1" />
          }
          const Icon = btn.icon!
          return (
            <Button
              key={i}
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              title={btn.tooltip}
              aria-label={btn.tooltip}
              onMouseDown={e => {
                e.preventDefault() // Prevent editor losing focus
                execCommand(btn.command!, btn.value)
              }}
            >
              <Icon className="h-3.5 w-3.5" />
            </Button>
          )
        })}
        <div className="w-px h-5 bg-border/60 mx-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="Insert link"
          aria-label="Insert link"
          onMouseDown={e => e.preventDefault()}
          onClick={() => setShowLinkInput(!showLinkInput)}
        >
          <Link2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="Insert image"
          aria-label="Insert image"
          onMouseDown={e => e.preventDefault()}
          onClick={insertImage}
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </Button>
        <div className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="Undo"
          aria-label="Undo"
          onMouseDown={e => { e.preventDefault(); execCommand('undo') }}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="Redo"
          aria-label="Redo"
          onMouseDown={e => { e.preventDefault(); execCommand('redo') }}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Link Input */}
      {showLinkInput && (
        <div className="flex items-center gap-2 p-2 border-b border-border/40 bg-muted/20">
          <input
            type="url"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            placeholder="https://example.com"
            aria-label="Link URL"
            className="flex-1 text-sm px-2 py-1 rounded border border-border/60 bg-background"
            onKeyDown={e => e.key === 'Enter' && insertLink()}
          />
          <Button type="button" size="sm" onClick={insertLink}>Insert</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setShowLinkInput(false); setLinkUrl('') }}>Cancel</Button>
        </div>
      )}

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        className="rich-text-editor"
        style={{ minHeight: `${minHeight}px` }}
        onInput={syncContent}
        onBlur={syncContent}
        onPaste={handlePaste}
        data-placeholder={placeholder}
      />

      <style jsx>{`
        .rich-text-editor {
          padding: 12px 16px;
          font-size: 14px;
          line-height: 1.65;
          outline: none;
          overflow-y: auto;
          color: hsl(var(--foreground));
        }
        .rich-text-editor:empty:before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          pointer-events: none;
        }
        .rich-text-editor h1 { font-size: 1.5em; font-weight: 700; margin: 0.5em 0; color: hsl(var(--foreground)); }
        .rich-text-editor h2 { font-size: 1.25em; font-weight: 600; margin: 0.5em 0; color: hsl(var(--foreground)); }
        .rich-text-editor p { margin: 0.5em 0; color: hsl(var(--foreground)); }
        .rich-text-editor ul, .rich-text-editor ol { padding-left: 1.5em; margin: 0.5em 0; }
        .rich-text-editor li { margin: 0.25em 0; color: hsl(var(--foreground)); }
        .rich-text-editor blockquote {
          border-left: 3px solid hsl(var(--primary));
          padding-left: 12px;
          margin: 0.5em 0;
          color: hsl(var(--muted-foreground));
        }
        .rich-text-editor pre {
          background: hsl(var(--muted));
          padding: 8px 12px;
          border-radius: 6px;
          font-family: monospace;
          font-size: 13px;
          overflow-x: auto;
          color: hsl(var(--foreground));
        }
        .rich-text-editor a { color: hsl(var(--primary)); text-decoration: underline; }
        .rich-text-editor img { max-width: 100%; border-radius: 8px; margin: 8px 0; }
        .rich-text-editor hr { border: none; border-top: 1px solid hsl(var(--border)); margin: 12px 0; }
      `}</style>
    </div>
  )
}
