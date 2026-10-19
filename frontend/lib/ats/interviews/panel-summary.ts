/**
 * Short neutral summary of an interview panel's notes (ATS scorecards,
 * lib/ats/interviews). Uses the platform LLM through the backend; returns null
 * when no model is available or the call fails — callers treat it as optional.
 */
export async function summarizePanelNotes(input: {
  jobTitle: string
  notes: Array<{ interviewer: string; recommendation: string; notes: string }>
}): Promise<string | null> {
  const withNotes = input.notes.filter((n) => n.notes.trim())
  if (!withNotes.length) return null
  try {
    const { backendComplete } = await import('@/lib/ai/backend')
    const { platformModelOverrides } = await import('@/lib/interviews/ai-mock-engine')
    const res = await backendComplete({
      systemMessage:
        'You summarise interview panel feedback for a recruiter. Write 3-5 plain sentences: common strengths, concerns, and where interviewers disagree. Neutral tone. Do not invent facts, do not mention protected characteristics, no headings or lists.',
      userMessage: `Role: ${input.jobTitle}\n\n${withNotes
        .map((n, i) => `Interviewer ${i + 1} (${n.recommendation}): ${n.notes.slice(0, 2000)}`)
        .join('\n\n')}`,
      modelRole: 'fast',
      responseFormat: 'text',
      feature: 'ats-panel-summary',
      cache: false,
      ...(await platformModelOverrides()),
    })
    const text = (res.ok && (res.text || res.raw)) || ''
    return text.trim() ? text.trim().slice(0, 1500) : null
  } catch (e) {
    console.error('[interview-service] panel summary failed:', e)
    return null
  }
}
