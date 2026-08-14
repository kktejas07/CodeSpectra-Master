import { getMongoDb } from '@/lib/mongodb'

export interface PlagiarismResult {
  suspiciousPairs: Array<{
    userId1: string
    userId2: string
    questionId: string
    similarity: number
    bothCorrect: boolean
  }>
  questionBankMatches: Array<{
    userId: string
    questionId: string
    matchType: 'exact' | 'near'
  }>
  score: number  // 0-100 plagiarism risk
}

/**
 * Simple plagiarism detection — compares answers across submissions
 * for the same exam to detect identical or near-identical answers.
 *
 * Also checks if coding answers match the question bank answers exactly.
 */
export async function detectPlagiarism(examId: string): Promise<PlagiarismResult> {
  const db = await getMongoDb()

  const submissions = await db.collection('exam_submissions')
    .find({ exam_id: examId })
    .toArray()

  const exam = await db.collection('exams').findOne({ id: examId })
  const questions = Array.isArray(exam?.questionList)
    ? exam!.questionList
    : Array.isArray(exam?.questions)
      ? exam!.questions
      : []

  const suspiciousPairs: PlagiarismResult['suspiciousPairs'] = []
  const questionBankMatches: PlagiarismResult['questionBankMatches'] = []

  // Build answer map: questionId -> { userId -> answer }
  const answerMap: Record<string, Record<string, string>> = {}
  for (const q of questions) {
    answerMap[q.id] = {}
  }

  for (const sub of submissions) {
    const answers = sub.answers || {}
    for (const q of questions) {
      const ans = String(answers[q.id] || '').trim()
      if (ans) {
        answerMap[q.id][sub.user_id] = ans
      }
    }
  }

  // For each question, find pairs with identical answers
  for (const q of questions) {
    const qAnswers = answerMap[q.id]
    const userIds = Object.keys(qAnswers)

    for (let i = 0; i < userIds.length; i++) {
      for (let j = i + 1; j < userIds.length; j++) {
        const ans1 = qAnswers[userIds[i]].toLowerCase()
        const ans2 = qAnswers[userIds[j]].toLowerCase()

        if (ans1 === ans2 && ans1.length > 0) {
          // Exact match — high similarity
          const qType = (q.type || '').toLowerCase().replace(/[-_]/g, '')
          const isCodingOrDescriptive = ['coding', 'descriptive'].includes(qType)

          // For coding/descriptive, identical answers are more suspicious
          // For MCQ, identical answers are common (only 4 options)
          const similarity = isCodingOrDescriptive ? 0.95 : 0.5

          // Check if both got it correct
          const sub1 = submissions.find(s => s.user_id === userIds[i])
          const sub2 = submissions.find(s => s.user_id === userIds[j])
          const correctAns = String(q.answer || q.correct_answer || '').trim().toLowerCase()
          const bothCorrect = correctAns
            ? (String(sub1?.answers?.[q.id] || '').trim().toLowerCase() === correctAns &&
               String(sub2?.answers?.[q.id] || '').trim().toLowerCase() === correctAns)
            : false

          suspiciousPairs.push({
            userId1: userIds[i],
            userId2: userIds[j],
            questionId: q.id,
            similarity,
            bothCorrect,
          })
        } else if (ans1.length > 10 && ans2.length > 10) {
          // For long answers, check similarity via simple overlap
          const similarity = computeSimilarity(ans1, ans2)
          if (similarity > 0.85) {
            suspiciousPairs.push({
              userId1: userIds[i],
              userId2: userIds[j],
              questionId: q.id,
              similarity,
              bothCorrect: false,
            })
          }
        }
      }
    }
  }

  // Check against question bank
  try {
    const questionBank = await db.collection('question_bank').find({}).toArray()
    if (questionBank.length > 0) {
      for (const q of questions) {
        const bankEntry = questionBank.find(
          (b: any) => b.question_id === q.id || b.question_text === q.question
        )
        if (!bankEntry) continue

        const bankAnswer = String(bankEntry.answer || '').trim().toLowerCase()
        if (!bankAnswer) continue

        for (const sub of submissions) {
          const userAnswer = String(sub.answers?.[q.id] || '').trim().toLowerCase()
          if (!userAnswer) continue

          if (userAnswer === bankAnswer) {
            questionBankMatches.push({
              userId: sub.user_id,
              questionId: q.id,
              matchType: 'exact',
            })
          } else if (computeSimilarity(userAnswer, bankAnswer) > 0.9) {
            questionBankMatches.push({
              userId: sub.user_id,
              questionId: q.id,
              matchType: 'near',
            })
          }
        }
      }
    }
  } catch {
    // question_bank collection may not exist — skip silently
  }

  // Compute overall plagiarism score (0-100)
  const totalPairs = submissions.length * (submissions.length - 1) / 2
  const suspiciousRatio = totalPairs > 0 ? suspiciousPairs.length / totalPairs : 0
  const bankMatchRatio = submissions.length > 0
    ? questionBankMatches.length / submissions.length
    : 0

  const score = Math.min(100, Math.round(
    (suspiciousRatio * 60) + (bankMatchRatio * 40)
  ) * 100)

  return {
    suspiciousPairs,
    questionBankMatches,
    score,
  }
}

/**
 * Simple Jaccard similarity on character n-grams.
 */
function computeSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  const ngramSize = 3
  const aNgrams = new Set<string>()
  const bNgrams = new Set<string>()

  for (let i = 0; i <= a.length - ngramSize; i++) {
    aNgrams.add(a.slice(i, i + ngramSize))
  }
  for (let i = 0; i <= b.length - ngramSize; i++) {
    bNgrams.add(b.slice(i, i + ngramSize))
  }

  if (aNgrams.size === 0 || bNgrams.size === 0) return 0

  let intersection = 0
  for (const ng of aNgrams) {
    if (bNgrams.has(ng)) intersection++
  }

  const union = aNgrams.size + bNgrams.size - intersection
  return union > 0 ? intersection / union : 0
}
