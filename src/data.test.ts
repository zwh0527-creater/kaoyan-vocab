import { describe, expect, it } from 'vitest'
import words from './data/words.json'
import meta from './data/corpus-meta.json'
import wordDetails from './data/word-details.json'
import wordDetailsMeta from './data/word-details-meta.json'
import type { WordDetailEntry } from './types'

describe('vocabulary corpus', () => {
  it('contains every source row with complete fields', () => {
    expect(words).toHaveLength(5493)
    expect(meta.wordCount).toBe(5493)
    expect(meta.pageCount).toBe(117)
    expect(meta.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    for (const [index, entry] of words.entries()) {
      expect(entry.id).toBe(index)
      expect(entry.originalOrder).toBe(index)
      expect(entry.word).not.toBe('')
      expect(entry.phonetic).not.toBe('')
      expect(entry.meaning).not.toBe('')
      expect(entry.sourcePage).toBeGreaterThanOrEqual(1)
      expect(entry.sourcePage).toBeLessThanOrEqual(117)
    }
  })

  it('matches samples from the beginning, damaged source row, and end', () => {
    expect(words[0]).toMatchObject({ word: 'due', phonetic: '/dju:/', sourcePage: 1 })
    expect(words.find((entry) => entry.word === 'bond')).toMatchObject({ phonetic: 'bɒnd', sourcePage: 21 })
    expect(words.find((entry) => entry.word === 'abound')).toMatchObject({ sourcePage: 91 })
    expect(words.at(-1)).toMatchObject({ word: 'rotate', sourcePage: 117 })
  })
})

describe('optional word details', () => {
  it('keeps valid collocations separate from the base corpus', () => {
    const details = wordDetails as WordDetailEntry[]
    const validIds = new Set(words.map((word) => word.id))
    const seenIds = new Set<number>()
    let previousId = -1

    expect(wordDetailsMeta.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(wordDetailsMeta.entryCount).toBe(details.length)
    expect(wordDetailsMeta.corpusFingerprint).toBe(meta.fingerprint)

    for (const detail of details) {
      expect(validIds.has(detail.wordId)).toBe(true)
      expect(seenIds.has(detail.wordId)).toBe(false)
      expect(detail.wordId).toBeGreaterThan(previousId)
      expect(detail.collocations.length).toBeGreaterThan(0)
      expect(detail.collocations.length).toBeLessThanOrEqual(3)

      const phrases = new Set<string>()
      for (const collocation of detail.collocations) {
        expect(collocation.phrase.trim()).not.toBe('')
        expect(collocation.meaning.trim()).not.toBe('')
        expect(['english-1', 'postgraduate', 'general']).toContain(collocation.relevance)
        expect(phrases.has(collocation.phrase.toLowerCase())).toBe(false)
        phrases.add(collocation.phrase.toLowerCase())
      }

      seenIds.add(detail.wordId)
      previousId = detail.wordId
    }
  })
})
