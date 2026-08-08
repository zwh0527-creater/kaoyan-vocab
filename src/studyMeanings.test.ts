import { describe, expect, it } from 'vitest'
import { studyMeaningFor } from './studyMeanings'
import type { WordEntry } from './types'

const word: WordEntry = {
  id: 9,
  word: 'traffic',
  phonetic: "/'træfik/",
  meaning: '（牛羊等的）角，触角；号，喇叭',
  studyMeaning: 'n.交通；运输；来往；交易',
  sourcePage: 1,
  originalOrder: 9
}

describe('study meaning priority', () => {
  it('uses personal, calibrated and source meanings in that order', () => {
    expect(studyMeaningFor({ ...word, personalMeaning: 'n.交通；车流' })).toBe('n.交通；车流')
    expect(studyMeaningFor(word)).toBe('n.交通；运输；来往；交易')
    expect(studyMeaningFor({ ...word, studyMeaning: undefined })).toBe(word.meaning)
  })
})
