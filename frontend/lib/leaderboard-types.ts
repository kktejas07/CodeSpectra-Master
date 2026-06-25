export type LeaderboardEntryDTO = {
  rank: number
  userId: string
  name: string
  title: string
  level: number
  xp: number
  language: string
  languageClass: string
  avatar: string
  lastSubmission: string | null
  streak: number
  challengesSolved: number
}
