/**
 * Text of a company upload (job description, CSV of candidates) from the
 * knowledge layer's upload store, tenant-checked like every other read.
 * Uploaded text is untrusted: it is scanned (lib/ai/prompt-guard) and only
 * ever used as data.
 */
import { ragUploads } from '@/lib/rag/store'
import { scanPrompt } from '@/lib/ai/prompt-guard'
import { ToolInputError, ToolPermissionError, type AgentCaller } from '@/lib/agent/contract'

export interface UploadText {
  text: string
  title: string
  flagged: boolean
  reasons: string[]
}

const MAX_TEXT = 200_000

export async function uploadText(caller: AgentCaller, uploadId: string): Promise<UploadText> {
  const col = await ragUploads()
  const u = await col.findOne({ id: uploadId }, { projection: { _id: 0, id: 1, tenant_id: 1, title: 1, file_name: 1, text: 1 } })
  if (!u) throw new ToolInputError("I couldn't find that upload. Check the id (search_knowledge with types [\"upload\"] lists them), or paste the text instead.")
  // Platform-wide uploads (no tenant) are superadmin-only; tenant uploads are for that tenant's admins.
  const allowed = caller.role === 'superadmin' || (!!caller.tenantId && u.tenant_id === caller.tenantId)
  if (!allowed) throw new ToolPermissionError('That upload belongs to another organisation.')
  const text = String(u.text || '').slice(0, MAX_TEXT)
  if (!text.trim()) throw new ToolInputError('That upload has no readable text.')
  return { text, title: String(u.title || u.file_name || 'Document'), ...guard(text) }
}

/** Prompt-injection scan of untrusted text (log-only — flagged text is still used only as data). */
export function guard(text: string): { flagged: boolean; reasons: string[] } {
  const scan = scanPrompt(text)
  return { flagged: scan.flagged, reasons: scan.reasons }
}
