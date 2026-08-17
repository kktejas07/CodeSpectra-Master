import { getMongoDb } from '@/lib/mongodb'
import { backendComplete } from '@/lib/ai/backend'

export interface PlagiarismResult {
  suspiciousPairs: Array<{
    userId1: string
    userId2: string
    questionId: string
    similarity: number
    bothCorrect: boolean
    aiSemanticMatch?: boolean
    aiConfidence?: number
  }>
  questionBankMatches: Array<{
    userId: string
    questionId: string
    matchType: 'exact' | 'near'
  }>
  aiGeneratedFlags: Array<{
    userId: string
    questionId: string
    probability: number
    reason: string
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
  const aiGeneratedFlags: PlagiarismResult['aiGeneratedFlags'] = []
  
  const aiPromises: Promise<void>[] = []

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
        
        // AI Generation Detection for long answers (> 100 chars)
        if (ans.length > 100) {
          aiPromises.push((async () => {
            const aiGen = await checkAIGeneration(ans)
            if (aiGen && aiGen.isAIGenerated && aiGen.probability > 75) {
              aiGeneratedFlags.push({
                userId: sub.user_id,
                questionId: q.id,
                probability: aiGen.probability,
                reason: aiGen.reason,
              })
            }
          })())
        }
      }
    }
  }

  // For each question, find pairs with identical answers
  // Limit to avoid O(n²) on large exams
  const MAX_PAIRS_PER_QUESTION = 1000
  for (const q of questions) {
    const qAnswers = answerMap[q.id]
    const userIds = Object.keys(qAnswers)
    let pairsChecked = 0

    for (let i = 0; i < userIds.length; i++) {
      for (let j = i + 1; j < userIds.length; j++) {
        if (pairsChecked >= MAX_PAIRS_PER_QUESTION) break
        pairsChecked++

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
        } else if (ans1.length > 20 && ans2.length > 20) {
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
          } else if (similarity > 0.4) {
            // Moderate text overlap -> Use AI to check if it's semantically paraphrased
            aiPromises.push((async () => {
              const semCheck = await checkSemanticParaphrase(ans1, ans2, q.question || '')
              if (semCheck && semCheck.paraphrased && semCheck.confidence > 80) {
                suspiciousPairs.push({
                  userId1: userIds[i],
                  userId2: userIds[j],
                  questionId: q.id,
                  similarity,
                  bothCorrect: false,
                  aiSemanticMatch: true,
                  aiConfidence: semCheck.confidence
                })
              }
            })())
          }
        }
      }
      if (pairsChecked >= MAX_PAIRS_PER_QUESTION) break
    }
  }

  // Wait for all asynchronous AI checks to complete
  await Promise.allSettled(aiPromises)

  // Check against question bank - create index for O(1) lookups
  try {
    const questionBank = await db.collection('question_bank').find({}).toArray()
    if (questionBank.length > 0) {
      // Build map for O(1) lookup: question_id or question_text -> answer
      const bankMap = new Map<string, string>()
      for (const b of questionBank) {
        if (b.question_id) bankMap.set(b.question_id, String(b.answer || '').trim().toLowerCase())
        if (b.question_text) bankMap.set(b.question_text, String(b.answer || '').trim().toLowerCase())
      }

      for (const q of questions) {
        const bankAnswer = bankMap.get(q.id) || bankMap.get(q.question)
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

  // The weighted sum is already in 0-100 range (since ratios are 0-1 and weights sum to 100)
  const aiRatio = submissions.length > 0 ? aiGeneratedFlags.length / submissions.length : 0
  const score = Math.min(100, Math.round(
    (suspiciousRatio * 50) + (bankMatchRatio * 30) + (aiRatio * 20)
  ))

  return {
    suspiciousPairs,
    questionBankMatches,
    aiGeneratedFlags,
    score,
  }
}

/**
 * AI check: Determine if text is likely AI-generated.
 */
async function checkAIGeneration(text: string): Promise<{ isAIGenerated: boolean; probability: number; reason: string } | null> {
  const prompt = `Analyze the following answer and determine the probability it was generated by an AI (like ChatGPT, Claude, etc.).
Answer: "${text}"
Respond ONLY in JSON format: { "isAIGenerated": boolean, "probability": number (0-100), "reason": "brief explanation" }`
  try {
    const res = await backendComplete({ systemMessage: 'You are an AI detection system.', userMessage: prompt, modelRole: 'fast', responseFormat: 'json', feature: 'plagiarism_aigen' })
    if (res.ok && res.text) {
      const match = res.text.match(/\{[\s\S]*\}/)
      if (match) return JSON.parse(match[0])
    }
  } catch (e) { console.error('[CodeSpectra] checkAIGeneration failed:', e) }
  return null
}

/**
 * AI check: Determine if two texts are semantic paraphrases of each other.
 */
async function checkSemanticParaphrase(text1: string, text2: string, question: string): Promise<{ paraphrased: boolean; confidence: number } | null> {
  const prompt = `Analyze these two answers for the question: "${question}". Are they semantically identical or paraphrased from each other?
Answer 1: "${text1}"
Answer 2: "${text2}"
Respond ONLY in JSON format: { "paraphrased": boolean, "confidence": number (0-100) }`
  try {
    const res = await backendComplete({ systemMessage: 'You are a plagiarism detection system.', userMessage: prompt, modelRole: 'fast', responseFormat: 'json', feature: 'plagiarism_semantic' })
    if (res.ok && res.text) {
      const match = res.text.match(/\{[\s\S]*\}/)
      if (match) return JSON.parse(match[0])
    }
  } catch (e) { console.error('[CodeSpectra] checkSemanticParaphrase failed:', e) }
  return null
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
