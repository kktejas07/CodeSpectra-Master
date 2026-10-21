/**
 * Study plan collections (lazy indexes).
 *  study_plans             StudyPlanDoc — one active plan per user
 *  study_practice_results  graded practice-set answers (feed the weak-area signals)
 *  study_plan_settings     { _id: 'global' } settings + AI usage counters
 */
import 'server-only'
import type { Collection, Document } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import type { StudyPlanDoc, Difficulty } from './types'
import type { AiUsage, StudyPlanSettings } from './settings'

export interface PracticeResultDoc {
  id: string
  user_id: string
  plan_id: string
  item_id: string
  domain: string
  topic: string | null
  difficulty: Difficulty
  question_id: string
  correct: boolean
  created_at: string
}

export interface SettingsDoc extends Partial<StudyPlanSettings> { _id: 'global'; usage?: AiUsage; updated_at?: string; updated_by?: string }

const ready = new Map<string, Promise<unknown> | null>()
function lazy<T extends Document>(name: string, build: (c: Collection<T>) => Promise<unknown>) {
  return async (): Promise<Collection<T>> => {
    const col = (await getMongoDb()).collection<T>(name)
    if (!ready.get(name)) {
      ready.set(name, build(col).catch((e) => { ready.set(name, null); console.error(`[study-plan] ${name} index build failed`, (e as Error)?.message) }))
    }
    await ready.get(name)
    return col
  }
}

export const plansCol = lazy<StudyPlanDoc>('study_plans', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'study_plans_id' }),
  c.createIndex({ user_id: 1 }, { unique: true, name: 'study_plans_user' }),
  c.createIndex({ status: 1, next_adapt_at: 1 }, { name: 'study_plans_adapt' }),
  c.createIndex({ status: 1, 'reminders.hour': 1 }, { name: 'study_plans_remind' }),
]))

export const practiceCol = lazy<PracticeResultDoc>('study_practice_results', (c) => Promise.all([
  c.createIndex({ user_id: 1, created_at: -1 }, { name: 'study_practice_user' }),
  c.createIndex({ user_id: 1, item_id: 1, question_id: 1 }, { unique: true, name: 'study_practice_once' }),
]))

export const settingsCol = lazy<SettingsDoc>('study_plan_settings', async () => undefined)
