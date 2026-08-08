import type { MeaningOverrideStoreV1, MeaningOverrideV1 } from './types'

const STORAGE_KEY = 'kaoyan-vocab.meaning-overrides.v1'
export const MAX_PERSONAL_MEANING_LENGTH = 160

function isValidUpdatedAt(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

export function normalizePersonalMeaning(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function isValidMeaningOverrides(
  value: unknown,
  validIds: Set<number>
): value is MeaningOverrideV1[] {
  if (!Array.isArray(value)) return false
  const seen = new Set<number>()
  for (const item of value) {
    if (!item || typeof item !== 'object') return false
    const entry = item as Partial<MeaningOverrideV1>
    if (!Number.isInteger(entry.wordId) || !validIds.has(entry.wordId as number)) return false
    if (seen.has(entry.wordId as number)) return false
    if (typeof entry.meaning !== 'string') return false
    const meaning = normalizePersonalMeaning(entry.meaning)
    if (!meaning || meaning.length > MAX_PERSONAL_MEANING_LENGTH || meaning !== entry.meaning) return false
    if (!isValidUpdatedAt(entry.updatedAt)) return false
    seen.add(entry.wordId as number)
  }
  return true
}

export function loadMeaningOverrides(corpusFingerprint: string, allWordIds: number[]) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return []
    const store = parsed as Partial<MeaningOverrideStoreV1>
    if (
      store.version !== 1 ||
      store.corpusFingerprint !== corpusFingerprint ||
      !isValidMeaningOverrides(store.entries, new Set(allWordIds))
    ) return []
    return store.entries
  } catch {
    return []
  }
}

export function saveMeaningOverrides(corpusFingerprint: string, entries: MeaningOverrideV1[]) {
  const store: MeaningOverrideStoreV1 = { version: 1, corpusFingerprint, entries }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function upsertMeaningOverride(
  entries: MeaningOverrideV1[],
  wordId: number,
  rawMeaning: string,
  now = new Date()
) {
  const meaning = normalizePersonalMeaning(rawMeaning)
  if (!meaning) throw new Error('个人释义不能为空')
  if (meaning.length > MAX_PERSONAL_MEANING_LENGTH) {
    throw new Error(`个人释义不能超过 ${MAX_PERSONAL_MEANING_LENGTH} 个字`)
  }
  const next = entries.filter((entry) => entry.wordId !== wordId)
  next.push({ wordId, meaning, updatedAt: now.toISOString() })
  return next.sort((left, right) => left.wordId - right.wordId)
}

export function removeMeaningOverride(entries: MeaningOverrideV1[], wordId: number) {
  return entries.filter((entry) => entry.wordId !== wordId)
}
