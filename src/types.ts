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

export interface StudyStateV4 extends Omit<StudyStateV3, 'schemaVersion'> {
  schemaVersion: 4
  reviewedWordIds: number[]
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

export interface BackupV4 {
  format: 'kaoyan-vocab-backup'
  version: 4
  exportedAt: string
  corpusFingerprint: string
  state: StudyStateV4
}

export interface CollocationEntry {
  phrase: string
  meaning: string
  relevance: 'english-1' | 'postgraduate' | 'general'
  source?: 'redbook' | 'english-1'
  sourcePage?: number
}

export interface ExamPhraseEntry {
  phrase: string
  count: number
  years: number[]
  meaning: string
  usage?: string
  contexts: Array<{
    text: string
    year: number
    translation?: string
    translationSource?: 'official-answer' | 'curated' | 'local-machine'
    translationQuestion?: number
  }>
}

export interface ExamEvidence {
  count: number
  years: number[]
  phrases: ExamPhraseEntry[]
}

export interface RedbookExampleEntry {
  sentence: string
  meaning: string
  sourcePage: number
}

export interface RelatedWordEntry {
  relation: 'synonym' | 'antonym' | 'derivative'
  word: string
  meaning: string
  sourcePage: number
}

export interface RedbookSourceInfo {
  sourcePage: number
  hasCollocationSection: boolean
}

export interface WordDetailEntry {
  wordId: number
  coreMeaning?: string
  collocations: CollocationEntry[]
  examples?: RedbookExampleEntry[]
  relatedWords?: RelatedWordEntry[]
  redbook?: RedbookSourceInfo
  exam?: ExamEvidence
}
