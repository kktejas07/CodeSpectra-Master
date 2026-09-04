/**
 * Remove embedded quiz blocks from lesson markdown / slide text.
 * Interactive module quizzes live outside the lesson body.
 */
export function stripEmbeddedQuizzes(md: string): string {
  if (!md) return md
  let out = md
  // ## Quiz / ### Quiz 1 / # Practice Quiz / ## Knowledge Check / ## Self-check / ## Quick Check
  out = out.replace(
    /^#{1,6}\s*(?:practice\s+|quick\s+)?(?:quiz|knowledge\s*check|self[-\s]?check|check\s*your\s*understanding|test\s*yourself|review\s*questions|practice\s*questions)\b[\s\S]*?(?=^#{1,6}\s|\Z)/gim,
    '',
  )
  // **Quiz 1** / **Quiz:** style blocks until next heading
  out = out.replace(
    /^\*{0,2}(?:quiz|knowledge\s*check|practice\s*questions?)\s*\d*\*{0,2}\s*:?\s*$[\s\S]*?(?=^#{1,6}\s|^\*{0,2}(?:quiz|knowledge\s*check)\s*\d*\*{0,2}\s*:?\s*$|\Z)/gim,
    '',
  )
  // "Quiz 1:" / "Q1:" dump paragraphs
  out = out.replace(
    /(?:^|\n)(?:quiz\s*\d+|q\d+)\s*[:.)]\s*[^\n]*(?:\n(?!#{1,6}\s|\n)[^\n]*)*/gi,
    '\n',
  )
  // Answer key lines often left after stripping
  out = out.replace(
    /(?:^|\n)\s*(?:correct\s*answer|answer\s*key|answers?\s*:)\s*[^\n]*(?:\n(?!#{1,6}\s|\n)[^\n]*)*/gi,
    '\n',
  )
  return out.replace(/\n{3,}/g, '\n\n').trim()
}

/** Drop quiz-titled slides before rendering script as text. */
export function stripQuizSlides<T extends { title?: string; spokenText?: string; content?: unknown }>(
  slides: T[],
): T[] {
  return slides.filter((s) => {
    const title = String(s.title || '')
    return !/^(?:practice\s+|quick\s+)?(?:quiz|knowledge\s*check|self[-\s]?check|review\s*questions)\b/i.test(title.trim())
  })
}
