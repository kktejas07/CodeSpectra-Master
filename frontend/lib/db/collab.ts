import { newId, nowIso } from './ids'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export { newId, nowIso }

export interface CollabDocumentDoc {
  id: string
  session_id: string
  content: string
  language: string
  version: number
  last_editor_id: string
  last_editor_name: string
  created_at: string
  updated_at: string
}

export interface CollabPresenceDoc {
  id: string
  session_id: string
  user_id: string
  user_name: string
  cursor_line: number
  cursor_column: number
  last_seen: string
}

export async function collabDocuments(): Promise<Collection<CollabDocumentDoc>> {
  return (await getMongoDb()).collection<CollabDocumentDoc>('collab_documents')
}

export async function collabPresences(): Promise<Collection<CollabPresenceDoc>> {
  return (await getMongoDb()).collection<CollabPresenceDoc>('collab_presences')
}

export async function getOrCreateDocument(session_id: string, language = 'javascript'): Promise<CollabDocumentDoc> {
  const col = await collabDocuments()
  let doc: CollabDocumentDoc | null = await col.findOne({ session_id })
  if (!doc) {
    doc = {
      id: newId(),
      session_id,
      content: getLanguageTemplate(language),
      language,
      version: 1,
      last_editor_id: '',
      last_editor_name: '',
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    await col.insertOne(doc)
  }
  return doc
}

function getLanguageTemplate(lang: string): string {
  const templates: Record<string, string> = {
    javascript: '// Write your JavaScript solution here\n\nfunction solve(input) {\n  \n  return result;\n}\n',
    typescript: '// Write your TypeScript solution here\n\nfunction solve(input: string): string {\n  \n  return result;\n}\n',
    python: '# Write your Python solution here\n\n\ndef solve(input):\n    \n    return result\n',
    java: '// Write your Java solution here\n\npublic class Solution {\n    public static void main(String[] args) {\n        \n    }\n}\n',
    cpp: '// Write your C++ solution here\n\n#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
    go: '// Write your Go solution here\n\npackage main\n\nfunc main() {\n    \n}\n',
    rust: '// Write your Rust solution here\n\nfn main() {\n    \n}\n',
  }
  return templates[lang] || templates.javascript
}
