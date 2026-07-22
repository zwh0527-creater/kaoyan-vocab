import { describe, expect, it } from 'vitest'
import { wordLengthClass } from './wordDisplay'

describe('word display sizing', () => {
  it('keeps normal words large and gives long words a single-line fitting class', () => {
    expect(wordLengthClass('traffic')).toBe('')
    expect(wordLengthClass('responsibility')).toBe('word-length-long')
    expect(wordLengthClass('air-conditioning')).toBe('word-length-extra-long')
  })
})
