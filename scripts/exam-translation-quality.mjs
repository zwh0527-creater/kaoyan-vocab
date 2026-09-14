import { readFileSync } from 'node:fs'

// Exact sentence keys avoid applying one sentence's translation to unrelated
// examples merely because they share a word, a year, or a substring.
export const translationOverrides = JSON.parse(readFileSync(
  new URL('./data/exam-translation-overrides.json', import.meta.url), 'utf8'
))

export function applyTranslationOverrides(cache) {
  const result = { ...cache }
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
    const urgent = reasons.some((r) => ['conflicting-translations', 'missing-cache-entry', 'cache-drift',
      'missing-translation', 'stale-question'].includes(r))
    return { text, priority: urgent ? 0 : reasons.some((r) => r !== 'machine-translation-review') ? 1 : machine ? 2 : 3,
      reasons, englishWordCount: englishWords, chinesePerEnglishWord: Number(ratio.toFixed(3)),
      variants, cache: sourceEntry ?? null, references }
  }).sort((a, b) => a.priority - b.priority || b.references.length - a.references.length ||
    (a.text < b.text ? -1 : a.text > b.text ? 1 : 0))
}
