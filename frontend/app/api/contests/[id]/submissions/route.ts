/**
 * POST /api/contests/[id]/submissions — submit for the contest's format.
 *   JSON: { task_id?, language?, code?, flag?, prompt?, pr_url?, text? }
 *   multipart (datathon predictions, ideathon deck/video, design diagram):
 *     fields task_id?, text?; files named by slot role (predictions | deck | video | diagram).
 * Limits per format live in lib/contests/participation.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { submitToContest, type UploadedFile } from '@/lib/contests/participation'
import { FORMATS } from '@/lib/contests/formats'
import { guarded, loadVisible, notFound, respond, unauthorized, withUser } from '@/lib/contests/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const jsonSchema = z.object({
  task_id: z.string().max(60).optional(),
  language: z.string().max(30).optional(),
  code: z.string().max(70_000).optional(),
  flag: z.string().max(300).optional(),
  prompt: z.string().max(10_000).optional(),
  pr_url: z.string().max(400).optional(),
  text: z.string().max(70_000).optional(),
})

export async function POST(req: Request, ctx: Ctx) {
  const user = await withUser()
  if (!user) return unauthorized()
  const { id } = await ctx.params
  return guarded('submit', async () => {
    const c = await loadVisible(id, user)
    if (!c) return notFound()
    const type = req.headers.get('content-type') || ''
    if (type.includes('multipart/form-data')) {
      let form: FormData
      try { form = await req.formData() } catch { return NextResponse.json({ error: 'Upload could not be read. Files must be under 9 MB.' }, { status: 400 }) }
      const files: UploadedFile[] = []
      for (const slot of FORMATS[c.format].files || []) {
        const f = form.get(slot.role)
        if (f instanceof File && f.size > 0) {
          if (f.size > slot.maxBytes) return NextResponse.json({ error: `${slot.label}: files can be up to ${Math.round(slot.maxBytes / 1024 / 1024)} MB.` }, { status: 413 })
          files.push({ role: slot.role, name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })
        }
      }
      const fields = jsonSchema.safeParse({ task_id: form.get('task_id') ?? undefined, text: form.get('text') ?? undefined })
      if (!fields.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
      return respond(await submitToContest(user, c, fields.data, files))
    }
    const parsed = jsonSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    return respond(await submitToContest(user, c, parsed.data))
  })
}
