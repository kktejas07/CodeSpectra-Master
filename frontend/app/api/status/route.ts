import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ComponentStatus = { name: string; status: 'operational' | 'degraded' | 'down'; latency?: number; message?: string }

export async function GET() {
  const components: ComponentStatus[] = []

  // MongoDB
  const mongoStart = Date.now()
  try {
    const db = await getMongoDb()
    await db.command({ ping: 1 })
    components.push({ name: 'Database (MongoDB)', status: 'operational', latency: Date.now() - mongoStart })
  } catch {
    components.push({ name: 'Database (MongoDB)', status: 'down', message: 'Connection failed' })
  }

  // Next.js API
  components.push({ name: 'API Server', status: 'operational' })

  // Piston
  const pistonStart = Date.now()
  try {
    const pistonUrl = process.env.PISTON_URL || 'http://piston:2000/api/v2'
    const res = await fetch(`${pistonUrl}/runtimes`, { signal: AbortSignal.timeout(5000) })
    components.push({
      name: 'Code Execution (Piston)',
      status: res.ok ? 'operational' : 'degraded',
      latency: Date.now() - pistonStart,
      message: res.ok ? undefined : `HTTP ${res.status}`,
    })
  } catch {
    components.push({ name: 'Code Execution (Piston)', status: 'degraded', message: 'Using local executor' })
  }

  // AI providers
  if (process.env.OPENAI_API_KEY) {
    components.push({ name: 'OpenAI API', status: 'operational' })
  }
  if (process.env.ANTHROPIC_API_KEY) {
    components.push({ name: 'Anthropic API', status: 'operational' })
  }
  if (process.env.GEMINI_API_KEY) {
    components.push({ name: 'Google Gemini API', status: 'operational' })
  }

  // Email
  if (process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY) {
    components.push({ name: 'Email Service', status: 'operational' })
  } else {
    components.push({ name: 'Email Service', status: 'degraded', message: 'No provider configured' })
  }

  const allOperational = components.every((c) => c.status === 'operational')
  const overallStatus = allOperational ? 'operational' : components.some((c) => c.status === 'down') ? 'down' : 'degraded'

  return NextResponse.json({
    status: overallStatus,
    updated_at: new Date().toISOString(),
    components,
  })
}
