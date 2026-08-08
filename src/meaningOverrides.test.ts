import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isValidMeaningOverrides,
  loadMeaningOverrides,
  normalizePersonalMeaning,
  removeMeaningOverride,
  saveMeaningOverrides,
  upsertMeaningOverride
} from './meaningOverrides'

describe('personal meaning overrides', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    })
  })

  it('normalizes, inserts, updates and removes one personal meaning', () => {
    expect(normalizePersonalMeaning('  n. 交通；往来  ')).toBe('n. 交通；往来')
    const first = upsertMeaningOverride([], 9, ' n. 交通；往来 ', new Date('2026-08-09T00:00:00Z'))
    expect(first).toEqual([{ wordId: 9, meaning: 'n. 交通；往来', updatedAt: '2026-08-09T00:00:00.000Z' }])
    const updated = upsertMeaningOverride(first, 9, 'n.交通；运输', new Date('2026-08-10T00:00:00Z'))
    expect(updated).toHaveLength(1)
    expect(updated[0].meaning).toBe('n.交通；运输')
    expect(removeMeaningOverride(updated, 9)).toEqual([])
  })

  it('persists only a matching, structurally valid corpus store', () => {
    const entries = upsertMeaningOverride([], 9, 'n.交通', new Date('2026-08-09T00:00:00Z'))
    saveMeaningOverrides('fingerprint', entries)
    expect(loadMeaningOverrides('fingerprint', [9, 10])).toEqual(entries)
    expect(loadMeaningOverrides('other', [9, 10])).toEqual([])
  })

  it('rejects duplicate, unknown, untrimmed and invalid entries', () => {
    const valid = { wordId: 9, meaning: 'n.交通', updatedAt: '2026-08-09T00:00:00.000Z' }
    expect(isValidMeaningOverrides([valid], new Set([9]))).toBe(true)
    expect(isValidMeaningOverrides([valid, valid], new Set([9]))).toBe(false)
    expect(isValidMeaningOverrides([{ ...valid, wordId: 10 }], new Set([9]))).toBe(false)
    expect(isValidMeaningOverrides([{ ...valid, meaning: ' n.交通' }], new Set([9]))).toBe(false)
    expect(isValidMeaningOverrides([{ ...valid, updatedAt: 'not-a-date' }], new Set([9]))).toBe(false)
  })
})
