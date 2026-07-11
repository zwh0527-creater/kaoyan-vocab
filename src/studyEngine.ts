import type { StudyStateV1, StudyStateV2, StudySummaryV2 } from './types'

export const DAILY_LIMIT = 300
export const GROUP_SIZE = 20

function takeFromQueue(queue: number[], count: number) {
  return {
    taken: queue.slice(0, count),
    remaining: queue.slice(count)
  }
}

function uniqueInOrder(ids: number[]) {
  return [...new Set(ids)]
}

function inCorpusOrder(ids: number[], allWordIds: number[]) {
  const included = new Set(ids)
  return allWordIds.filter((id) => included.has(id))
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
): StudyStateV2 {
  const { taken, remaining } = takeFromQueue(allWordIds, DAILY_LIMIT)
  return {
    schemaVersion: 2,
    corpusFingerprint,
    round: 1,
    currentQueue: remaining,
    nextRoundQueue: [],
    sessionDate,
    dailyBatch: taken,
    completedGroups: 0,
    groupSeenCount: 0,
    groupScrollIndex: 0,
    pendingMasteredIds: [],
    masteredIds: [],
    completedToday: false,
    allCompleted: allWordIds.length === 0,
    lastSummary: null
  }
}

export function dailyGroupCount(state: StudyStateV2) {
  return Math.ceil(state.dailyBatch.length / GROUP_SIZE)
}

export function currentGroupIds(state: StudyStateV2) {
  const start = state.completedGroups * GROUP_SIZE
  return state.dailyBatch.slice(start, start + GROUP_SIZE)
}

export function markGroupSeen(state: StudyStateV2, index: number): StudyStateV2 {
  const group = currentGroupIds(state)
  if (state.completedToday || index < 0 || index >= group.length) return state
  const groupSeenCount = Math.max(state.groupSeenCount, index + 1)
  if (groupSeenCount === state.groupSeenCount && index === state.groupScrollIndex) return state
  return { ...state, groupSeenCount, groupScrollIndex: index }
}

export function togglePendingMastered(state: StudyStateV2, wordId: number): StudyStateV2 {
  const group = currentGroupIds(state)
  if (state.completedToday || !group.includes(wordId)) return state
  const pending = new Set(state.pendingMasteredIds)
  if (pending.has(wordId)) pending.delete(wordId)
  else pending.add(wordId)
  return {
    ...state,
    pendingMasteredIds: group.filter((id) => pending.has(id))
  }
}

export function completeGroup(state: StudyStateV2): StudyStateV2 {
  const group = currentGroupIds(state)
  if (state.completedToday || group.length === 0 || state.groupSeenCount < group.length) return state

  const pending = new Set(state.pendingMasteredIds)
  const newlyMastered = group.filter((id) => pending.has(id))
  const needsNextRound = group.filter((id) => !pending.has(id))
  const masteredIds = uniqueInOrder([...state.masteredIds, ...newlyMastered])
  const nextRoundQueue = uniqueInOrder([...state.nextRoundQueue, ...needsNextRound])
  const completedGroups = state.completedGroups + 1
  const groupCount = dailyGroupCount(state)

  if (completedGroups < groupCount) {
    return {
      ...state,
      nextRoundQueue,
      completedGroups,
      groupSeenCount: 0,
      groupScrollIndex: 0,
      pendingMasteredIds: [],
      masteredIds
    }
  }

  const roundCompleted = state.currentQueue.length === 0
  const masteredToday = state.dailyBatch.filter((id) => masteredIds.includes(id)).length
  const summary: StudySummaryV2 = {
    reviewed: state.dailyBatch.length,
    groups: groupCount,
    mastered: masteredToday,
    roundRemaining: state.currentQueue.length,
    roundCompleted
  }

  return {
    ...state,
    nextRoundQueue,
    dailyBatch: [],
    completedGroups: 0,
    groupSeenCount: 0,
    groupScrollIndex: 0,
    pendingMasteredIds: [],
    masteredIds,
    completedToday: true,
    allCompleted: roundCompleted && nextRoundQueue.length === 0,
    lastSummary: summary
  }
}

function beginNextRoundIfNeeded(state: StudyStateV2): StudyStateV2 {
  if (state.currentQueue.length > 0) return state
  if (state.nextRoundQueue.length === 0) return { ...state, allCompleted: true }
  return {
    ...state,
    round: state.round + 1,
    currentQueue: state.nextRoundQueue,
    nextRoundQueue: [],
    allCompleted: false
  }
}

export function rolloverToDate(state: StudyStateV2, newDate = localDateKey()): StudyStateV2 {
  if (state.sessionDate === newDate) return state

  if (state.completedToday) {
    const next = beginNextRoundIfNeeded({
      ...state,
      dailyBatch: [],
      completedGroups: 0,
      groupSeenCount: 0,
      groupScrollIndex: 0,
      pendingMasteredIds: [],
      completedToday: false,
      lastSummary: null
    })

    if (next.allCompleted) return { ...next, sessionDate: newDate }
    const { taken, remaining } = takeFromQueue(next.currentQueue, DAILY_LIMIT)
    return {
      ...next,
      currentQueue: remaining,
      sessionDate: newDate,
      dailyBatch: taken
    }
  }

  const completedWords = state.completedGroups * GROUP_SIZE
  const carry = state.dailyBatch.slice(completedWords)
  const carrySet = new Set(carry)
  const pendingMasteredIds = state.pendingMasteredIds.filter((id) => carrySet.has(id))
  const needed = Math.max(0, DAILY_LIMIT - carry.length)
  const { taken, remaining } = takeFromQueue(state.currentQueue, needed)

  return {
    ...state,
    currentQueue: remaining,
    sessionDate: newDate,
    dailyBatch: [...carry, ...taken],
    completedGroups: 0,
    groupSeenCount: 0,
    groupScrollIndex: 0,
    pendingMasteredIds,
    completedToday: false,
    allCompleted: carry.length === 0 && taken.length === 0 && state.nextRoundQueue.length === 0,
    lastSummary: null
  }
}

export function restoreMastered(
  state: StudyStateV2,
  wordId: number,
  allWordIds: number[]
): StudyStateV2 {
  if (!state.masteredIds.includes(wordId)) return state
  return {
    ...state,
    masteredIds: state.masteredIds.filter((id) => id !== wordId),
    nextRoundQueue: inCorpusOrder([...state.nextRoundQueue, wordId], allWordIds),
    allCompleted: false
  }
}

export function migrateV1ToV2(
  state: StudyStateV1,
  allWordIds: number[],
  sessionDate = state.sessionDate
): StudyStateV2 {
  const validIds = new Set(allWordIds)
  const dailyBatch = state.dailyBatch.filter((id) => validIds.has(id))
  const currentQueue = state.currentQueue.filter((id) => validIds.has(id))
  const completedBoundary = state.completedToday
    ? dailyBatch.length
    : Math.min(dailyBatch.length, Math.floor(state.seenCount / GROUP_SIZE) * GROUP_SIZE)
  const carry = state.completedToday ? [] : dailyBatch.slice(completedBoundary)
  const reserved = new Set([...currentQueue, ...carry])
  const historical = allWordIds.filter((id) => !reserved.has(id))
  const needed = state.completedToday ? 0 : Math.max(0, DAILY_LIMIT - carry.length)
  const { taken, remaining } = takeFromQueue(currentQueue, needed)
  const completedToday = state.completedToday
  const lastSummary: StudySummaryV2 | null = completedToday
    ? {
        reviewed: state.lastSummary?.reviewed ?? completedBoundary,
        groups: Math.ceil((state.lastSummary?.reviewed ?? completedBoundary) / GROUP_SIZE),
        mastered: 0,
        roundRemaining: remaining.length,
        roundCompleted: remaining.length === 0
      }
    : null

  return {
    schemaVersion: 2,
    corpusFingerprint: state.corpusFingerprint,
    round: state.round,
    currentQueue: remaining,
    nextRoundQueue: historical,
    sessionDate,
    dailyBatch: completedToday ? [] : [...carry, ...taken],
    completedGroups: 0,
    groupSeenCount: 0,
    groupScrollIndex: 0,
    pendingMasteredIds: [],
    masteredIds: [],
    completedToday,
    allCompleted: allWordIds.length === 0,
    lastSummary
  }
}

export function roundRemaining(state: StudyStateV2) {
  const completedWords = state.completedGroups * GROUP_SIZE
  return state.currentQueue.length + Math.max(0, state.dailyBatch.length - completedWords)
}
