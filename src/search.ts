import type { WordDetailEntry, WordEntry } from './types'

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('en-US')
}

export interface WordSearchResult {
  total: number
  matches: WordEntry[]
}

export function searchWords(
  words: WordEntry[],
  detailMap: ReadonlyMap<number, WordDetailEntry> | null,
  query: string,
  limit = 80
): WordSearchResult {
  const needle = normalize(query)
  if (!needle) return { total: 0, matches: [] }
  const isChineseSearch = /[\u3400-\u9fff]/.test(needle)
  const ranked: Array<{ word: WordEntry; rank: number }> = []

  for (const word of words) {
    const detailMeaning = detailMap?.get(word.id)?.coreMeaning ?? ''
    if (isChineseSearch) {
      const coreIndex = detailMeaning.indexOf(needle)
      const sourceIndex = word.meaning.indexOf(needle)
      if (coreIndex < 0 && sourceIndex < 0) continue
      ranked.push({ word, rank: coreIndex >= 0 ? coreIndex : 100 + sourceIndex })
      continue
    }

    const english = normalize(word.word)
    const index = english.indexOf(needle)
    if (index < 0) continue
    ranked.push({
      word,
      rank: english === needle ? 0 : english.startsWith(needle) ? 10 + english.length : 100 + index
    })
  }

  ranked.sort((left, right) => left.rank - right.rank || left.word.originalOrder - right.word.originalOrder)
  return { total: ranked.length, matches: ranked.slice(0, limit).map((item) => item.word) }
}
