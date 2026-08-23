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
- Include 2-3 inline images to break up the text and illustrate concepts. For images, use the exact following format:
  <img src="https://image.pollinations.ai/prompt/Isometric%203D%20illustration%20representing%20[YOUR_URL_ENCODED_PROMPT],%20featuring%20a%20cute%203D%20tech%20mascot%20character,%20glowing%20technological%20symbols,%20floating%20glossy%203D%20objects,%20clean%20gradient%20studio%20background,%20soft%20shadows,%20vibrant%20modern%20colors,%20playful%20but%20professional%20tech%20blog%20aesthetic,%20high%20detail%20render,%20no%20text,%20no%20words,%20no%20letters,%20no%20logos?width=800&height=400&nologo=true&seed=[RANDOM_5_DIGIT_NUMBER]" alt="Description" class="my-6 rounded-xl border border-border object-cover w-full shadow-sm" />
  Make sure [YOUR_URL_ENCODED_PROMPT] is a highly descriptive prompt relevant to the section. Generate a random 5-digit number for the [RANDOM_5_DIGIT_NUMBER] to ensure consistency.
- Maintain a professional, insightful, and practical tone suited for software engineers and tech professionals.
- Do NOT output any wrapper text like "Here is the post:", and DO NOT wrap the output in markdown \`\`\`html blocks. Just output raw HTML.
`

  const FALLBACK_PROVIDERS = [
    { provider: 'groq', model: 'openai/gpt-oss-120b' },
    { provider: 'gemini', model: 'gemini-2.0-flash' },
    { provider: 'openai', model: 'gpt-4o-mini' },
    { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
    { provider: 'opencode', model: 'deepseek-v4-flash-free' },
  ]

  let lastError = ''
  let html = ''

  for (const p of FALLBACK_PROVIDERS) {
    try {
      const res = await backendComplete({
        systemMessage: 'You are an expert technical writer.',
        userMessage: prompt,
        modelRole: 'reasoning',
        providerOverride: p.provider,
        modelOverride: p.model,
      })
      if (res.ok && res.text) {
        html = res.text
        break
      } else {
        lastError = res.text || 'Unknown API error'
        console.warn(`[admin/blog/ai-write] failed with ${p.provider}:`, lastError)
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      console.warn(`[admin/blog/ai-write] failed with ${p.provider}:`, lastError)
    }
  }

  if (!html) {
    console.error('[admin/blog/ai-write] all providers failed. Last error:', lastError)
    return NextResponse.json(
      { error: `Content generation failed: ${lastError}` }, 
      { status: 502 }
    )
  }

  return NextResponse.json({ ok: true, html })
}
