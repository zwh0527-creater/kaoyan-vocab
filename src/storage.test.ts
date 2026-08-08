import { describe, expect, it } from 'vitest'
import { createInitialState } from './studyEngine'
import { createBackup, isValidStudyState, parseBackup, parseBackupBundle } from './storage'
import type { BackupV1, BackupV3, StudyStateV1, StudyStateV3 } from './types'

const ids = Array.from({ length: 60 }, (_, index) => index)

describe('v5 backup validation', () => {
  it('round-trips progress and personal meanings in a valid V5 backup', () => {
    const state = createInitialState(ids, 'fingerprint', '2026-07-12')
    const meaningOverrides = [{
      wordId: 9,
      meaning: 'n.交通；往来',
      updatedAt: '2026-08-09T00:00:00.000Z'
    }]
    const parsed = parseBackupBundle(
      JSON.stringify(createBackup(state, meaningOverrides)),
      'fingerprint',
      ids
    )
    expect(parsed).toEqual({ state, meaningOverrides })
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

  it('rejects damaged personal meanings before returning any replacement state', () => {
    const state = createInitialState(ids, 'fingerprint', '2026-07-12')
    const backup = createBackup(state, [{
      wordId: 9,
      meaning: 'n.交通',
      updatedAt: '2026-08-09T00:00:00.000Z'
    }])
    backup.meaningOverrides[0].wordId = 999
    expect(() => parseBackupBundle(JSON.stringify(backup), 'fingerprint', ids))
      .toThrow('个人释义已损坏')
  })

  it('imports a V4 backup without clearing existing personal meanings', () => {
    const state = createInitialState(ids, 'fingerprint', '2026-07-12')
    const v4Backup = {
      format: 'kaoyan-vocab-backup',
      version: 4,
      exportedAt: '2026-07-12T00:00:00.000Z',
      corpusFingerprint: 'fingerprint',
      state
    }
    expect(parseBackupBundle(JSON.stringify(v4Backup), 'fingerprint', ids))
      .toEqual({ state, meaningOverrides: null })
  })
})
