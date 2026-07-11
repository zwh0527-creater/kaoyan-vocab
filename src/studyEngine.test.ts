import { describe, expect, it } from 'vitest'
import type { StudyStateV1, StudyStateV2 } from './types'
import {
  completeGroup,
  createInitialState,
  currentGroupIds,
  dailyGroupCount,
  markGroupSeen,
  migrateV1ToV2,
  restoreMastered,
  rolloverToDate,
  roundRemaining,
  togglePendingMastered
} from './studyEngine'

const ids = Array.from({ length: 5493 }, (_, index) => index)

function finishCurrentGroup(state: StudyStateV2) {
  return completeGroup(markGroupSeen(state, currentGroupIds(state).length - 1))
}

describe('study engine v2', () => {
  it('creates fifteen groups of twenty for the first day', () => {
    const state = createInitialState(ids, 'fingerprint', '2026-07-12')
    expect(state.dailyBatch).toHaveLength(300)
    expect(state.currentQueue).toHaveLength(5193)
    expect(dailyGroupCount(state)).toBe(15)
    expect(currentGroupIds(state)).toEqual(ids.slice(0, 20))
    expect(roundRemaining(state)).toBe(5493)
  })

  it('toggles a pending mastered word before group completion', () => {
    let state = createInitialState(ids, 'fingerprint', '2026-07-12')
    state = togglePendingMastered(state, 12)
    expect(state.pendingMasteredIds).toEqual([12])
    state = togglePendingMastered(state, 12)
    expect(state.pendingMasteredIds).toEqual([])
  })

  it('sends every unmarked word to the next round', () => {
    let state = createInitialState(ids.slice(0, 20), 'fingerprint', '2026-07-12')
    for (const id of ids.slice(0, 15)) state = togglePendingMastered(state, id)
    state = finishCurrentGroup(state)
    expect(state.masteredIds).toEqual(ids.slice(0, 15))
    expect(state.nextRoundQueue).toEqual(ids.slice(15, 20))
    expect(state.completedToday).toBe(true)
    expect(state.allCompleted).toBe(false)
  })

  it('keeps 285 unmarked words waiting while tomorrow continues unseen round-one words', () => {
    let state = createInitialState(ids, 'fingerprint', '2026-07-12')
    for (let group = 0; group < 15; group += 1) {
      state = togglePendingMastered(state, group * 20)
      state = finishCurrentGroup(state)
    }
    expect(state.completedToday).toBe(true)
    expect(state.masteredIds).toHaveLength(15)
    expect(state.nextRoundQueue).toHaveLength(285)

    state = rolloverToDate(state, '2026-07-13')
    expect(state.round).toBe(1)
    expect(state.dailyBatch).toEqual(ids.slice(300, 600))
    expect(state.nextRoundQueue).toHaveLength(285)
  })

  it('settles complete groups and repeats only the partial group across days', () => {
    let state = createInitialState(ids, 'fingerprint', '2026-07-12')
    for (let group = 0; group < 6; group += 1) state = finishCurrentGroup(state)
    state = togglePendingMastered(state, 121)
    state = markGroupSeen(state, 12)

    state = rolloverToDate(state, '2026-07-13')

    expect(state.dailyBatch).toEqual(ids.slice(120, 420))
    expect(state.currentQueue[0]).toBe(420)
    expect(state.nextRoundQueue).toEqual(ids.slice(0, 120))
    expect(state.pendingMasteredIds).toEqual([121])
    expect(state.groupSeenCount).toBe(0)
    expect(state.groupScrollIndex).toBe(0)
  })

  it('does not mix a new round into a short final day', () => {
    let state = createInitialState(ids.slice(0, 301), 'fingerprint', '2026-07-12')
    for (let group = 0; group < 15; group += 1) state = finishCurrentGroup(state)

    state = rolloverToDate(state, '2026-07-13')
    expect(state.round).toBe(1)
    expect(state.dailyBatch).toEqual([300])

    state = finishCurrentGroup(state)
    expect(state.completedToday).toBe(true)
    expect(state.nextRoundQueue).toEqual(ids.slice(0, 301))
    expect(rolloverToDate(state, '2026-07-13')).toEqual(state)

    state = rolloverToDate(state, '2026-07-14')
    expect(state.round).toBe(2)
    expect(state.dailyBatch).toEqual(ids.slice(0, 300))
  })

  it('restores exactly one mastered word without changing the active batch', () => {
    const initial = createInitialState(ids, 'fingerprint', '2026-07-12')
    const before: StudyStateV2 = {
      ...initial,
      masteredIds: [1, 2, 3],
      currentQueue: initial.currentQueue.filter((id) => ![1, 2, 3].includes(id)),
      dailyBatch: initial.dailyBatch.filter((id) => ![1, 2, 3].includes(id)),
      allCompleted: true
    }
    const originalBatch = [...before.dailyBatch]

    const after = restoreMastered(before, 2, ids)

    expect(after.masteredIds).toEqual([1, 3])
    expect(after.nextRoundQueue).toEqual([2])
    expect(after.dailyBatch).toEqual(originalBatch)
    expect(after.allCompleted).toBe(false)
  })

  it('migrates V1 without inventing mastered words or losing vocabulary', () => {
    const v1: StudyStateV1 = {
      schemaVersion: 1,
      corpusFingerprint: 'fingerprint',
      round: 1,
      currentQueue: ids.slice(300),
      nextRoundQueue: [1],
      sessionDate: '2026-07-12',
      dailyBatch: ids.slice(0, 300),
      seenCount: 45,
      unfamiliarIds: [1],
      scrollIndex: 44,
      completedToday: false,
      mastered: false,
      lastSummary: null
    }

    const migrated = migrateV1ToV2(v1, ids, '2026-07-12')

    expect(migrated.masteredIds).toEqual([])
    expect(migrated.pendingMasteredIds).toEqual([])
    expect(migrated.nextRoundQueue).toEqual(ids.slice(0, 40))
    expect(migrated.dailyBatch).toEqual(ids.slice(40, 340))
    expect(migrated.currentQueue[0]).toBe(340)
    expect(new Set([
      ...migrated.currentQueue,
      ...migrated.dailyBatch,
      ...migrated.nextRoundQueue
    ])).toEqual(new Set(ids))
  })
})
