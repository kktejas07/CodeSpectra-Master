'use client'

import { useState } from 'react'
import {
  Zap,
  Check,
  X,
  Copy,
  ExternalLink,
  Lightbulb,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export interface QuickFix {
  id: string
  title: string
  description: string
  code: string
  explanation: string
  confidence: number
}

interface QuickFixMenuProps {
  fixes: QuickFix[]
  onApplyFix?: (fixId: string) => Promise<void>
  onDismissFix?: (fixId: string) => void
  isOpen?: boolean
}

export function QuickFixMenu({
  fixes,
  onApplyFix,
  onDismissFix,
  isOpen = true,
}: QuickFixMenuProps) {
  const [expandedId, setExpandedId] = useState<string | null>(fixes[0]?.id || null)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())

  if (!isOpen || fixes.length === 0) {
    return null
  }

  const handleApply = async (fixId: string) => {
    setApplyingId(fixId)
    try {
      await onApplyFix?.(fixId)
      setAppliedIds(prev => new Set([...prev, fixId]))
    } catch (error) {
      console.error('[v0] Error applying fix:', error)
    } finally {
      setApplyingId(null)
    }
  }

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code)
  }

  const activeFixes = fixes.filter(f => !appliedIds.has(f.id))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
        <Lightbulb className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          {activeFixes.length} Quick Fix{activeFixes.length !== 1 ? 'es' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {activeFixes.map((fix, index) => (
          <QuickFixCard
            key={fix.id}
            fix={fix}
            index={index + 1}
            isExpanded={expandedId === fix.id}
            onToggle={() => setExpandedId(expandedId === fix.id ? null : fix.id)}
            onApply={() => handleApply(fix.id)}
            onDismiss={() => onDismissFix?.(fix.id)}
            onCopy={() => handleCopy(fix.code)}
            isApplying={applyingId === fix.id}
          />
        ))}
      </div>

      {appliedIds.size > 0 && (
        <div className="text-xs text-green-600 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded">
          <p>{appliedIds.size} fix{appliedIds.size !== 1 ? 'es' : ''} applied</p>
        </div>
      )}
    </div>
  )
}

interface QuickFixCardProps {
  fix: QuickFix
  index: number
  isExpanded: boolean
  onToggle: () => void
  onApply: () => Promise<void>
  onDismiss: () => void
  onCopy: () => void
  isApplying: boolean
}

function QuickFixCard({
  fix,
  index,
  isExpanded,
  onToggle,
  onApply,
  onDismiss,
  onCopy,
  isApplying,
}: QuickFixCardProps) {
  const confidenceColor =
    fix.confidence >= 0.8
      ? 'text-green-600'
      : fix.confidence >= 0.6
        ? 'text-yellow-600'
        : 'text-orange-600'

  return (
    <Card className="p-3 bg-card border-border hover:border-primary/30 transition-colors cursor-pointer">
      <button
        onClick={onToggle}
        className="w-full text-left flex items-start justify-between gap-2"
      >
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-1 bg-primary/20 text-primary rounded">
              Fix {index}
            </span>
            <span className={`text-xs font-semibold ${confidenceColor}`}>
              {Math.round(fix.confidence * 100)}% confidence
            </span>
          </div>
          <p className="text-sm font-medium text-foreground">{fix.title}</p>
          <p className="text-xs text-muted-foreground">{fix.description}</p>
        </div>
      </button>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
          {/* Explanation */}
          <div className="bg-background/50 p-2 rounded text-xs text-muted-foreground">
            {fix.explanation}
          </div>

          {/* Code */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">Suggested Code:</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={onCopy}
                className="h-6 px-2 gap-1 text-xs"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <pre className="text-xs bg-black/20 p-2 rounded overflow-x-auto text-foreground">
              <code>{fix.code}</code>
            </pre>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={onApply}
              disabled={isApplying}
              className="flex-1 gap-2 h-8"
            >
              {isApplying ? (
                <>
                  <Zap className="w-3 h-3 animate-pulse" />
                  Applying...
                </>
              ) : (
                <>
                  <Check className="w-3 h-3" />
                  Apply
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onDismiss}
              className="h-8 px-2"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
