import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { invalidateServerSecretsCache } from '@/lib/server-secrets-cache'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  let body: { type?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { type } = body

  switch (type) {
    case 'next': {
      try {
        const cacheDir = path.join(process.cwd(), '.next', 'cache')
        if (fs.existsSync(cacheDir)) {
          fs.rmSync(cacheDir, { recursive: true, force: true })
        }
        const serverDir = path.join(process.cwd(), '.next', 'server')
        const removeMeta = (dir: string) => {
          if (!fs.existsSync(dir)) return
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) removeMeta(full)
            else if (entry.name.endsWith('.meta') || entry.name.endsWith('.html')) {
              try { fs.unlinkSync(full) } catch { /* race */ }
            }
          }
        }
        removeMeta(serverDir)
        invalidateServerSecretsCache()
        return NextResponse.json({ message: 'Next.js cache + secrets cache cleared' })
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
      }
    }

    case 'secrets': {
      invalidateServerSecretsCache()
      return NextResponse.json({ message: 'Server secrets cache invalidated' })
    }

    case 'piston': {
      try {
        const res = await fetch('http://codespectra-piston:2000/api/v2/runtimes', {
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) throw new Error(`Piston returned ${res.status}`)
        return NextResponse.json({ message: 'Piston is running — reinstall packages via Piston CLI' })
      } catch (e: any) {
        return NextResponse.json({ error: `Piston unreachable: ${e.message}` }, { status: 500 })
      }
    }

    case 'docker':
    case 'system': {
      return NextResponse.json({
        message: 'This operation requires host-level access. Run directly on the server via SSH.',
        hint: 'ssh root@server "docker system prune -f" or "echo 3 > /proc/sys/vm/drop_caches"',
      })
    }

    default:
      return NextResponse.json({ error: `Unknown cache type: ${type}` }, { status: 400 })
  }
}
