import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Plus, Trash2, Key, Upload } from 'lucide-react'
import { useToast } from '@/lib/toast-context'
import type { LLMConfig, LLMProviderId, APIKeyStatus } from '@/lib/llm-config'

function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

interface LlmKeysManagerProps {
  provider: LLMProviderId
  keys: LLMConfig['keys']
  onChange: (keys: LLMConfig['keys']) => void
}

export function LlmKeysManager({ provider, keys, onChange }: LlmKeysManagerProps) {
  const toast = useToast()
  const [newKey, setNewKey] = useState('')
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkText, setBulkText] = useState('')

  const providerKeys = keys?.[provider] || []

  function addKey() {
    if (!newKey.trim()) return
    const keyString = newKey.trim()
    if (providerKeys.some(k => k.key === keyString)) {
      toast({ type: 'error', title: 'Key already exists' })
      return
    }
    const newEntry: APIKeyStatus = {
      id: generateId(),
      key: keyString,
      added_at: new Date().toISOString(),
      usage_count: 0,
      rate_limited_until: null,
    }
    onChange({ ...keys, [provider]: [...providerKeys, newEntry] })
    setNewKey('')
  }

  function handleBulkImport() {
    if (!bulkText.trim()) return
    // Simple split by newline or comma
    const rawKeys = bulkText.split(/[\n,]+/).map(k => k.trim()).filter(Boolean)
    const toAdd: APIKeyStatus[] = []
    
    for (const keyString of rawKeys) {
      if (providerKeys.some(k => k.key === keyString) || toAdd.some(k => k.key === keyString)) continue
      toAdd.push({
        id: generateId(),
        key: keyString,
        added_at: new Date().toISOString(),
        usage_count: 0,
        rate_limited_until: null,
      })
    }
    
    if (toAdd.length === 0) {
      toast({ type: 'error', title: 'No new keys found' })
      return
    }
    
    onChange({ ...keys, [provider]: [...providerKeys, ...toAdd] })
    setBulkMode(false)
    setBulkText('')
    toast({ type: 'success', title: `Imported ${toAdd.length} keys` })
  }

  function removeKey(id: string) {
    onChange({ ...keys, [provider]: providerKeys.filter(k => k.id !== id) })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>API Keys ({providerKeys.length})</Label>
        <Button variant="outline" size="sm" onClick={() => setBulkMode(!bulkMode)}>
          <Upload className="w-4 h-4 mr-2" /> Bulk Import
        </Button>
      </div>

      {bulkMode && (
        <Card className="p-4 space-y-3 bg-muted/50">
          <Label>Paste keys (one per line or comma-separated)</Label>
          <textarea
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            className="w-full h-32 p-3 text-sm rounded-md border border-input bg-background"
            placeholder="sk-..."
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setBulkMode(false)}>Cancel</Button>
            <Button size="sm" onClick={handleBulkImport}>Import Keys</Button>
          </div>
        </Card>
      )}

      {!bulkMode && (
        <div className="flex gap-2">
          <Input 
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            placeholder={`Add new ${provider} key...`}
            className="font-mono"
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKey())}
          />
          <Button onClick={addKey} variant="secondary">
            <Plus className="w-4 h-4 mr-2" /> Add Key
          </Button>
        </div>
      )}

      {providerKeys.length > 0 ? (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Key</th>
                <th className="px-4 py-2 font-medium">Usage</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {providerKeys.map(k => (
                <tr key={k.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-mono text-xs">
                    {k.key.startsWith('••••') ? k.key : (k.key.slice(0, 8) + '...' + k.key.slice(-4))}
                  </td>
                  <td className="px-4 py-3">{k.usage_count || 0}</td>
                  <td className="px-4 py-3">
                    {k.rate_limited_until && new Date(k.rate_limited_until) > new Date() ? (
                      <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full dark:bg-red-900/30 dark:text-red-400">
                        Rate Limited
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full dark:bg-green-900/30 dark:text-green-400">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => removeKey(k.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg">
          <Key className="w-8 h-8 mx-auto mb-2 opacity-20" />
          <p className="text-sm">No keys configured for {provider}.</p>
        </div>
      )}
    </div>
  )
}
