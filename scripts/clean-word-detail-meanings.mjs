import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { assessCoreMeaning, syllabusExamSense } from './word-detail-quality.mjs'

const wordsPath = process.argv[2] ?? 'src/data/words.json'
const detailsPath = process.argv[3] ?? 'src/data/word-details.json'
const metaPath = process.argv[4] ?? 'src/data/word-details-meta.json'

const words = JSON.parse(await readFile(wordsPath, 'utf8'))
const details = JSON.parse(await readFile(detailsPath, 'utf8'))
const meta = JSON.parse(await readFile(metaPath, 'utf8'))
const wordById = new Map(words.map((word) => [word.id, word]))
const wordsByHeadword = new Map()

for (const word of words) {
  const key = word.word.toLowerCase()
  const entries = wordsByHeadword.get(key) ?? []
  entries.push(word)
  wordsByHeadword.set(key, entries)
}

const issueCounts = new Map()
let examMeaningUpdateCount = 0

const cleanedDetails = details.flatMap((detail) => {
  const word = wordById.get(detail.wordId)
  if (!word) throw new Error(`Unknown word id: ${detail.wordId}`)
  const sameHeadwordEntries = wordsByHeadword.get(word.word.toLowerCase()) ?? [word]
  const coreIssue = detail.coreMeaning
    ? assessCoreMeaning(word, detail.coreMeaning, sameHeadwordEntries)
    : null
  const isAmbiguousCase = coreIssue === 'ambiguous-case'
  const isSemanticMismatch = coreIssue === 'semantic-mismatch'
  const cleaned = { ...detail }

  if (coreIssue) {
    issueCounts.set(coreIssue, (issueCounts.get(coreIssue) ?? 0) + 1)
    delete cleaned.coreMeaning
  }

  if (isAmbiguousCase || isSemanticMismatch) {
    delete cleaned.redbook
    delete cleaned.examples
    delete cleaned.relatedWords
    cleaned.collocations = []
  }

  if (isAmbiguousCase) delete cleaned.exam
  for (const phrase of cleaned.exam?.phrases ?? []) {
    const nextMeaning = syllabusExamSense(word.meaning)
    if (phrase.meaning !== nextMeaning) examMeaningUpdateCount += 1
    phrase.meaning = nextMeaning
  }

  const hasContent = cleaned.coreMeaning || cleaned.exam || cleaned.redbook ||
    cleaned.collocations.length || cleaned.examples?.length || cleaned.relatedWords?.length
  return hasContent ? [cleaned] : []
})

const serialized = JSON.stringify(cleanedDetails)
meta.entryCount = cleanedDetails.length
meta.coreMeaningCount = cleanedDetails.filter((detail) => detail.coreMeaning).length
meta.collocationCount = cleanedDetails.reduce((sum, detail) => sum + detail.collocations.length, 0)
meta.redbookEntryCount = cleanedDetails.filter((detail) => detail.redbook).length
meta.collocationSectionCount = cleanedDetails.filter((detail) => detail.redbook?.hasCollocationSection).length
meta.unparsedCollocationSectionCount = cleanedDetails.filter((detail) =>
  detail.redbook?.hasCollocationSection && detail.collocations.length === 0
).length
meta.exampleCount = cleanedDetails.reduce((sum, detail) => sum + (detail.examples?.length ?? 0), 0)
meta.relatedWordCount = cleanedDetails.reduce((sum, detail) => sum + (detail.relatedWords?.length ?? 0), 0)
meta.examEntryCount = cleanedDetails.filter((detail) => detail.exam).length
meta.examPhraseCount = cleanedDetails.reduce((sum, detail) => sum + (detail.exam?.phrases.length ?? 0), 0)
meta.examContextCount = cleanedDetails.reduce((sum, detail) => sum + (detail.exam?.phrases ?? [])
  .reduce((phraseSum, phrase) => phraseSum + phrase.contexts.length, 0), 0)
meta.examTranslationCount = cleanedDetails.reduce((sum, detail) => sum + (detail.exam?.phrases ?? [])
  .reduce((phraseSum, phrase) => phraseSum + phrase.contexts.filter((context) => context.translation).length, 0), 0)
meta.fingerprint = createHash('sha256').update(serialized).digest('hex')

await writeFile(detailsPath, `${JSON.stringify(cleanedDetails, null, 2)}\n`)
await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`)

console.log(JSON.stringify({
  before: details.length,
  after: cleanedDetails.length,
  coreMeaningBefore: details.filter((detail) => detail.coreMeaning).length,
  coreMeaningAfter: meta.coreMeaningCount,
  quarantined: Object.fromEntries(issueCounts),
  examMeaningUpdateCount
}, null, 2))
