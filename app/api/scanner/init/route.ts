import { NextRequest, NextResponse } from 'next/server'
import { initializeSampleData, clearProjectData } from '@/lib/initialize-sonarqube-data'

/**
 * POST /api/scanner/init
 * Initialize database schema and sample data
 * For development/demo purposes only
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action = 'init', projectId = 'demo-project' } = body

    // Security: Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'This endpoint is not available in production' },
        { status: 403 }
      )
    }

    if (action === 'init') {
      const result = await initializeSampleData(projectId)
      return NextResponse.json(result)
    } else if (action === 'clear') {
      const result = await clearProjectData(projectId)
      return NextResponse.json(result)
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "init" or "clear"' },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('[v0] Initialization error:', error)
    return NextResponse.json(
      { error: 'Initialization failed', details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * GET /api/scanner/init
 * Check initialization status
 */
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      status: 'ready',
      environment: process.env.NODE_ENV,
      message: 'POST to this endpoint with { action: "init" | "clear", projectId: string } to initialize/clear data',
    })
  } catch (error) {
    console.error('[v0] Status check error:', error)
    return NextResponse.json(
      { error: 'Status check failed' },
      { status: 500 }
    )
  }
}
