import { NextResponse } from 'next/server'

const KNOWN_PLATFORMS = new Set([
  'github', 'gitlab', 'google', 'slack',
  'vscode', 'jetbrains', 'razorpay',
])

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const { platform } = await params
  if (!KNOWN_PLATFORMS.has(platform)) {
    return NextResponse.json(
      { error: `Unknown platform: ${platform}` },
      { status: 400 },
    )
  }
  return NextResponse.json(
    { error: `${platform} integration is not yet available` },
    { status: 501 },
  )
}
