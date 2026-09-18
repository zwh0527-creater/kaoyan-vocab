import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// Exact sentence keys avoid applying one sentence's translation to unrelated
// examples merely because they share a word, a year, or a substring.
export const translationOverrides = JSON.parse(readFileSync(
  new URL('./data/exam-translation-overrides.json', import.meta.url), 'utf8'
))

export const contextReview = JSON.parse(readFileSync(
  new URL('./data/exam-context-review.json', import.meta.url), 'utf8'
))
const reviewsByText = new Map()
for (const entry of contextReview.entries) {
  reviewsByText.set(entry.originalText, entry)
  if (entry.text) reviewsByText.set(entry.text, entry)
}

export function reviewContext(context) {
  const review = reviewsByText.get(context.text)
  if (!review) return { ...context }
  if (review.decision === 'exclude') return null
  const result = { ...context, text: review.text ?? context.text }
  if (review.sourceYears?.length === 1) result.year = review.sourceYears[0]
  if (review.sourceNote) result.sourceNote = review.sourceNote
  if (review.sourcePages?.length) result.sourcePages = review.sourcePages
  return result
}

export function reviewedContextRecord(text) {
  return reviewsByText.get(text)
}

export function pruneEmptyExamEntries(details) {
  return details.filter((detail) => {
    if (detail.exam) {
      detail.exam.phrases = detail.exam.phrases.filter((phrase) => phrase.contexts.length)
      if (!detail.exam.phrases.length) delete detail.exam
    }
    return detail.exam || detail.redbook || detail.coreMeaning || detail.collocations.length ||
      detail.examples?.length || detail.relatedWords?.length
  })
}

export function refreshDetailMetadata(meta, details) {
  const phrases = details.flatMap((d) => d.exam?.phrases ?? [])
  const contexts = phrases.flatMap((p) => p.contexts)
  return { ...meta, entryCount: details.length,
    examEntryCount: details.filter((d) => d.exam).length,
    examPhraseCount: phrases.length, examContextCount: contexts.length,
    examTranslationCount: contexts.filter((c) => c.translation).length,
    fingerprint: createHash('sha256').update(JSON.stringify(details)).digest('hex') }
}

// Handles full-width dates and digit glyphs used by the source PDF's broken
// font mapping. Never interpret a date mentioned later in a passage as its year.
export function examYearFromPage(page) {
  const header = page.normalize('NFKC').slice(0, 350)
    .replace(/[\u0013-\u001c]/g, (digit) => String(digit.charCodeAt(0) - 19))
    .replace(/\s+/g, '')
  const match = header.match(/(20(?:1\d|2[0-5]))(?:年|ᒤ)/)
  if (match) return Number(match[1])
  // The 2025 cover has no extractable Chinese characters after the year.
  if (/^2025\*/.test(header)) return 2025
  return null
}

export function applyTranslationOverrides(cache) {
  const result = {}
  for (const [text, entry] of Object.entries(cache)) {
    const reviewed = reviewContext({ text })
    if (reviewed) result[reviewed.text] = entry
  }
  for (const review of contextReview.entries) {
    if (review.decision === 'keep' && review.verifiedOfficial) {
      result[review.text ?? review.originalText] = { translation: review.answerTranslation,
        source: 'official-answer', question: review.answerQuestion }
    }
  }
  for (const [text, entry] of Object.entries(translationOverrides)) {
    result[text] = { translation: entry.translation, source: 'curated' }
  }
  return result
}

export function attachTranslation(context, translated) {
  if (!translated) return { ...context }
  const result = {
    ...context,
    translation: translated.translation,
    translationSource: translated.source
  }
  if (translated.source === 'official-answer' && translated.question) result.translationQuestion = Number(translated.question)
  else delete result.translationQuestion
  return result
}

export function buildReviewQueue(details, cache, words = []) {
  const wordById = new Map(words.map((word) => [word.id, word.word]))
  const grouped = new Map()
  for (const detail of details) {
    for (const [phraseIndex, phrase] of (detail.exam?.phrases ?? []).entries()) {
      for (const [contextIndex, context] of phrase.contexts.entries()) {
        const group = grouped.get(context.text) ?? { text: context.text, contexts: [], references: [] }
        group.contexts.push(context)
        group.references.push({ wordId: detail.wordId, word: wordById.get(detail.wordId),
          year: context.year, phrase: phrase.phrase, phraseIndex, contextIndex })
        grouped.set(context.text, group)
      }
    }
  }
  return [...grouped.values()].map(({ text, contexts, references }) => {
    const variants = [...new Set(contexts.map((c) => JSON.stringify({
      translation: c.translation, source: c.translationSource, question: c.translationQuestion
    })))].map((value) => JSON.parse(value))
    const sourceEntry = cache[text]
    const reasons = []
    const review = reviewedContextRecord(text)
    if (!review && contextReview.entries.length) reasons.push('not-reviewed')
    if (review?.decision === 'exclude') reasons.push('excluded-context')
    if (review && contexts.some((c) => {
      const expected = reviewContext(c)
      return expected && (expected.text !== c.text || expected.year !== c.year)
    })) reasons.push('source-drift')
    if (variants.length > 1) reasons.push('conflicting-translations')
    if (!sourceEntry) reasons.push('missing-cache-entry')
    else if (contexts.some((c) => {
      const expected = attachTranslation(c, sourceEntry)
      return c.translation !== expected.translation || c.translationSource !== expected.translationSource ||
        c.translationQuestion !== expected.translationQuestion
    })) reasons.push('cache-drift')
    if (contexts.some((c) => !c.translation?.trim())) reasons.push('missing-translation')
    if (contexts.some((c) => c.translationQuestion && c.translationSource !== 'official-answer')) {
      reasons.push('stale-question')
    }
    const englishWords = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)?.length ?? 0
    const chineseCounts = contexts.map((c) => c.translation?.match(/[\u3400-\u9fff]/g)?.length ?? 0)
    const ratio = Math.min(...chineseCounts) / Math.max(englishWords, 1)
    if (englishWords >= 12 && ratio < 1.2) reasons.push('possible-omission')
    if (contexts.some((c) => /[，,、；;：:]$/.test(c.translation?.trim() ?? ''))) reasons.push('unfinished-translation')
    if (/[\u3400-\u9fff�]|_{2,}|\bPennission\b/.test(text)) reasons.push('possible-ocr-error')
    const machine = contexts.some((c) => c.translationSource === 'local-machine')
    if (machine) reasons.push('machine-translation-review')
    const urgent = reasons.some((r) => ['excluded-context', 'source-drift', 'not-reviewed', 'conflicting-translations', 'missing-cache-entry', 'cache-drift',
      'missing-translation', 'stale-question'].includes(r))
    return { text, priority: urgent ? 0 : reasons.some((r) => r !== 'machine-translation-review') ? 1 : machine ? 2 : 3,
      reasons, reviewStatus: review?.decision ?? 'unreviewed', englishWordCount: englishWords, chinesePerEnglishWord: Number(ratio.toFixed(3)),
      variants, cache: sourceEntry ?? null, references }
  }).sort((a, b) => a.priority - b.priority || b.references.length - a.references.length ||
    (a.text < b.text ? -1 : a.text > b.text ? 1 : 0))
}
