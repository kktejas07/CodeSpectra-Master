import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { permissions } from '@/lib/db/admin'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const col = await permissions()
    const result = await col.deleteOne({ id })
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting role:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
