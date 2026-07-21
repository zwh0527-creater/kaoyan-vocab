import { describe, expect, it } from 'vitest'
import { createInitialState } from './studyEngine'
import { createBackup, isValidStudyState, parseBackup } from './storage'
import type { BackupV1, BackupV3, StudyStateV1, StudyStateV3 } from './types'

const ids = Array.from({ length: 60 }, (_, index) => index)

describe('v4 backup validation', () => {
  it('round-trips a valid V4 backup', () => {
    const state = createInitialState(ids, 'fingerprint', '2026-07-12')
    const parsed = parseBackup(JSON.stringify(createBackup(state)), 'fingerprint', ids)
    expect(parsed).toEqual(state)
  })

  it('rejects another corpus without changing the caller state', () => {
    const state = createInitialState(ids, 'fingerprint', '2026-07-12')
    const backup = createBackup(state)
    backup.corpusFingerprint = 'other'
    expect(() => parseBackup(JSON.stringify(backup), 'fingerprint', ids)).toThrow('词表版本不同')
    expect(state.corpusFingerprint).toBe('fingerprint')
  })

  it('rejects malformed or duplicated progress', () => {
    const state = createInitialState(ids, 'fingerprint', '2026-07-12')
    expect(isValidStudyState({ ...state, dailyBatch: [999] }, 'fingerprint', new Set(ids))).toBe(false)
    expect(isValidStudyState({ ...state, currentQueue: [59, 59] }, 'fingerprint', new Set(ids))).toBe(false)
    expect(isValidStudyState({ ...state, pendingMasteredIds: [59] }, 'fingerprint', new Set(ids))).toBe(false)
    expect(isValidStudyState({ ...state, reviewedWordIds: [59] }, 'fingerprint', new Set(ids))).toBe(false)
  })

  it('imports V3 progress and converts the seen prefix into reviewed words', () => {
    const current = createInitialState(ids, 'fingerprint', '2026-07-12')
    const {
      reviewedWordIds: _reviewedWordIds,
      schemaVersion: _schemaVersion,
      ...legacyFields
    } = current
    const legacyState: StudyStateV3 = {
      ...legacyFields,
      schemaVersion: 3,
      groupSeenCount: 2,
      groupScrollIndex: 1
    }
    const backup: BackupV3 = {
      format: 'kaoyan-vocab-backup',
      version: 3,
      exportedAt: '2026-07-12T00:00:00.000Z',
      corpusFingerprint: 'fingerprint',
      state: legacyState
    }

    const migrated = parseBackup(JSON.stringify(backup), 'fingerprint', ids)
    expect(migrated.schemaVersion).toBe(4)
    expect(migrated.reviewedWordIds).toEqual([0, 1])
  })

  it('imports a valid V1 backup through the safe migration', () => {
    const v1State: StudyStateV1 = {
      schemaVersion: 1,
      corpusFingerprint: 'fingerprint',
      round: 1,
      currentQueue: ids.slice(40),
      nextRoundQueue: [1],
      sessionDate: '2026-07-12',
      dailyBatch: ids.slice(0, 40),
      seenCount: 20,
      unfamiliarIds: [1],
      scrollIndex: 19,
      completedToday: false,
      mastered: false,
      lastSummary: null
    }
    const backup: BackupV1 = {
      format: 'kaoyan-vocab-backup',
      version: 1,
      exportedAt: '2026-07-12T00:00:00.000Z',
      corpusFingerprint: 'fingerprint',
      state: v1State
    }

    const migrated = parseBackup(
      JSON.stringify(backup),
      'fingerprint',
      ids,
      new Date(2026, 6, 12, 8, 0)
    )

    expect(migrated.schemaVersion).toBe(4)
    expect(migrated.studyDayResetHour).toBe(12)
    expect(migrated.reviewedWordIds).toEqual([])
    expect(migrated.masteredIds).toEqual([])
    expect(migrated.nextRoundQueue).toEqual(ids.slice(0, 20))
    expect(new Set([
      ...migrated.currentQueue,
      ...migrated.dailyBatch,
      ...migrated.nextRoundQueue
    ])).toEqual(new Set(ids))
  })

  it('rejects invalid JSON before producing a replacement state', () => {
    expect(() => parseBackup('{broken', 'fingerprint', ids)).toThrow('备份文件格式不正确')
  })
})
