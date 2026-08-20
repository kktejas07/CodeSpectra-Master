import { getMongoDb } from '@/lib/mongodb'
import { getAPIUser } from '@/lib/route-auth'

export const FREE_AI_CREDITS = 100
export const PRO_AI_CREDITS = 1000
export const ENTERPRISE_AI_CREDITS = 5000

export async function getUserAiCredits(userId: string) {
  const db = await getMongoDb()
  const user = await db.collection('user').findOne({ id: userId })
  
  if (!user) return { balance: 0, plan: 'free' }
  
  // If no aiCredits field exists, initialize based on plan
  let balance = user.aiCredits
  const plan = user.plan || 'free'
  
  if (balance === undefined) {
    if (plan.startsWith('pro')) balance = PRO_AI_CREDITS
    else if (plan === 'enterprise' || plan === 'problem_pack_50') balance = ENTERPRISE_AI_CREDITS
    else balance = FREE_AI_CREDITS
  }

  // Handle monthly reset if needed (if creditsResetAt is past)
  let needsReset = false
  if (!user.creditsResetAt || new Date(user.creditsResetAt) < new Date()) {
    needsReset = true
    if (plan.startsWith('pro')) balance = PRO_AI_CREDITS
    else if (plan === 'enterprise' || plan === 'problem_pack_50') balance = ENTERPRISE_AI_CREDITS
    else balance = FREE_AI_CREDITS
  }

  if (needsReset) {
    const nextMonth = new Date()
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    await db.collection('user').updateOne(
      { id: userId },
      { $set: { aiCredits: balance, creditsResetAt: nextMonth } }
    )
  }

  return { balance, plan }
}

export async function deductUserAiCredits(userId: string, amount: number = 1) {
  const db = await getMongoDb()
  await db.collection('user').updateOne(
    { id: userId },
    { $inc: { aiCredits: -amount } }
  )
}
