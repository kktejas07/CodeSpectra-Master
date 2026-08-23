/**
 * POST /api/admin/blog/ai-write
 * Body: { title, excerpt, category } → generate a blog post body.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { backendComplete } from '@/lib/ai/backend'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = (await req.json().catch(() => ({}))) as {
    title?: string
    excerpt?: string
    category?: string
  }

  if (!body.title) {
    return NextResponse.json({ error: 'Title required' }, { status: 400 })
  }

  const prompt = `You are a Senior Staff Engineer and expert technical writer for the CodeSpectra engineering blog.
Your task is to write a highly detailed, professional, and deeply insightful blog post. We want this to read like a human-written, top-tier engineering article (like those from Stripe, Cloudflare, or Netflix engineering blogs). Do not use generic AI buzzwords. Be opinionated, use real-world context, and organize your thoughts meticulously.

Title: ${body.title}
Category: ${body.category || 'General'}
Excerpt (optional guidance): ${body.excerpt || 'Write a comprehensive guide.'}

Requirements:
- Output ONLY valid, clean HTML for the body content. Do not include the title (it's already on the page).
- Structure the post with an engaging introduction, deep-dive technical context, real-world examples, and a strong conclusion.
- Use standard HTML tags (<h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <code>, <pre>).
- Aim for a length of 800-1500 words of rich, detailed content.
- Include 2-3 inline images to break up the text and illustrate concepts. For images, use the following format:
  <img src="https://image.pollinations.ai/prompt/A%20minimalist%20tech%20illustration%20of%20[YOUR_URL_ENCODED_PROMPT]?width=800&height=400&nologo=true" alt="Description" class="my-4 rounded-lg border object-cover w-full" />
  Make sure [YOUR_URL_ENCODED_PROMPT] is a highly descriptive prompt for a modern, clean, vector-style tech illustration relevant to the section.
- Maintain a professional, insightful, and practical tone suited for software engineers and tech professionals.
- Do NOT output any wrapper text like "Here is the post:", and DO NOT wrap the output in markdown \`\`\`html blocks. Just output raw HTML.
`

  try {
    const res = await backendComplete({
      systemMessage: 'You are an expert technical writer.',
      userMessage: prompt,
      // Long-form article generation — use the platform's reasoning tier.
      modelRole: 'reasoning',
    })
    const aiText = res.ok ? res.text : undefined

    if (!aiText) {
      return NextResponse.json({ error: 'Generation failed — empty response' }, { status: 502 })
    }

    // The admin blog form body field is HTML (TipTap editor) and the prompt
    // demands raw HTML output, so pass it through as-is.
    return NextResponse.json({ ok: true, html: aiText })
  } catch (e) {
    console.error('[admin/blog/ai-write]', e)
    return NextResponse.json({ error: 'Content generation failed' }, { status: 500 })
  }
}
