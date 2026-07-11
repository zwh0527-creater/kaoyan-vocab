import { describe, expect, it } from 'vitest'
import words from './data/words.json'
import meta from './data/corpus-meta.json'

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
