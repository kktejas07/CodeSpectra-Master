import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json()
    return NextResponse.json({
      success: true,
      registrationId: String(Math.random()),
      codeathonId: params.id,
      registeredAt: new Date().toISOString(),
      ...data,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to register for codeathon' }, { status: 400 })
  }
}
