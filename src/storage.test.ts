import { describe, expect, it } from 'vitest'
import { createInitialState } from './studyEngine'
import { createBackup, isValidStudyState, parseBackup } from './storage'

const ids = [0, 1, 2]
const validIds = new Set(ids)

describe('backup validation', () => {
  it('round-trips a valid backup', () => {
    const state = createInitialState(ids, 'fingerprint', '2026-07-11')
    const parsed = parseBackup(JSON.stringify(createBackup(state)), 'fingerprint', validIds)
    expect(parsed).toEqual(state)
  })

  it('rejects another corpus without changing the caller state', () => {
    const state = createInitialState(ids, 'fingerprint', '2026-07-11')
    const backup = createBackup(state)
    backup.corpusFingerprint = 'other'
    expect(() => parseBackup(JSON.stringify(backup), 'fingerprint', validIds)).toThrow('词表版本不同')
    expect(state.corpusFingerprint).toBe('fingerprint')
  })

  it('rejects malformed progress', () => {
    const state = createInitialState(ids, 'fingerprint', '2026-07-11')
    const malformed = { ...state, dailyBatch: [999] }
    expect(isValidStudyState(malformed, 'fingerprint', validIds)).toBe(false)
  })
})
