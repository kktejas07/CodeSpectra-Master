export type LeaderboardEntryDTO = {
  rank: number
  userId: string
  name: string
  title: string
  level: number
  xp: number
  avatar: string
  /** ISO time of the user's latest XP-earning activity in this view. */
  lastActivity: string | null
  /** Problems solved (first accepted submission) in this view. */
  challengesSolved: number
}
