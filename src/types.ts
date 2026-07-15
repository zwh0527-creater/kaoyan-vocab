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

export interface StudySummaryV2 {
  reviewed: number
  groups: number
  mastered: number
  roundRemaining: number
  roundCompleted: boolean
}

export interface StudyStateV2 {
  schemaVersion: 2
  corpusFingerprint: string
  round: number
  currentQueue: number[]
  nextRoundQueue: number[]
  sessionDate: string
  dailyBatch: number[]
  completedGroups: number
  groupSeenCount: number
  groupScrollIndex: number
  pendingMasteredIds: number[]
  masteredIds: number[]
  completedToday: boolean
  allCompleted: boolean
  lastSummary: StudySummaryV2 | null
}

export interface StudyStateV3 extends Omit<StudyStateV2, 'schemaVersion'> {
  schemaVersion: 3
  studyDayResetHour: 12
}

export interface BackupV2 {
  format: 'kaoyan-vocab-backup'
  version: 2
  exportedAt: string
  corpusFingerprint: string
  state: StudyStateV2
}

export interface BackupV3 {
  format: 'kaoyan-vocab-backup'
  version: 3
  exportedAt: string
  corpusFingerprint: string
  state: StudyStateV3
}

export interface CollocationEntry {
  phrase: string
  meaning: string
  relevance: 'english-1' | 'postgraduate' | 'general'
}

export interface WordDetailEntry {
  wordId: number
  collocations: CollocationEntry[]
}
