import {
  DAILY_LIMIT,
  GROUP_SIZE,
  migrateV1ToV2,
  migrateV2ToV3,
  migrateV3ToV4
} from './studyEngine'
import type {
  BackupV1,
  BackupV2,
  BackupV3,
  BackupV4,
  StudyStateV1,
  StudyStateV2,
  StudyStateV3,
  StudyStateV4,
  StudySummaryV2
} from './types'

const STORAGE_KEY_V4 = 'kaoyan-vocab.study.v4'
const STORAGE_KEY_V3 = 'kaoyan-vocab.study.v3'
const STORAGE_KEY_V2 = 'kaoyan-vocab.study.v2'
const STORAGE_KEY_V1 = 'kaoyan-vocab.study.v1'

function isIntegerArray(value: unknown, validIds: Set<number>): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((item) => Number.isInteger(item) && validIds.has(item as number)) &&
    new Set(value).size === value.length
  )
}

function arraysAreDisjoint(arrays: number[][]) {
  const all = arrays.flat()
  return new Set(all).size === all.length
}

function isValidSummary(value: unknown): value is StudySummaryV2 {
  if (!value || typeof value !== 'object') return false
  const summary = value as Partial<StudySummaryV2>
  return (
    Number.isInteger(summary.reviewed) && (summary.reviewed ?? -1) >= 0 &&
    Number.isInteger(summary.groups) && (summary.groups ?? -1) >= 0 &&
    Number.isInteger(summary.mastered) && (summary.mastered ?? -1) >= 0 &&
    Number.isInteger(summary.roundRemaining) && (summary.roundRemaining ?? -1) >= 0 &&
    typeof summary.roundCompleted === 'boolean'
  )
}

function hasValidStudyStatePayload(
  value: unknown,
  corpusFingerprint: string,
  validIds: Set<number>
): value is StudyStateV2 | StudyStateV3 | StudyStateV4 {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<StudyStateV2 | StudyStateV3 | StudyStateV4>
  if (state.corpusFingerprint !== corpusFingerprint) return false
  if (!Number.isInteger(state.round) || (state.round ?? 0) < 1) return false
  if (typeof state.sessionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(state.sessionDate)) return false
  if (typeof state.completedToday !== 'boolean' || typeof state.allCompleted !== 'boolean') return false
  if (!Number.isInteger(state.completedGroups) || (state.completedGroups ?? -1) < 0) return false
  if (!Number.isInteger(state.groupSeenCount) || !Number.isInteger(state.groupScrollIndex)) return false
  if (!isIntegerArray(state.currentQueue, validIds)) return false
  if (!isIntegerArray(state.nextRoundQueue, validIds)) return false
  if (!isIntegerArray(state.dailyBatch, validIds) || state.dailyBatch.length > DAILY_LIMIT) return false
  if (!isIntegerArray(state.pendingMasteredIds, validIds)) return false
  if (!isIntegerArray(state.masteredIds, validIds)) return false

  const groupCount = Math.ceil(state.dailyBatch.length / GROUP_SIZE)
  if ((state.completedGroups ?? 0) > groupCount) return false
  const completedWords = Math.min(state.dailyBatch.length, (state.completedGroups ?? 0) * GROUP_SIZE)
  const completedPrefix = state.dailyBatch.slice(0, completedWords)
  const remainingDaily = state.dailyBatch.slice(completedWords)
  const currentGroup = remainingDaily.slice(0, GROUP_SIZE)
  if ((state.groupSeenCount ?? -1) < 0 || (state.groupSeenCount ?? 0) > currentGroup.length) return false
  if ((state.groupScrollIndex ?? -1) < 0) return false
  if (currentGroup.length > 0 && (state.groupScrollIndex ?? 0) >= currentGroup.length) return false
  if (currentGroup.length === 0 && (state.groupScrollIndex ?? 0) !== 0) return false
  if (!state.pendingMasteredIds.every((id) => currentGroup.includes(id))) return false

  if (!arraysAreDisjoint([
    state.currentQueue,
    remainingDaily,
    state.nextRoundQueue,
    state.masteredIds
  ])) return false

  const settledIds = new Set([...state.nextRoundQueue, ...state.masteredIds])
  if (!completedPrefix.every((id) => settledIds.has(id))) return false
  if (state.completedToday && (
    state.dailyBatch.length > 0 ||
    state.completedGroups !== 0 ||
    state.groupSeenCount !== 0 ||
    state.pendingMasteredIds.length > 0
  )) return false
  if (state.allCompleted && (
    state.currentQueue.length > 0 ||
    state.dailyBatch.length > 0 ||
    state.nextRoundQueue.length > 0
  )) return false
  if (state.lastSummary !== null && !isValidSummary(state.lastSummary)) return false
  return true
}

function isValidStudyStateV2(
  value: unknown,
  corpusFingerprint: string,
  validIds: Set<number>
): value is StudyStateV2 {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as Partial<StudyStateV2>).schemaVersion === 2 &&
    hasValidStudyStatePayload(value, corpusFingerprint, validIds)
  )
}

function isValidStudyStateV3(
  value: unknown,
  corpusFingerprint: string,
  validIds: Set<number>
): value is StudyStateV3 {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as Partial<StudyStateV3>).schemaVersion === 3 &&
    (value as Partial<StudyStateV3>).studyDayResetHour === 12 &&
    hasValidStudyStatePayload(value, corpusFingerprint, validIds)
  )
}

export function isValidStudyState(
  value: unknown,
  corpusFingerprint: string,
  validIds: Set<number>
): value is StudyStateV4 {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<StudyStateV4>
  if (
    state.schemaVersion !== 4 ||
    state.studyDayResetHour !== 12 ||
    !hasValidStudyStatePayload(value, corpusFingerprint, validIds) ||
    !isIntegerArray(state.reviewedWordIds, validIds)
  ) return false

  const validatedState = value as StudyStateV4
  const completedWords = Math.min(
    validatedState.dailyBatch.length,
    validatedState.completedGroups * GROUP_SIZE
  )
  const currentGroup = validatedState.dailyBatch.slice(completedWords, completedWords + GROUP_SIZE)
  return (
    validatedState.reviewedWordIds.length === validatedState.groupSeenCount &&
    validatedState.reviewedWordIds.every((id) => currentGroup.includes(id))
  )
}

function isValidStudyStateV1(
  value: unknown,
  corpusFingerprint: string,
  validIds: Set<number>
): value is StudyStateV1 {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<StudyStateV1>
  if (state.schemaVersion !== 1 || state.corpusFingerprint !== corpusFingerprint) return false
  if (!Number.isInteger(state.round) || (state.round ?? 0) < 1) return false
  if (typeof state.sessionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(state.sessionDate)) return false
  if (typeof state.completedToday !== 'boolean' || typeof state.mastered !== 'boolean') return false
  if (!Number.isInteger(state.seenCount) || !Number.isInteger(state.scrollIndex)) return false
  if (!isIntegerArray(state.currentQueue, validIds)) return false
  if (!isIntegerArray(state.nextRoundQueue, validIds)) return false
  if (!isIntegerArray(state.dailyBatch, validIds) || state.dailyBatch.length > DAILY_LIMIT) return false
  if (!isIntegerArray(state.unfamiliarIds, validIds)) return false
  if ((state.seenCount ?? -1) < 0 || (state.seenCount ?? 0) > state.dailyBatch.length) return false
  if ((state.scrollIndex ?? -1) < 0 || (state.dailyBatch.length > 0 && (state.scrollIndex ?? -1) >= state.dailyBatch.length)) {
    return false
  }
  const batchIds = new Set(state.dailyBatch)
  if (!state.unfamiliarIds.every((id) => batchIds.has(id))) return false
  if (state.completedToday && state.dailyBatch.length > 0) return false
  return state.lastSummary === null || typeof state.lastSummary === 'object'
}

export function loadStudyState(
  corpusFingerprint: string,
  allWordIds: number[],
  now = new Date()
) {
  const validIds = new Set(allWordIds)
  try {
    const rawV4 = localStorage.getItem(STORAGE_KEY_V4)
    if (rawV4) {
      const parsed: unknown = JSON.parse(rawV4)
      if (isValidStudyState(parsed, corpusFingerprint, validIds)) return parsed
    }

    const rawV3 = localStorage.getItem(STORAGE_KEY_V3)
    if (rawV3) {
      const parsed: unknown = JSON.parse(rawV3)
      if (isValidStudyStateV3(parsed, corpusFingerprint, validIds)) {
        const migrated = migrateV3ToV4(parsed)
        if (!isValidStudyState(migrated, corpusFingerprint, validIds)) return null
        saveStudyState(migrated)
        return migrated
      }
    }

    const rawV2 = localStorage.getItem(STORAGE_KEY_V2)
    if (rawV2) {
      const parsed: unknown = JSON.parse(rawV2)
      if (isValidStudyStateV2(parsed, corpusFingerprint, validIds)) {
        const migrated = migrateV3ToV4(migrateV2ToV3(parsed, now))
        if (!isValidStudyState(migrated, corpusFingerprint, validIds)) return null
        saveStudyState(migrated)
        return migrated
      }
    }

    const rawV1 = localStorage.getItem(STORAGE_KEY_V1)
    if (!rawV1) return null
    const parsedV1: unknown = JSON.parse(rawV1)
    if (!isValidStudyStateV1(parsedV1, corpusFingerprint, validIds)) return null
    const migratedV2 = migrateV1ToV2(parsedV1, allWordIds, parsedV1.sessionDate)
    const migrated = migrateV3ToV4(migrateV2ToV3(migratedV2, now))
    if (!isValidStudyState(migrated, corpusFingerprint, validIds)) return null
    saveStudyState(migrated)
    return migrated
  } catch {
    return null
  }
}

export function saveStudyState(state: StudyStateV4) {
  localStorage.setItem(STORAGE_KEY_V4, JSON.stringify(state))
}

export function createBackup(state: StudyStateV4): BackupV4 {
  return {
    format: 'kaoyan-vocab-backup',
    version: 4,
    exportedAt: new Date().toISOString(),
    corpusFingerprint: state.corpusFingerprint,
    state
  }
}

export function downloadBackup(state: StudyStateV4) {
  const backup = createBackup(state)
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `考研单词备份-${state.sessionDate}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function parseBackup(
  raw: string,
  corpusFingerprint: string,
  allWordIds: number[],
  now = new Date()
): StudyStateV4 {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('备份文件格式不正确')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('备份文件格式不正确')
  const backup = parsed as Partial<BackupV1 | BackupV2 | BackupV3 | BackupV4>
  if (
    backup.format !== 'kaoyan-vocab-backup' ||
    (backup.version !== 1 && backup.version !== 2 && backup.version !== 3 && backup.version !== 4)
  ) {
    throw new Error('这不是“考研单词”的有效备份')
  }
  if (backup.corpusFingerprint !== corpusFingerprint) throw new Error('备份使用的词表版本不同')

  const validIds = new Set(allWordIds)
  if (backup.version === 4) {
    if (!isValidStudyState(backup.state, corpusFingerprint, validIds)) throw new Error('备份内容已损坏')
    return backup.state
  }

  if (backup.version === 3) {
    if (!isValidStudyStateV3(backup.state, corpusFingerprint, validIds)) throw new Error('备份内容已损坏')
    return migrateV3ToV4(backup.state)
  }

  if (backup.version === 2) {
    if (!isValidStudyStateV2(backup.state, corpusFingerprint, validIds)) throw new Error('备份内容已损坏')
    return migrateV3ToV4(migrateV2ToV3(backup.state, now))
  }

  if (!isValidStudyStateV1(backup.state, corpusFingerprint, validIds)) throw new Error('备份内容已损坏')
  const migratedV2 = migrateV1ToV2(backup.state, allWordIds, backup.state.sessionDate)
  const migrated = migrateV3ToV4(migrateV2ToV3(migratedV2, now))
  if (!isValidStudyState(migrated, corpusFingerprint, validIds)) throw new Error('备份内容已损坏')
  return migrated
}
