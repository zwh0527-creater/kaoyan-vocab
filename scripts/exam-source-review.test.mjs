import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { contextReview, reviewContext, applyTranslationOverrides, examYearFromPage, pruneEmptyExamEntries } from './exam-translation-quality.mjs'

const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const details = read('src/data/word-details.json')
const contexts = details.flatMap((d) => (d.exam?.phrases ?? []).flatMap((p) => p.contexts))

describe('complete sentence and source review', () => {
  it('accounts for every original sentence with an explicit keep or exclude decision', () => {
    expect(contextReview.coverage.originalSentences).toBe(1658)
    expect(contextReview.entries).toHaveLength(1658)
    expect(new Set(contextReview.entries.map((e) => e.originalText)).size).toBe(1658)
    expect(contextReview.coverage.reviewedSentences).toBe(1658)
    for (const entry of contextReview.entries) {
      expect(['keep', 'exclude']).toContain(entry.decision)
      expect(entry.sourcePages.length).toBeGreaterThan(0)
      expect(entry.sourceYears.every((y) => y >= 2010 && y <= 2025)).toBe(true)
      if (entry.decision === 'exclude') {
        expect(entry.reason).toBeTruthy()
        expect(contexts.some((c) => c.text === entry.originalText)).toBe(false)
      } else {
        const matches = contexts.filter((c) => c.text === (entry.text ?? entry.originalText))
        expect(matches.length, entry.originalText).toBeGreaterThan(0)
        for (const c of matches) {
          expect(c.translationSource).not.toBe('local-machine')
          expect(entry.sourceYears).toContain(c.year)
          expect(c.sourcePages).toEqual(entry.sourcePages)
          if (c.translationSource === 'official-answer') {
            expect(entry.verifiedOfficial).toBe(true)
            expect(c.translationQuestion).toBe(entry.answerQuestion)
          }
        }
      }
    }
  })

  it('repairs a historical year and refuses to reintroduce excluded examples', () => {
    const royal = contextReview.entries.find((e) => e.originalText.includes('Princes and princesses have day-jobs'))
    expect(reviewContext({ text: royal.originalText, year: 2012 }).year).toBe(2015)
    const bad = contextReview.entries.find((e) => e.decision === 'exclude')
    expect(reviewContext({ text: bad.originalText, year: 2012 })).toBeNull()
    expect(applyTranslationOverrides({ [bad.originalText]: { translation: '旧译', source: 'local-machine' } })[bad.originalText]).toBeUndefined()
  })

  it('removes empty exam sections without dropping unrelated word content', () => {
    const rows = [
      { wordId: 1, collocations: [], exam: { phrases: [{ contexts: [] }] } },
      { wordId: 2, collocations: [], redbook: { sourcePage: 12 }, exam: { phrases: [] } }
    ]
    expect(pruneEmptyExamEntries(rows)).toEqual([{ wordId: 2, collocations: [], redbook: { sourcePage: 12 } }])
    expect(details.every((d) => !d.exam || d.exam.phrases.length > 0)).toBe(true)
  })

  it('restores verified official answers after cache deletion', () => {
    const restored = applyTranslationOverrides({})
    for (const entry of contextReview.entries.filter((e) => e.verifiedOfficial)) {
      expect(restored[entry.text ?? entry.originalText]).toEqual({
        translation: entry.answerTranslation, source: 'official-answer', question: entry.answerQuestion
      })
    }
  })

  it('reads dates from the PDF header including broken glyphs and full-width digits', () => {
    expect(examYearFromPage('２０１４年全国硕士研究生招生考试')).toBe(2014)
    expect(examYearFromPage('\u0015\u001313 ᒤ garbled cover')).toBe(2013)
    expect(examYearFromPage('\u0015\u00131\u0018 ᒤ garbled cover')).toBe(2015)
    expect(examYearFromPage('2025 * corrupted cover')).toBe(2025)
    expect(examYearFromPage('Text 1\nThe company bought the plant in 2002.')).toBeNull()
  })

  it('keeps Python source corrections, exclusions and years in agreement with Node', () => {
    const python = execFileSync('python3', ['-B', '-c', `
import importlib.util, json
spec = importlib.util.spec_from_file_location('m', 'scripts/build-exam-translations.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
result = [m.review_context({'text': e['originalText'], 'year': 2012}) for e in m.CONTEXT_REVIEW['entries']]
print(json.dumps(result, ensure_ascii=False))
`], { maxBuffer: 5 * 1024 * 1024 })
    const node = contextReview.entries.map((e) => reviewContext({ text: e.originalText, year: 2012 }))
    expect(JSON.parse(python.toString())).toEqual(node)
  })
})
