import { DAILY_LIMIT } from './studyEngine'
import type { BackupV1, StudyStateV1 } from './types'

const STORAGE_KEY = 'kaoyan-vocab.study.v1'

function isIntegerArray(value: unknown, validIds: Set<number>): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((item) => Number.isInteger(item) && validIds.has(item as number)) &&
    new Set(value).size === value.length
  )
}

export function isValidStudyState(
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

export function loadStudyState(corpusFingerprint: string, validIds: Set<number>) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isValidStudyState(parsed, corpusFingerprint, validIds) ? parsed : null
  } catch {
    return null
  }
}

export function saveStudyState(state: StudyStateV1) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function createBackup(state: StudyStateV1): BackupV1 {
  return {
    format: 'kaoyan-vocab-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    corpusFingerprint: state.corpusFingerprint,
    state
  }
}

export function downloadBackup(state: StudyStateV1) {
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
  validIds: Set<number>
): StudyStateV1 {
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object') throw new Error('备份文件格式不正确')
  const backup = parsed as Partial<BackupV1>
  if (backup.format !== 'kaoyan-vocab-backup' || backup.version !== 1) {
    throw new Error('这不是“考研单词”的有效备份')
  }
  if (backup.corpusFingerprint !== corpusFingerprint) throw new Error('备份使用的词表版本不同')
  if (!isValidStudyState(backup.state, corpusFingerprint, validIds)) throw new Error('备份内容已损坏')
  return backup.state
}
