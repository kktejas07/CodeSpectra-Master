/** Watch-position helpers. Seconds, not percent. */

export function resumeSeconds(saved: unknown, duration = 0): number {
  const t = Math.floor(Number(saved) || 0)
  if (t < 5) return 0
  if (duration > 0 && t >= duration * 0.95) return 0
  return t
}

export function shouldAutoComplete(position: number, duration: number): boolean {
  if (duration < 15) return false
  return position / duration >= 0.9
}

export function pickResumeLessonId(
  lessonIds: string[],
  currentLessonId: string | undefined,
  completed: Set<string>,
): string | undefined {
  if (currentLessonId && lessonIds.includes(currentLessonId)) return currentLessonId
  return lessonIds.find(id => !completed.has(id)) || lessonIds[0]
}
