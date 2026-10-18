/**
 * Candidate invites: create + email one invite, and remind pending invitees.
 * Extracted from POST /api/admin/users (assessment-invite branch) and
 * POST /api/admin/exams/[id]/invites/remind — the routes and the admin agent
 * both call these, so tenant checks, emails, delivery status and audit logs
 * are identical.
 */
import 'server-only'
import { formatDate } from '@/lib/format-datetime'
import { getMongoDb } from '@/lib/mongodb'
import { users, candidateInvites, newId, nowIso, type AssessmentStep } from '@/lib/db/admin'
import { checkInviteTargets, inviteIsForExam, isExamStaff } from '@/lib/exam-access'
import { auditAdmin } from '@/lib/admin-audit'
import { normalizeUserRole } from '@/lib/rbac'
import { sanitizeRegex } from '@/lib/sanitize'
import { escapeHtml } from '@/lib/org-invitations-core'
import { ok, fail, type ServiceResult, type ServiceUser } from './result'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DEFAULT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface CandidateInviteInput {
  email: string
  full_name?: string
  target_url?: string
  exam_title?: string
  cc_email?: string
  assigned_assessments?: AssessmentStep[]
  allowed_languages?: string[]
  /** Agent only: invite expiry (ISO). Default 7 days. */
  expires_at?: string
  /** Agent only: short note from the recruiter, added to the email (escaped). */
  message?: string
}

export interface CandidateInviteResult {
  user: Record<string, unknown>
  invite_id: string
  invite_url: string
  invite_token: string
  target_url: string
  welcomeEmailSent: boolean
  delivery: string
  is_existing_user: boolean
}

/** The account (if any) for an email — matched case-insensitively. */
export async function findUserByEmail(email: string): Promise<Record<string, unknown> | null> {
  const col = await users()
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return (await col.findOne({ $or: [{ email }, { email: { $regex: `^${escaped}$`, $options: 'i' } }] } as never)) as Record<string, unknown> | null
}

/**
 * Create a single-use candidate invite and email it. Existing accounts are
 * only *referenced* — password, id, role and tenant are never touched.
 * Throws on unexpected DB errors (the route answers 500).
 */
export async function createCandidateInvite(
  actor: ServiceUser,
  input: CandidateInviteInput,
  existingUser?: Record<string, unknown> | null,
): Promise<ServiceResult<CandidateInviteResult>> {
  const email = (typeof input.email === 'string' ? input.email : '').trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) return fail(400, 'Valid email is required')
  const full_name = (typeof input.full_name === 'string' ? input.full_name : '').trim().slice(0, 120) || email.split('@')[0] || 'User'
  const existing = existingUser === undefined ? await findUserByEmail(email) : existingUser

  const db = await getMongoDb()
  const targetUrl = (typeof input.target_url === 'string' ? input.target_url : '/assessment').trim() || '/assessment'
  const targets = await checkInviteTargets(db, actor, { target_url: targetUrl, assigned_assessments: input.assigned_assessments })
  if (!targets.ok) return fail(targets.status, targets.error)

  const allowedLanguages = Array.isArray(input.allowed_languages)
    ? input.allowed_languages.filter((l): l is string => typeof l === 'string').slice(0, 50)
    : []
  const assignedAssessments: AssessmentStep[] =
    Array.isArray(input.assigned_assessments) && input.assigned_assessments.length > 0
      ? input.assigned_assessments
      : [
          {
            id: crypto.randomUUID(),
            title: 'Assigned Assessment',
            target_url: targetUrl,
            type: (targetUrl.includes('cad')
              ? 'cad'
              : targetUrl.includes('identity')
              ? 'identity'
              : targetUrl.includes('problems')
              ? 'coding'
              : 'general') as AssessmentStep['type'],
            allowed_languages: allowedLanguages,
            status: 'pending',
          },
        ]

  const existingId = existing ? String((existing as { id?: unknown }).id || (existing as { _id: unknown })._id) : null
  const isExistingUser = !!existing

  // Expire old pending invites for same email + exam
  const invitesCol = await candidateInvites()
  await invitesCol.updateMany(
    { email, target_url: targetUrl, status: 'pending' },
    { $set: { status: 'expired', updated_at: nowIso() } }
  )

  // Generate single-use secure candidate invite link
  const inviteId = newId()
  const inviteToken = crypto.randomUUID()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const inviteUrl = `${appUrl}/assessment/invite/${inviteToken}`
  const expiresAt = input.expires_at && !Number.isNaN(new Date(input.expires_at).getTime())
    ? new Date(input.expires_at)
    : new Date(Date.now() + DEFAULT_INVITE_TTL_MS)
  const message = typeof input.message === 'string' ? input.message.trim().slice(0, 1000) : ''

  await invitesCol.insertOne({
    id: inviteId,
    token: inviteToken,
    user_id: existingId,
    email,
    full_name,
    target_url: targetUrl,
    ...(targets.examId ? { exam_id: targets.examId } : {}),
    assigned_assessments: assignedAssessments,
    allowed_languages: allowedLanguages,
    invited_by: actor.id,
    ...(actor.tenantId ? { tenant_id: actor.tenantId } : {}),
    status: 'pending',
    expires_at: expiresAt.toISOString(),
    created_at: nowIso(),
    delivery_status: 'sending',
    ...(message ? { custom_message: message } : {}),
  } as never)

  // Send assessment invite email via Postal
  let welcomeEmailSent = false
  let delivery = 'candidate_invite_link'
  try {
    const { sendEmail } = await import('@/lib/send-email')
    const { emailTemplates } = await import('@/lib/email-templates')
    const expiresStr = formatDate(expiresAt, undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    const template = emailTemplates.assessmentInvite({
      candidateName: full_name,
      examTitle: (typeof input.exam_title === 'string' && input.exam_title.slice(0, 200)) || 'Technical Assessment',
      inviteUrl,
      expiresIn: expiresStr,
    })
    if (message) {
      // Recruiter note (escaped) right under the heading.
      template.html = template.html.replace('</h1>', `</h1><p style="margin:12px 0 0;font-size:14px;white-space:pre-line">${escapeHtml(message)}</p>`)
    }
    const cc = typeof input.cc_email === 'string' && EMAIL_RE.test(input.cc_email.trim()) ? input.cc_email.trim() : undefined
    const result = await sendEmail(email, template, cc)
    welcomeEmailSent = result.success
    delivery = result.provider

    // Delivery lifecycle: sent (provider accepted) → delivered/opened via
    // Postal webhook; failed when every provider throws. Never left on the
    // initial 'sending' once we know the outcome.
    await invitesCol.updateOne(
      { id: inviteId },
      {
        $set: {
          ...(result.postalMessageId ? { postal_message_id: result.postalMessageId } : {}),
          delivery_status: result.success ? 'sent' : 'failed',
          delivery_updated_at: new Date().toISOString(),
          ...(result.success ? {} : { delivery_error: 'All email providers failed' }),
        },
      }
    )
  } catch {
    // All providers failed — link still returned for manual copy
    await invitesCol.updateOne(
      { id: inviteId },
      {
        $set: {
          delivery_status: 'failed',
          delivery_updated_at: new Date().toISOString(),
          delivery_error: 'All email providers failed',
        },
      }
    ).catch(() => {})
  }

  await auditAdmin(actor, 'admin.candidate.invite', 'candidate_invite', `invite/${inviteId}`, `email=${email} target=${targetUrl} existing=${isExistingUser}`)

  const existingCreated = (existing as { createdAt?: unknown } | null)?.createdAt
  return ok({
    user: {
      id: existingId,
      email,
      full_name: existing ? ((existing as { fullName?: string; name?: string }).fullName || (existing as { name?: string }).name || full_name) : full_name,
      role: existing ? normalizeUserRole((existing as { role?: string }).role) : 'user',
      tenant_id: existing ? ((existing as { tenantId?: string | null }).tenantId ?? null) : null,
      created_at: existingCreated instanceof Date ? existingCreated.toISOString() : (existingCreated as string | undefined) ?? null,
    },
    invite_id: inviteId,
    invite_url: inviteUrl,
    invite_token: inviteToken,
    target_url: targetUrl,
    welcomeEmailSent,
    delivery,
    is_existing_user: isExistingUser,
  })
}

/** Still-valid invites for exactly this exam from candidates who haven't submitted. */
export async function pendingInvitesForExam(examId: string): Promise<Array<Record<string, any>>> {
  const db = await getMongoDb()
  const now = new Date().toISOString()
  const candidates = await db.collection('candidate_invites').find({
    $or: [{ exam_id: examId }, { target_url: { $regex: `/assessment/${sanitizeRegex(String(examId))}(?:[/?]|$)` } }],
    status: { $in: ['pending', 'active'] },
    expires_at: { $gt: now },
  }).toArray()
  const submitted = new Set(
    (await db.collection('exam_submissions').find({ exam_id: examId }, { projection: { _id: 0, email: 1, user_id: 1 } }).toArray())
      .flatMap((s) => [String(s.email || '').toLowerCase(), String(s.user_id || '')]).filter(Boolean),
  )
  return candidates.filter((inv) => inviteIsForExam(inv as Record<string, unknown>, examId)
    && !submitted.has(String(inv.email || '').toLowerCase()) && !(inv.user_id && submitted.has(String(inv.user_id))))
}

export interface ReminderResult {
  message?: string
  success?: boolean
  sent: number
  total: number
  errors?: string[]
}

/**
 * Email a reminder to every pending invitee of one exam (tenant-checked).
 * `onlyInviteIds` narrows the batch (agent preview → confirm keeps the same set).
 */
export async function sendExamInviteReminders(
  actor: ServiceUser,
  examId: string,
  opts: { onlyInviteIds?: string[] } = {},
): Promise<ServiceResult<ReminderResult>> {
  const db = await getMongoDb()
  if (!examId) return fail(400, 'id required')
  const exam = await db.collection('exams').findOne({ id: examId })
  if (!exam) return fail(404, 'Not found')
  if (!isExamStaff(actor, exam)) return fail(403, 'Forbidden - resource belongs to another tenant')

  let pendingInvites = await pendingInvitesForExam(examId)
  if (opts.onlyInviteIds) {
    const only = new Set(opts.onlyInviteIds)
    pendingInvites = pendingInvites.filter((inv) => only.has(String(inv.id)))
  }
  if (pendingInvites.length === 0) {
    return ok({ message: 'No pending invites to remind', sent: 0, total: 0 })
  }

  const { sendEmail } = await import('@/lib/send-email')
  const { emailTemplates } = await import('@/lib/email-templates')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const examTitle = exam.title || 'Technical Assessment'
  let sent = 0
  const errors: string[] = []

  for (const invite of pendingInvites) {
    try {
      const inviteUrl = `${appUrl}/assessment/invite/${invite.token}`
      const expiresAt = new Date(invite.expires_at)
      const expiresStr = formatDate(expiresAt, undefined, { month: 'long', day: 'numeric', year: 'numeric' })

      const template = emailTemplates.assessmentReminder({
        candidateName: invite.full_name || invite.email,
        examTitle,
        inviteUrl,
        expiresIn: expiresStr,
      })

      const result = await sendEmail(invite.email, template)

      await db.collection('candidate_invites').updateOne(
        { id: invite.id },
        {
          $set: {
            ...(result.postalMessageId ? { postal_message_id: result.postalMessageId } : {}),
            delivery_status: result.success ? 'sent' : 'failed',
            delivery_updated_at: new Date().toISOString(),
            ...(result.success ? {} : { delivery_error: 'Reminder send failed' }),
          },
        }
      )
      if (result.success) sent++
      else errors.push(`Failed for ${invite.email}`)
    } catch (e) {
      console.error('[remind] send failed:', e)
      errors.push(`Failed for ${invite.email}`)
    }
  }

  return ok({
    success: sent > 0,
    sent,
    total: pendingInvites.length,
    errors: errors.length > 0 ? errors : undefined,
  })
}
