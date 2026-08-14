import { getMongoDb } from '@/lib/mongodb'

export interface LeakDetectionResult {
  leakedQuestions: Array<{
    questionId: string
    questionTitle: string
    matchCount: number  // how many submissions had this exact answer
    confidence: number  // 0-1
  }>
  totalFlagged: number
}

/**
 * Detects if exam answers match known leaked question bank answers.
 * Compares submission answers against the question_bank collection.
 */
export async function detectLeaks(examId: string): Promise<LeakDetectionResult> {
  const db = await getMongoDb()

  const exam = await db.collection('exams').findOne({ id: examId })
  const questions = Array.isArray(exam?.questionList)
    ? exam!.questionList
    : Array.isArray(exam?.questions)
      ? exam!.questions
      : []

  const submissions = await db.collection('exam_submissions')
    .find({ exam_id: examId })
    .toArray()

  const leakedQuestions: LeakDetectionResult['leakedQuestions'] = []

  // Load question bank
  let questionBank: any[] = []
  try {
    questionBank = await db.collection('question_bank').find({}).toArray()
  } catch {
    return { leakedQuestions: [], totalFlagged: 0 }
  }

  if (questionBank.length === 0 || submissions.length === 0) {
    return { leakedQuestions: [], totalFlagged: 0 }
  }

  for (const q of questions) {
    // Find matching bank entry by question_id or question text
    const bankEntry = questionBank.find(
      (b: any) => b.question_id === q.id || b.question_text === q.question
    )
    if (!bankEntry) continue

    const bankAnswer = String(bankEntry.answer || '').trim().toLowerCase()
    if (!bankAnswer) continue

    // Count how many submissions used the exact bank answer
    let matchCount = 0
    for (const sub of submissions) {
      const userAnswer = String(sub.answers?.[q.id] || '').trim().toLowerCase()
      if (userAnswer && userAnswer === bankAnswer) {
        matchCount++
      }
    }

    if (matchCount > 0) {
      // Confidence: higher if more submissions match the leaked answer
      // and the question is not a simple MCQ (where everyone picks the same)
      const qType = (q.type || '').toLowerCase().replace(/[-_]/g, '')
      const isComplexQuestion = ['coding', 'descriptive', 'fillblanks', 'fillintheblanks'].includes(qType)

      const matchRatio = matchCount / submissions.length
      const baseConfidence = isComplexQuestion ? 0.8 : 0.4
      const confidence = Math.min(1, baseConfidence + matchRatio * 0.5)

      leakedQuestions.push({
        questionId: q.id,
        questionTitle: q.question || q.title || q.id,
        matchCount,
        confidence: Math.round(confidence * 100) / 100,
      })
    }
  }

  return {
    leakedQuestions,
    totalFlagged: leakedQuestions.length,
  }
}
