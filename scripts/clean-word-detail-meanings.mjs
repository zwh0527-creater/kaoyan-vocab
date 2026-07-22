import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { assessCoreMeaning, syllabusExamSense } from './word-detail-quality.mjs'

const wordsPath = process.argv[2] ?? 'src/data/words.json'
const detailsPath = process.argv[3] ?? 'src/data/word-details.json'
const metaPath = process.argv[4] ?? 'src/data/word-details-meta.json'
const studyMeaningsPath = process.argv[5] ?? 'src/data/study-meanings.json'

const words = JSON.parse(await readFile(wordsPath, 'utf8'))
const details = JSON.parse(await readFile(detailsPath, 'utf8'))
const meta = JSON.parse(await readFile(metaPath, 'utf8'))
const studyMeanings = JSON.parse(await readFile(studyMeaningsPath, 'utf8'))
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

function applyCuratedCorrections(word, detail) {
  if (word.word.toLowerCase() !== 'odds') return detail
  const contexts = (detail.exam?.phrases ?? [])
    .flatMap((phrase) => phrase.contexts)
    .filter((context, index, all) => all.findIndex((candidate) => candidate.text === context.text) === index)
    .map((context) => ({
      ...context,
      translation: context.year === 2024
        ? '监管范围的缩小，对建筑商、采矿经营者以及其他经常与环保规定发生冲突的商业利益方来说，是一次胜利。'
        : '这种自上而下的时尚业观念早已过时，也与伊丽莎白·克莱因历时三年批判“快时尚”的《Overdressed》一书所描绘的狂热世界格格不入。',
      translationSource: 'curated'
    }))
  return {
    ...detail,
    collocations: [
      { phrase: 'at odds with', meaning: '与……不一致；与……相冲突', relevance: 'english-1', source: 'redbook', sourcePage: 265 },
      { phrase: 'It makes no odds.', meaning: '没有关系；没有差别', relevance: 'postgraduate', source: 'redbook', sourcePage: 265 },
      { phrase: "What's the odds?", meaning: '有什么要紧的？', relevance: 'postgraduate', source: 'redbook', sourcePage: 265 }
    ],
    examples: [{
      sentence: 'Do you believe your efforts can make the odds even?',
      meaning: '你相信自己的努力能让双方机会均等吗？',
      sourcePage: 265
    }],
    ...(detail.exam ? {
      exam: {
        ...detail.exam,
        phrases: [{
          phrase: 'at odds with',
          count: detail.exam.count,
          years: detail.exam.years,
          meaning: '与……不一致；与……相冲突',
          usage: '结构：be at odds with + 名词，表示“与……不一致、相冲突”',
          contexts
        }]
      }
    } : {})
  }
}

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
  }
  if (cleaned.coreMeaning) issueCounts.set('redbook-meaning-quarantined', (issueCounts.get('redbook-meaning-quarantined') ?? 0) + 1)
  delete cleaned.coreMeaning

  if (isAmbiguousCase || isSemanticMismatch) {
    delete cleaned.redbook
    delete cleaned.examples
    delete cleaned.relatedWords
    cleaned.collocations = []
  }

  if (isAmbiguousCase) delete cleaned.exam
  for (const phrase of cleaned.exam?.phrases ?? []) {
    const nextMeaning = studyMeanings[word.id]?.meaning ?? syllabusExamSense(word.meaning)
    if (phrase.meaning !== nextMeaning) examMeaningUpdateCount += 1
    phrase.meaning = nextMeaning
  }

  const curated = applyCuratedCorrections(word, cleaned)
  const hasContent = curated.exam || curated.redbook || curated.collocations.length ||
    curated.examples?.length || curated.relatedWords?.length
  return hasContent ? [curated] : []
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
