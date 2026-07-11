export interface WordEntry {
  id: number
  word: string
  phonetic: string
  meaning: string
  sourcePage: number
  originalOrder: number
}

export interface StudySummary {
  reviewed: number
  unfamiliar: number
  roundRemaining: number
  roundCompleted: boolean
}

export interface StudyStateV1 {
  schemaVersion: 1
  corpusFingerprint: string
  round: number
  currentQueue: number[]
  nextRoundQueue: number[]
  sessionDate: string
  dailyBatch: number[]
  seenCount: number
  unfamiliarIds: number[]
  scrollIndex: number
  completedToday: boolean
  mastered: boolean
  lastSummary: StudySummary | null
}

export interface BackupV1 {
  format: 'kaoyan-vocab-backup'
  version: 1
  exportedAt: string
  corpusFingerprint: string
  state: StudyStateV1
}
