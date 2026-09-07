import { z } from 'zod'
import { getMongoDb } from '@/lib/mongodb'
import { ObjectId, type Collection } from 'mongodb'

export const feedbackSchema = z.object({
  type: z.enum(['bug', 'complaint', 'suggestion', 'other']),
  content: z.string().min(1, "Feedback content cannot be empty"),
  user_id: z.string().optional(), // Can be anonymous
  status: z.enum(['open', 'resolved']).default('open'),
  created_at: z.string(), // ISO String
})

export type FeedbackData = z.infer<typeof feedbackSchema>

export interface FeedbackDoc extends FeedbackData {
  _id: ObjectId
  admin_reply?: string
  replied_at?: string
  replied_by?: string
}

export async function getFeedbackCollection(): Promise<Collection<FeedbackDoc>> {
  const db = await getMongoDb()
  return db.collection<FeedbackDoc>('platform_feedback')
}

export async function insertFeedback(data: Omit<FeedbackData, 'created_at'>) {
  const col = await getFeedbackCollection()
  const doc: FeedbackData = {
    ...data,
    created_at: new Date().toISOString(),
  }
  const result = await col.insertOne(doc as any)
  return result.insertedId.toHexString()
}

export async function listFeedback(query: any = {}, sort: any = { created_at: -1 }, limit = 100) {
  const col = await getFeedbackCollection()
  const docs = await col.find(query).sort(sort).limit(limit).toArray()
  return docs.map(doc => ({
    ...doc,
    _id: doc._id.toHexString(),
  }))
}

export async function updateFeedbackStatus(id: string, status: 'open' | 'resolved') {
  const col = await getFeedbackCollection()
  await col.updateOne({ _id: new ObjectId(id) }, { $set: { status } })
}

export async function deleteFeedback(id: string) {
  const col = await getFeedbackCollection()
  await col.deleteOne({ _id: new ObjectId(id) })
}
