import type { StudyStateV1, StudySummary } from './types'

export const DAILY_LIMIT = 300

function takeFromQueue(queue: number[], count: number) {
  return {
    taken: queue.slice(0, count),
    remaining: queue.slice(count)
  }
}

function uniqueInOrder(ids: number[]) {
  return [...new Set(ids)]
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function createInitialState(
  allWordIds: number[],
  corpusFingerprint: string,
  sessionDate = localDateKey()
): StudyStateV1 {
  const { taken, remaining } = takeFromQueue(allWordIds, DAILY_LIMIT)
  return {
    schemaVersion: 1,
    corpusFingerprint,
    round: 1,
    currentQueue: remaining,
    nextRoundQueue: [],
    sessionDate,
    dailyBatch: taken,
    seenCount: 0,
    unfamiliarIds: [],
    scrollIndex: 0,
    completedToday: false,
    mastered: false,
    lastSummary: null
  }
}

export function markSeen(state: StudyStateV1, index: number): StudyStateV1 {
  if (index < 0 || index >= state.dailyBatch.length || state.completedToday) return state
  const seenCount = Math.max(state.seenCount, index + 1)
  if (seenCount === state.seenCount && index === state.scrollIndex) return state
  return { ...state, seenCount, scrollIndex: index }
}

export function toggleUnfamiliar(state: StudyStateV1, wordId: number): StudyStateV1 {
  if (!state.dailyBatch.includes(wordId) || state.completedToday) return state
  const unfamiliar = new Set(state.unfamiliarIds)
  if (unfamiliar.has(wordId)) unfamiliar.delete(wordId)
  else unfamiliar.add(wordId)
  return { ...state, unfamiliarIds: state.dailyBatch.filter((id) => unfamiliar.has(id)) }
}

function settleSeen(state: StudyStateV1) {
  const reviewed = state.dailyBatch.slice(0, state.seenCount)
  const carry = state.dailyBatch.slice(state.seenCount)
  const unfamiliar = new Set(state.unfamiliarIds)
  const reviewedUnfamiliar = reviewed.filter((id) => unfamiliar.has(id))
  const carryUnfamiliar = carry.filter((id) => unfamiliar.has(id))
  return {
    reviewed,
    carry,
    carryUnfamiliar,
    nextRoundQueue: uniqueInOrder([...state.nextRoundQueue, ...reviewedUnfamiliar])
  }
}

export function completeToday(state: StudyStateV1): StudyStateV1 {
  if (state.completedToday || state.dailyBatch.length === 0 || state.seenCount < state.dailyBatch.length) {
    return state
  }
  const settled = settleSeen(state)
  const roundCompleted = state.currentQueue.length === 0
  const mastered = roundCompleted && settled.nextRoundQueue.length === 0
  const summary: StudySummary = {
    reviewed: settled.reviewed.length,
    unfamiliar: settled.nextRoundQueue.length - state.nextRoundQueue.length,
    roundRemaining: state.currentQueue.length,
    roundCompleted
  }
  return {
    ...state,
    nextRoundQueue: settled.nextRoundQueue,
    dailyBatch: [],
    seenCount: 0,
    unfamiliarIds: [],
    scrollIndex: 0,
    completedToday: true,
    mastered,
    lastSummary: summary
  }
}

function beginNextRoundIfNeeded(state: StudyStateV1): StudyStateV1 {
  if (state.dailyBatch.length > 0 || state.currentQueue.length > 0 || state.mastered) return state
  if (state.nextRoundQueue.length === 0) return { ...state, mastered: true }
  return {
    ...state,
    round: state.round + 1,
    currentQueue: state.nextRoundQueue,
    nextRoundQueue: []
  }
}

export function rolloverToDate(state: StudyStateV1, newDate = localDateKey()): StudyStateV1 {
  if (state.sessionDate === newDate) return state

  let next = state
  let carry: number[] = []
  let carryUnfamiliar: number[] = []

  if (!state.completedToday && state.dailyBatch.length > 0) {
    const settled = settleSeen(state)
    carry = settled.carry
    carryUnfamiliar = settled.carryUnfamiliar
    next = {
      ...state,
      nextRoundQueue: settled.nextRoundQueue,
      dailyBatch: carry,
      unfamiliarIds: carryUnfamiliar,
      seenCount: 0,
      scrollIndex: 0
    }
  } else {
    next = { ...state, dailyBatch: [], unfamiliarIds: [], seenCount: 0, scrollIndex: 0 }
  }

  next = beginNextRoundIfNeeded(next)
  if (next.mastered) {
    return { ...next, sessionDate: newDate, completedToday: false, lastSummary: null }
  }

  const needed = Math.max(0, DAILY_LIMIT - carry.length)
  const { taken, remaining } = takeFromQueue(next.currentQueue, needed)
  return {
    ...next,
    currentQueue: remaining,
    sessionDate: newDate,
    dailyBatch: [...carry, ...taken],
    seenCount: 0,
    unfamiliarIds: carryUnfamiliar,
    scrollIndex: 0,
    completedToday: false,
    lastSummary: null
  }
}

export function roundRemaining(state: StudyStateV1) {
  return state.currentQueue.length + Math.max(0, state.dailyBatch.length - state.seenCount)
}
