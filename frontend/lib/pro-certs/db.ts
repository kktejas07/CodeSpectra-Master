/**
 * Proctored certifications — collections and indexes (server only).
 *
 *   pro_cert_programs     one per certification (slug unique)
 *   pro_cert_orders       one per paid attempt (payment ref indexed for webhooks)
 *   pro_cert_attempts     one per attempt (order_id unique → settle is idempotent)
 *   pro_cert_exposure     times each bank question was drawn per program
 *   pro_cert_credentials  issued credentials (id = public credential id)
 */
import 'server-only'
import type { Collection, Document } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import type { AttemptDoc, CertOrderDoc, CredentialDoc, ProgramDoc } from './types'

export interface ExposureDoc { program_id: string; question_id: string; count: number; last_at: string }

const ready = new Map<string, Promise<unknown>>()

function lazy<T extends Document>(name: string, build: (c: Collection<T>) => Promise<unknown>) {
  return async (): Promise<Collection<T>> => {
    const col = (await getMongoDb()).collection<T>(name)
    if (!ready.has(name)) {
      ready.set(name, build(col).catch((e) => {
        ready.delete(name)
        console.error(`[pro-certs] index build failed for ${name}:`, (e as Error)?.message)
      }))
    }
    await ready.get(name)
    return col
  }
}

export const programs = lazy<ProgramDoc>('pro_cert_programs', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'pcp_id' }),
  c.createIndex({ slug: 1 }, { unique: true, name: 'pcp_slug' }),
  c.createIndex({ status: 1, updated_at: -1 }, { name: 'pcp_status' }),
]))

export const orders = lazy<CertOrderDoc>('pro_cert_orders', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'pco_id' }),
  c.createIndex({ 'payment.ref': 1 }, { name: 'pco_ref', sparse: true }),
  c.createIndex({ user_id: 1, created_at: -1 }, { name: 'pco_user' }),
  c.createIndex({ status: 1, created_at: 1 }, { name: 'pco_status' }),
]))

export const attempts = lazy<AttemptDoc>('pro_cert_attempts', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'pca_id' }),
  c.createIndex({ order_id: 1 }, { unique: true, name: 'pca_order' }),
  c.createIndex({ user_id: 1, program_id: 1, created_at: -1 }, { name: 'pca_user_program' }),
  c.createIndex({ status: 1, updated_at: 1 }, { name: 'pca_status' }),
  c.createIndex({ exam_id: 1 }, { name: 'pca_exam' }),
]))

export const exposure = lazy<ExposureDoc>('pro_cert_exposure', (c) =>
  c.createIndex({ program_id: 1, question_id: 1 }, { unique: true, name: 'pce_program_question' }),
)

export const credentials = lazy<CredentialDoc>('pro_cert_credentials', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'pcc_id' }),
  c.createIndex({ user_id: 1, program_id: 1, issued_at: -1 }, { name: 'pcc_user_program' }),
  c.createIndex({ status: 1, expires_at: 1 }, { name: 'pcc_expiry' }),
  c.createIndex({ attempt_id: 1 }, { unique: true, name: 'pcc_attempt' }),
]))

export const isDup = (e: unknown) => (e as { code?: number } | null)?.code === 11000
