import { describe, expect, it } from 'vitest'
import words from './data/words.json'
import meta from './data/corpus-meta.json'
import wordDetails from './data/word-details.json'
import wordDetailsMeta from './data/word-details-meta.json'
import type { WordDetailEntry } from './types'

function syllabusExamSense(meaning: string) {
  return meaning
    .replace(/^(?:(?:vt|vi|v|n|adj|adv|prep|pron|conj|num|art|aux)\.?\s*(?:\.\/|[./、])?\s*)+/i, '')
    .trim()
    .split(/[；;]/)
    .slice(0, 4)
    .join('；')
}

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
  it('keeps sourced meanings, red-book collocations, and exam evidence separate from the base corpus', () => {
    const details = wordDetails as WordDetailEntry[]
    const validIds = new Set(words.map((word) => word.id))
    const seenIds = new Set<number>()
    let previousId = -1

    expect(wordDetailsMeta.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(wordDetailsMeta.version).toBe(4)
    expect(wordDetailsMeta.entryCount).toBe(details.length)
    expect(wordDetailsMeta.corpusFingerprint).toBe(meta.fingerprint)
    expect(wordDetailsMeta.coreMeaningCount).toBe(details.filter((detail) => detail.coreMeaning).length)
    expect(wordDetailsMeta.collocationCount).toBe(details.reduce((sum, detail) => sum + detail.collocations.length, 0))
    expect(wordDetailsMeta.redbookEntryCount).toBe(details.filter((detail) => detail.redbook).length)
    expect(wordDetailsMeta.collocationSectionCount).toBe(details.filter((detail) => detail.redbook?.hasCollocationSection).length)
    expect(wordDetailsMeta.unparsedCollocationSectionCount).toBe(details.filter((detail) => detail.redbook?.hasCollocationSection && detail.collocations.length === 0).length)
    expect(wordDetailsMeta.exampleCount).toBe(details.reduce((sum, detail) => sum + (detail.examples?.length ?? 0), 0))
    expect(wordDetailsMeta.relatedWordCount).toBe(details.reduce((sum, detail) => sum + (detail.relatedWords?.length ?? 0), 0))
    expect(wordDetailsMeta.examEntryCount).toBe(details.filter((detail) => detail.exam).length)
    expect(wordDetailsMeta.examPhraseCount).toBe(details.reduce((sum, detail) => sum + (detail.exam?.phrases.length ?? 0), 0))
    expect(wordDetailsMeta.examContextCount).toBe(details.reduce((sum, detail) => sum + (detail.exam?.phrases ?? [])
      .reduce((phraseSum, phrase) => phraseSum + phrase.contexts.length, 0), 0))
    expect(wordDetailsMeta.examTranslationCount).toBe(wordDetailsMeta.examContextCount)
    expect(wordDetailsMeta.examYears).toEqual([2010, 2025])

    for (const detail of details) {
      expect(validIds.has(detail.wordId)).toBe(true)
      expect(seenIds.has(detail.wordId)).toBe(false)
      expect(detail.wordId).toBeGreaterThan(previousId)
      expect(Boolean(detail.coreMeaning || detail.exam || detail.redbook || detail.collocations.length || detail.examples?.length || detail.relatedWords?.length)).toBe(true)
      expect(detail.collocations.length).toBeLessThanOrEqual(5)

      if (detail.coreMeaning) {
        expect(detail.coreMeaning).toMatch(/[\u3400-\u9fff]/)
        expect(detail.coreMeaning.length).toBeLessThanOrEqual(600)
        expect(detail.coreMeaning).not.toMatch(/[�□■◆』]|[•·]{2,}|[…⋯][•·]|[•·][…⋯]/)
        for (const [open, close] of [['（', '）'], ['(', ')'], ['［', '］'], ['[', ']']]) {
          expect((detail.coreMeaning.match(new RegExp(`\\${open}`, 'g')) ?? []).length)
            .toBe((detail.coreMeaning.match(new RegExp(`\\${close}`, 'g')) ?? []).length)
        }
      }

      if (detail.redbook) {
        expect(detail.redbook.sourcePage).toBeGreaterThanOrEqual(1)
        expect(detail.redbook.sourcePage).toBeLessThanOrEqual(442)
        expect(typeof detail.redbook.hasCollocationSection).toBe('boolean')
      }

      for (const example of detail.examples ?? []) {
        expect(example.sentence).toMatch(/[a-z]/i)
        expect(example.meaning).toMatch(/[\u3400-\u9fff]/)
        expect(example.sourcePage).toBeGreaterThanOrEqual(1)
        expect(example.sourcePage).toBeLessThanOrEqual(442)
      }

      for (const related of detail.relatedWords ?? []) {
        expect(['synonym', 'antonym', 'derivative']).toContain(related.relation)
        expect(related.word).toMatch(/[a-z]/i)
        expect(related.meaning).toMatch(/[\u3400-\u9fff]/)
        expect(related.sourcePage).toBeGreaterThanOrEqual(1)
        expect(related.sourcePage).toBeLessThanOrEqual(442)
      }

      const phrases = new Set<string>()
      for (const collocation of detail.collocations) {
        expect(collocation.phrase.trim()).not.toBe('')
        expect(collocation.meaning.trim()).not.toBe('')
        expect(['english-1', 'postgraduate', 'general']).toContain(collocation.relevance)
        expect(collocation.source).toBe('redbook')
        expect(collocation.sourcePage).toBeGreaterThanOrEqual(1)
        expect(collocation.sourcePage).toBeLessThanOrEqual(442)
        expect(phrases.has(collocation.phrase.toLowerCase())).toBe(false)
        phrases.add(collocation.phrase.toLowerCase())
      }

      if (detail.exam) {
        expect(detail.exam.count).toBeGreaterThan(0)
        expect(detail.exam.years.length).toBeGreaterThan(0)
        expect(detail.exam.years.every((year) => year >= 2010 && year <= 2025)).toBe(true)
        expect(detail.exam.phrases.length).toBeLessThanOrEqual(2)
        for (const phrase of detail.exam.phrases) {
          expect(phrase.phrase).toMatch(/[a-z]/i)
          expect(phrase.count).toBeGreaterThan(0)
          expect(phrase.years.length).toBeGreaterThan(0)
          expect(phrase.years.every((year) => year >= 2010 && year <= 2025)).toBe(true)
          expect(phrase.meaning).toMatch(/[\u3400-\u9fff]/)
          expect(phrase.meaning).toBe(syllabusExamSense(words[detail.wordId].meaning))
          expect(phrase.contexts.length).toBeLessThanOrEqual(2)
          for (const context of phrase.contexts) {
            expect(context.text).toMatch(/[a-z]/i)
            expect(context.year).toBeGreaterThanOrEqual(2010)
            expect(context.year).toBeLessThanOrEqual(2025)
            expect(context.translation).toMatch(/[\u3400-\u9fff]/)
            expect(['official-answer', 'curated', 'local-machine']).toContain(context.translationSource)
          }
        }
      }

      seenIds.add(detail.wordId)
      previousId = detail.wordId
    }
  })

  it('prioritizes improved meanings and keeps verifiable English I samples', () => {
    const details = wordDetails as WordDetailEntry[]
    const due = details.find((detail) => detail.wordId === 0)
    const obtain = details.find((detail) => detail.wordId === words.find((word) => word.word === 'obtain')?.id)
    const neglect = details.find((detail) => detail.wordId === words.find((word) => word.word === 'neglect')?.id)
    const initiate = details.find((detail) => detail.wordId === words.find((word) => word.word === 'initiate')?.id)
    const magnify = details.find((detail) => detail.wordId === words.find((word) => word.word === 'magnify')?.id)
    const traffic = details.find((detail) => detail.wordId === words.find((word) => word.word === 'traffic')?.id)
    const clash = details.find((detail) => detail.wordId === words.find((word) => word.word === 'clash')?.id)
    const oppose = details.find((detail) => detail.wordId === words.find((word) => word.word === 'oppose')?.id)
    const vegetarian = details.find((detail) => detail.wordId === words.find((word) => word.word === 'vegetarian')?.id)
    const harassment = details.find((detail) => detail.wordId === words.find((word) => word.word === 'harassment')?.id)
    const compass = details.find((detail) => detail.wordId === words.find((word) => word.word === 'compass')?.id)
    const capitalMarch = details.find((detail) => detail.wordId === words.find((word) => word.word === 'March')?.id)

    expect(due?.coreMeaning).toContain('应支付的')
    expect(due?.collocations.some((item) => item.phrase === 'due to')).toBe(true)
    expect(due?.exam?.phrases.some((item) => item.phrase === 'due to' && item.years.includes(2016))).toBe(true)
    expect(obtain?.coreMeaning).toContain('获得')
    expect(obtain?.exam?.phrases.some((item) => item.phrase === 'obtained by' && item.years.includes(2024))).toBe(true)
    expect(neglect?.redbook?.hasCollocationSection).toBe(false)
    expect(neglect?.examples?.some((item) => item.sentence === "neglect one's health")).toBe(true)
    expect(neglect?.relatedWords?.some((item) => item.relation === 'synonym' && item.word === 'ignore')).toBe(true)
    expect(neglect?.exam?.phrases.every((item) => item.meaning.includes('忽视'))).toBe(true)
    expect(initiate?.redbook?.hasCollocationSection).toBe(true)
    expect(initiate?.collocations.some((item) => item.phrase === 'initiate sb. into')).toBe(true)
    expect(magnify?.coreMeaning).toContain('放大')
    expect(magnify?.coreMeaning).not.toContain('物体')
    expect(magnify?.redbook?.sourcePage).toBe(13)
    expect(magnify?.examples?.some((item) => item.sentence.includes('magnifier'))).toBe(true)
    expect(traffic?.coreMeaning).toContain('交通')
    expect(traffic?.coreMeaning).not.toContain('触角')
    expect(traffic?.redbook?.sourcePage).toBe(307)
    expect(traffic?.examples?.some((item) => item.sentence.includes('passenger traffic'))).toBe(true)
    expect(clash?.coreMeaning).toContain('冲突')
    expect(clash?.coreMeaning).not.toContain('包围')
    expect(clash?.redbook?.sourcePage).toBe(244)
    expect(oppose?.coreMeaning).toBeUndefined()
    expect(oppose?.redbook).toBeUndefined()
    expect(vegetarian?.coreMeaning).toBeUndefined()
    expect(vegetarian?.redbook).toBeUndefined()
    expect(harassment?.coreMeaning).toBeUndefined()
    expect(harassment?.redbook).toBeUndefined()
    expect(compass?.coreMeaning).toBeUndefined()
    expect(compass?.redbook).toBeDefined()
    expect(capitalMarch).toBeUndefined()
  })

  it('keeps exam examples free of known OCR and literal-translation failures', () => {
    const contexts = (wordDetails as WordDetailEntry[]).flatMap((detail) =>
      (detail.exam?.phrases ?? []).flatMap((phrase) => phrase.contexts),
    )
    const uniqueContexts = [...new Map(contexts.map((context) => [context.text, context])).values()]
    const translationFor = (needle: string) =>
      uniqueContexts.find((context) => context.text.toLowerCase().includes(needle.toLowerCase()))?.translation

    for (const context of uniqueContexts) {
      expect(context.text).not.toMatch(/_{2,}|�|\b(?:fiom|thafs|who5ve)\b|equ ities|judgm ent|about-fkce/i)
      expect(context.text).not.toMatch(/^(?:Directions|Choose the best|According to Paragraph|Which of the following)/i)
      expect(context.translation).not.toMatch(/商业方法索赔的贿赂|打到家里|一名猎人|吃掉他的话|站起来/)
      expect(context.translation).not.toMatch(/(.{2,8})\1{4,}|\d{20,}/)
      const englishWordCount = context.text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)?.length ?? 0
      const chineseCharacterCount = context.translation?.match(/[\u3400-\u9fff]/g)?.length ?? 0
      if (englishWordCount >= 12) expect(chineseCharacterCount / englishWordCount).toBeGreaterThanOrEqual(0.7)
    }

    expect(translationFor('traffic on their network')).toContain('数据流量')
    expect(translationFor('expand user traffic')).toContain('用户流量')
    expect(translationFor('really hit home')).toContain('真切意识到')
    expect(translationFor('one headhunter')).toContain('猎头')
    expect(translationFor('eat his words and stand down')).toContain('收回前言并辞职')
    expect(translationFor("Latin phrase 'sapere aude'")).toContain('康德')
  })
})
