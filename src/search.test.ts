import { describe, expect, it } from 'vitest'
import { searchWords } from './search'
import type { WordDetailEntry, WordEntry } from './types'

const words: WordEntry[] = [
  { id: 0, word: 'neglect', phonetic: '/nɪˈɡlekt/', meaning: '忽视；疏忽', sourcePage: 1, originalOrder: 0 },
  { id: 1, word: 'obtain', phonetic: '/əbˈteɪn/', meaning: '得到', sourcePage: 1, originalOrder: 1 },
  { id: 2, word: 'negligent', phonetic: '/ˈneɡlɪdʒənt/', meaning: '疏忽的', sourcePage: 1, originalOrder: 2 }
]
const details = new Map<number, WordDetailEntry>([
  [1, { wordId: 1, coreMeaning: '获得，得到；存在，流行', collocations: [] }]
])

describe('word search', () => {
  it('ranks an exact English match before prefix and partial matches', () => {
    expect(searchWords(words, details, 'neglect').matches.map((word) => word.word)).toEqual(['neglect'])
    expect(searchWords(words, details, 'neg').matches.map((word) => word.word)).toEqual(['neglect', 'negligent'])
  })

  it('supports Chinese reverse lookup across enriched and source meanings', () => {
    expect(searchWords(words, details, '获得').matches.map((word) => word.word)).toEqual(['obtain'])
    expect(searchWords(words, details, '疏忽').matches.map((word) => word.word)).toEqual(['negligent', 'neglect'])
  })

  it('limits rendered results while keeping the total count', () => {
    const result = searchWords(words, details, 'n', 1)
    expect(result.total).toBe(3)
    expect(result.matches).toHaveLength(1)
  })
})
