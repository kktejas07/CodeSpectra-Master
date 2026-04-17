import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

// Schema for AI-generated follow-up questions
const FollowUpQuestionSchema = z.object({
  question: z.string().describe('The follow-up question based on the user\'s previous answer'),
  category: z.enum(['Technical', 'Behavioral', 'System Design', 'Clarification', 'Deep Dive']),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  reasoning: z.string().describe('Why this question was chosen based on the answer'),
  timeLimit: z.number().describe('Suggested time limit in seconds'),
})

const FeedbackSchema = z.object({
  dimension: z.string(),
  score: z.number().min(0).max(100),
  feedback: z.string(),
  suggestions: z.array(z.string()),
})

export type FollowUpQuestion = z.infer<typeof FollowUpQuestionSchema>
export type InterviewFeedback = z.infer<typeof FeedbackSchema>

interface ConversationContext {
  role: string
  interviewType: string
  previousQuestions: Array<{
    question: string
    category: string
  }>
  userResponses: Array<{
    question: string
    answer: string
    timeSpent: number
  }>
  resumeInfo?: string
  totalQuestionsAsked: number
}

/**
 * Generate a dynamic follow-up question based on user's previous response
 */
export async function generateFollowUpQuestion(
  userAnswer: string,
  context: ConversationContext
): Promise<FollowUpQuestion> {
  const prompt = `You are an AI interviewer conducting a ${context.interviewType} interview for a ${context.role} position.

The candidate has just answered the following question:
"${context.userResponses[context.userResponses.length - 1]?.question}"

Their answer was:
"${userAnswer}"

Previous questions asked:
${context.previousQuestions.map((q, i) => `${i + 1}. [${q.category}] ${q.question}`).join('\n')}

Context about the candidate:
${context.resumeInfo ? `Resume: ${context.resumeInfo}` : 'No resume provided'}

Based on the candidate's answer, generate a single follow-up question that:
1. Goes deeper into their answer or explores a related area
2. Is contextually relevant to what they just said
3. Matches the interview type (${context.interviewType})
4. Avoids repetition of previous questions
5. Progressively increases difficulty if they're answering well

Generate a follow-up question that will help assess their true capabilities.`

  const result = await generateObject({
    model: openai('gpt-4-turbo'),
    schema: FollowUpQuestionSchema,
    prompt,
  })

  return result.object
}

/**
 * Generate multiple follow-up question options
 */
export async function generateFollowUpOptions(
  userAnswer: string,
  context: ConversationContext,
  count: number = 3
): Promise<FollowUpQuestion[]> {
  const prompt = `You are an AI interviewer conducting a ${context.interviewType} interview for a ${context.role} position.

The candidate just answered:
"${context.userResponses[context.userResponses.length - 1]?.question}"

Their answer was:
"${userAnswer}"

Generate ${count} different follow-up questions based on this answer. Each question should:
1. Explore a different angle or depth of the topic
2. Be appropriate for the ${context.interviewType} interview type
3. Have different categories and difficulty levels
4. Be contextually relevant and natural

Return them in order from basic to advanced difficulty.`

  const questions: FollowUpQuestion[] = []

  for (let i = 0; i < count; i++) {
    try {
      const result = await generateObject({
        model: openai('gpt-4-turbo'),
        schema: FollowUpQuestionSchema,
        prompt: `${prompt}\n\nGenerate option ${i + 1}:`,
      })
      questions.push(result.object)
    } catch (error) {
      console.error(`Error generating option ${i + 1}:`, error)
    }
  }

  return questions
}

/**
 * Generate AI feedback on the user's entire interview performance
 */
export async function generateInterviewFeedback(
  context: ConversationContext,
  allResponses: Array<{
    question: string
    answer: string
    timeSpent: number
  }>
): Promise<InterviewFeedback[]> {
  const prompt = `You are an expert technical interviewer. Analyze the following interview transcript and provide detailed feedback across multiple dimensions.

Interview Role: ${context.role}
Interview Type: ${context.interviewType}
Total Questions: ${context.totalQuestionsAsked}

Transcript:
${allResponses.map((r, i) => `Q${i + 1}: ${r.question}\nA${i + 1}: ${r.answer}\nTime Spent: ${r.timeSpent}s\n`).join('\n')}

Provide feedback on these dimensions:
1. Technical Knowledge - How well did they demonstrate core competencies?
2. Communication - How clearly did they explain their thinking?
3. Problem Solving - Did they approach problems systematically?
4. Depth of Knowledge - Did they show deep understanding or surface-level knowledge?
5. Response Quality - How complete and accurate were the answers?
6. Time Management - Did they manage time effectively?

For each dimension, provide:
- A score from 0-100
- Specific feedback
- 2-3 actionable suggestions for improvement`

  const feedbackItems: InterviewFeedback[] = []
  const dimensions = [
    'Technical Knowledge',
    'Communication',
    'Problem Solving',
    'Depth of Knowledge',
    'Response Quality',
    'Time Management',
  ]

  for (const dimension of dimensions) {
    try {
      const result = await generateObject({
        model: openai('gpt-4-turbo'),
        schema: FeedbackSchema,
        prompt: `${prompt}\n\nProvide feedback specifically for the "${dimension}" dimension:`,
      })
      feedbackItems.push(result.object)
    } catch (error) {
      console.error(`Error generating feedback for ${dimension}:`, error)
    }
  }

  return feedbackItems
}

/**
 * Analyze answer quality and determine if follow-up is needed
 */
export async function analyzeAnswerQuality(
  question: string,
  answer: string
): Promise<{
  completeness: number
  relevance: number
  depth: number
  needsFollowUp: boolean
  suggestion: string
}> {
  const prompt = `Analyze this interview answer for quality:

Question: "${question}"
Answer: "${answer}"

Rate on these scales (0-100):
1. Completeness: How complete is the answer?
2. Relevance: How relevant is the answer to the question?
3. Depth: How deep/thorough is the analysis?

Also determine if a follow-up question would be valuable to probe deeper.`

  const schema = z.object({
    completeness: z.number().min(0).max(100),
    relevance: z.number().min(0).max(100),
    depth: z.number().min(0).max(100),
    needsFollowUp: z.boolean(),
    suggestion: z.string(),
  })

  const result = await generateObject({
    model: openai('gpt-4-turbo'),
    schema,
    prompt,
  })

  return result.object
}

/**
 * Generate initial opening question based on role and resume
 */
export async function generateOpeningQuestion(
  role: string,
  interviewType: string,
  resumeInfo?: string
): Promise<string> {
  const prompt = `You are an AI interviewer. Generate a warm, professional opening question for a ${interviewType} interview for a ${role} position.

${resumeInfo ? `The candidate's resume mentions: ${resumeInfo}` : ''}

The question should:
1. Be welcoming and set a positive tone
2. Be directly relevant to the role
3. Allow the candidate to provide context about themselves
4. Take about 45-60 seconds to answer

Return only the question, nothing else.`

  const schema = z.object({
    question: z.string(),
  })

  const result = await generateObject({
    model: openai('gpt-4-turbo'),
    schema,
    prompt,
  })

  return result.object.question
}
