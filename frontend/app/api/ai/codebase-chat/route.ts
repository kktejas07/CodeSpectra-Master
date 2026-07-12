import { NextRequest, NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { getAPIUser } from '@/lib/route-auth'
import { isSafeUrl } from '@/lib/url-safety'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const user = await getAPIUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { message, selectedFiles, scanId } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    let codebaseContext = ''

    if (scanId) {
      const db = await getMongoDb()
      const scan = await db.collection('code_scans').findOne({ id: scanId })
      
      if (scan && scan.code_snippet) {
        codebaseContext += `File: ${scan.file_path || 'main_file'}\n\`\`\`\n${scan.code_snippet}\n\`\`\`\n\n`
      }
    }

    // Call FastAPI internal AI complete endpoint
    const systemPrompt = `You are CodeSpectra Assistant, a premium AI code reviewer and architect. 
You are answering questions about the developer's codebase. 
Here are the contents of the relevant files in the codebase:\n\n${codebaseContext || 'No attached files.'}
Provide concrete, developer-friendly recommendations.`

    const fastApiUrl = process.env.INTERNAL_FASTAPI_URL || 'http://localhost:8001'

    // SECURITY: SSRF protection
    const ssrfCheck = await isSafeUrl(fastApiUrl);
    if (!ssrfCheck.safe) {
      return NextResponse.json({ error: ssrfCheck.error }, { status: 400 });
    }

    const aiRes = await fetch(`${ssrfCheck.url.toString()}/internal/ai/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: `codebase-chat-${user.id}`,
        system_message: systemPrompt,
        user_message: message,
        model_role: 'reasoning',
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      console.error('[CodeSpectra] Codebase Chat complete error:', aiRes.status, errText)
      return NextResponse.json({ error: 'Failed to query AI runner' }, { status: aiRes.status })
    }

    const data = await aiRes.json()
    return NextResponse.json({ reply: data.text || 'No response.' })
  } catch (error) {
    console.error('[CodeSpectra] Codebase Chat error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
