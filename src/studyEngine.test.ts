import { describe, expect, it } from 'vitest'
import {
  completeToday,
  createInitialState,
  markSeen,
  rolloverToDate,
  toggleUnfamiliar
} from './studyEngine'

const ids = Array.from({ length: 5493 }, (_, index) => index)

describe('study engine', () => {
  it('creates the first 300-word batch', () => {
    const state = createInitialState(ids, 'fingerprint', '2026-07-11')
    expect(state.dailyBatch).toHaveLength(300)
    expect(state.currentQueue).toHaveLength(5193)
    expect(state.dailyBatch[0]).toBe(0)
    expect(state.dailyBatch[299]).toBe(299)
  })

  it('keeps 180 unfinished words and tops up 120 on the next day', () => {
    let state = createInitialState(ids, 'fingerprint', '2026-07-11')
    state = markSeen(state, 119)
    state = rolloverToDate(state, '2026-07-12')
    expect(state.dailyBatch).toHaveLength(300)
    expect(state.dailyBatch.slice(0, 180)).toEqual(ids.slice(120, 300))
    expect(state.dailyBatch.slice(180)).toEqual(ids.slice(300, 420))
    expect(state.currentQueue[0]).toBe(420)
  })

  it('allows an unfamiliar mark to be toggled off', () => {
    let state = createInitialState(ids, 'fingerprint', '2026-07-11')
    state = toggleUnfamiliar(state, 12)
    expect(state.unfamiliarIds).toEqual([12])
    state = toggleUnfamiliar(state, 12)
    expect(state.unfamiliarIds).toEqual([])
  })

  it('moves only unfamiliar words into the next round', () => {
    let state = createInitialState(ids.slice(0, 3), 'fingerprint', '2026-07-11')
    state = toggleUnfamiliar(state, 1)
    state = markSeen(state, 2)
    state = completeToday(state)
    expect(state.nextRoundQueue).toEqual([1])
    state = rolloverToDate(state, '2026-07-12')
    expect(state.round).toBe(2)
    expect(state.dailyBatch).toEqual([1])
  })

  it('does not mix the next round into a short final batch', () => {
    let state = createInitialState(ids.slice(0, 301), 'fingerprint', '2026-07-11')
    state = toggleUnfamiliar(state, 1)
    state = markSeen(state, 299)
    state = completeToday(state)
    state = rolloverToDate(state, '2026-07-12')
    expect(state.round).toBe(1)
    expect(state.dailyBatch).toEqual([300])
  })

  it('marks the corpus mastered when a round ends without unfamiliar words', () => {
    let state = createInitialState(ids.slice(0, 2), 'fingerprint', '2026-07-11')
    state = markSeen(state, 1)
    state = completeToday(state)
    expect(state.mastered).toBe(true)
  })
})
