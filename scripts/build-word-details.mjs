import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

function argument(name) {
  const index = process.argv.indexOf(name)
  if (index === -1 || !process.argv[index + 1]) throw new Error(`Missing ${name}`)
  return process.argv[index + 1]
}

function optionalArgument(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1] ?? null
}

const wordsPath = argument('--words')
const ocrPath = argument('--ocr')
const outputPath = argument('--output')
const metaPath = argument('--meta')
const corpusMetaPath = argument('--corpus-meta')
const examTextPath = optionalArgument('--exam-text')

const words = JSON.parse(await readFile(wordsPath, 'utf8'))
const corpusMeta = JSON.parse(await readFile(corpusMetaPath, 'utf8'))
const rawLines = (await readFile(ocrPath, 'utf8')).split(/\r?\n/).filter(Boolean)
const records = rawLines.map((line) => JSON.parse(line))
const idsByWord = new Map()

for (const word of words) {
  const key = word.word.toLowerCase()
  const ids = idsByWord.get(key) ?? []
  ids.push(word.id)
  idsByWord.set(key, ids)
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[•·]\s*\d+\s*[•·]/g, ' ')
    .replace(/^\d+\s+/, '')
    .replace(/^gget\b/i, 'get')
    .replace(/^carr\//i, 'carry/')
    .replace(/\bsbis\b/gi, "sb.'s")
    .replace(/\s+/g, ' ')
    .replace(/^[\s:：;；,，.。]+|[\s;；]+$/g, '')
    .trim()
}

const senseMarker = /^[①②③④⑤⑥⑦⑧⑨⑩]/

function cleanMeaningCandidate(value) {
  let text = cleanText(value)
    .replace(/[【\[]?词义[】\]]?/g, '')
    .replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '')
    .trim()
  if (!/[\u3400-\u9fff]/.test(text)) return null

  const colonIndex = text.search(/[:：]/)
  if (colonIndex > 0) text = text.slice(0, colonIndex)
  text = text.replace(/^[（(]\s*(?:in|of|for|to|on|at|with|from|into|by|as|c|u|v|n|adj|adv|vt|vi|p|pl|sing)(?:\s*[/,]\s*(?:in|of|for|to|on|at|with|from|into|by|as|c|u|v|n|adj|adv|vt|vi|p|pl|sing))*\s*[）)]\s*/i, '')
  const englishIndex = text.search(/[A-Za-z]{2,}/)
  if (englishIndex > 0) text = text.slice(0, englishIndex)

  text = cleanText(text)
    .replace(/[（(]\s*(?:c|u|v|n|adj|adv|vt|vi|p|pl|sing)(?:\s*[/,]\s*(?:c|u|v|n|adj|adv|vt|vi|p|pl|sing))*\s*[）)]/gi, '')
    .replace(/[~～]/g, '')
    .replace(/[•·]\s*[⋯…]+/g, '……')
    .replace(/[•⋯…]+$/g, '')
    .replace(/[，,、；;：:]$/g, '')
    .trim()

  if (
    text.length < 1 ||
    text.length > 90 ||
    !/[\u3400-\u9fff]/.test(text) ||
    /[A-Za-z]/.test(text) ||
    /[。！？?]/.test(text) ||
    /(?:词义为|强调|本题|例如|原义|扩大到|根据句意)/.test(text) ||
    /^[的而]/.test(text)
  ) return null
  return text
}

function parseMeaningLines(lines) {
  const meanings = []
  let pendingMeaning = false

  for (const rawLine of lines) {
    const line = cleanText(rawLine)
    const hasMeaningMarker = line.includes('词义')
    const withoutMarker = line.replace(/[【\[]?词义[】\]]?/g, '').trim()
    const numberedSense = senseMarker.test(withoutMarker)

    if (hasMeaningMarker || numberedSense || pendingMeaning) {
      const parsed = cleanMeaningCandidate(withoutMarker)
      if (parsed && !meanings.includes(parsed)) meanings.push(parsed)
      pendingMeaning = (hasMeaningMarker || numberedSense) && !parsed && !/[\u3400-\u9fff]/.test(withoutMarker)
    }
  }

  if (meanings.length === 0) return null
  return meanings.slice(0, 6).join('；')
}

function splitCandidates(headword, lines) {
  const normalized = lines
    .join(' ')
    .replace(/[【\[]?词组[】\]]?/g, ' ')
    .replace(/（或\s*([a-z]+)）/gi, ' (or $1) ')
    .replace(/[~～]/g, headword)
  return normalized
    .split(/(?=[①②③④⑤⑥⑦⑧⑨⑩])/)
    .map((part) => part.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, ''))
    .filter((part) => cleanText(part) !== '')
}

const examText = examTextPath ? await readFile(examTextPath, 'utf8') : ''
const examTokens = new Set((examText.toLowerCase().match(/[a-z]+/g) ?? []))
const phraseLexicon = new Set([
  ...examTokens,
  ...words.flatMap((word) => word.word.toLowerCase().match(/[a-z]+/g) ?? []),
  'sb', 'sth', 'somebody', 'something', 'oneself', 'one', 'another', 'either', 'neither'
])

function parseCandidate(headword, candidate, page) {
  const text = cleanText(candidate)
  const chineseIndex = text.search(/[\u3400-\u9fff]/)
  if (chineseIndex < 1) return null
  const phrase = cleanText(text.slice(0, chineseIndex))
    .replace(/（/g, ' (')
    .replace(/）/g, ') ')
    .replace(/[•⋯…]+$/g, '')
    .replace(/\s+/g, ' ')
  const meaning = cleanText(text.slice(chineseIndex).split(/[:：]/, 1)[0])
  if (phrase.length < 2 || phrase.length > 80 || meaning.length < 1 || meaning.length > 120) return null
  if (!/[a-z]/i.test(phrase) || /[\u3400-\u9fff]/.test(phrase)) return null
  if (/[�□■◆•\[\]【】]/.test(phrase + meaning)) return null
  if (/[A-Za-z]{4,}/.test(meaning)) return null
  if ((phrase.match(/[.!?]/g) ?? []).length > 3) return null
  if (phrase.split(/\s+/).length > 8) return null
  if (phrase.endsWith('.') && !/(?:sb|sth)\.$/i.test(phrase)) return null
  const pairs = [['(', ')'], ['（', '）']]
  if (pairs.some(([open, close]) => phrase.split(open).length !== phrase.split(close).length)) return null

  const letters = headword.toLowerCase().replace(/[^a-z]/g, '')
  const normalizedPhrase = phrase.toLowerCase().replace(/[^a-z]/g, '')
  const relatedStem = letters.length >= 5 ? letters.slice(0, 4) : letters.length === 4 ? letters.slice(0, 3) : letters
  if (relatedStem.length > 0 && !normalizedPhrase.includes(letters) && !normalizedPhrase.includes(relatedStem)) return null

  const unknownToken = (phrase.toLowerCase().match(/[a-z]+/g) ?? [])
    .find((token) => token.length >= 4 && !phraseLexicon.has(token) && !token.startsWith(relatedStem))
  if (unknownToken) return null

  return {
    phrase,
    meaning,
    relevance: 'postgraduate',
    source: 'redbook',
    sourcePage: page
  }
}

function wordCandidatesForToken(token, wordKeys) {
  if (wordKeys.has(token)) return [token]
  if (token.length < 4) return []
  const candidates = []
  if (token.endsWith('ies')) candidates.push(`${token.slice(0, -3)}y`)
  if (token.endsWith('ing')) {
    const stem = token.slice(0, -3)
    candidates.push(stem, `${stem}e`, stem.replace(/([a-z])\1$/, '$1'))
  }
  if (token.endsWith('ed')) {
    const stem = token.slice(0, -2)
    candidates.push(stem, `${stem}e`, stem.replace(/([a-z])\1$/, '$1'))
  }
  if (token.endsWith('es')) candidates.push(token.slice(0, -2), token.slice(0, -1))
  if (token.endsWith('s')) candidates.push(token.slice(0, -1))
  return candidates.filter((candidate) => candidate.length >= 3 && wordKeys.has(candidate))
}

const genericExamWords = new Set([
  'answer', 'sheet', 'directions', 'following', 'text', 'choose', 'mark', 'section',
  'read', 'question', 'questions', 'best', 'word', 'words', 'paragraph'
])
const connectorWords = new Set([
  'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around', 'as', 'at',
  'before', 'behind', 'below', 'between', 'by', 'down', 'for', 'from', 'in', 'into', 'of',
  'off', 'on', 'out', 'over', 'through', 'to', 'under', 'up', 'upon', 'with', 'without'
])
const weakContextWords = new Set([
  'a', 'an', 'the', 'some', 'any', 'this', 'that', 'these', 'those', 'so', 'very', 'more',
  'most', 'less', 'much', 'many', 'all', 'each', 'every', 'another', 'such', 'still', 'even'
])

function buildExamEvidence(rawText) {
  const wordKeys = new Set(idsByWord.keys())
  const evidenceByWord = new Map()
  let currentYear = null

  for (const page of rawText.split('\f')) {
    const yearMatch = page.match(/(20(?:1\d|2[0-5]))\s*年/)
    if (yearMatch) currentYear = Number(yearMatch[1])
    if (!currentYear) continue

    const fragments = page
      .replace(/[“”‘’]/g, "'")
      .split(/[.!?;；。！？\n]+/)

    for (const fragment of fragments) {
      if ((fragment.match(/\[/g) ?? []).length >= 2 || /\[\s*[A-D](?:\s*[A-Z])?\s*\]?/i.test(fragment)) continue
      const cleanedFragment = fragment.replace(/\[\s*[A-D](?:\s*[A-Z])?\s*\]?/gi, ' ')
      const tokens = (cleanedFragment.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []).map((token) => {
        const normalized = token.toLowerCase()
        return normalized === 'fbr' ? 'for' : normalized
      })
      if (tokens.length < 2 || tokens.length > 90) continue

      for (let index = 0; index < tokens.length; index += 1) {
        const surface = tokens[index]
        const canonicalWords = wordCandidatesForToken(surface, wordKeys)
        for (const canonical of canonicalWords) {
          const evidence = evidenceByWord.get(canonical) ?? {
            count: 0,
            years: new Set(),
            phrases: new Map()
          }
          evidence.count += 1
          evidence.years.add(currentYear)

          const windows = [
            tokens.slice(index, Math.min(tokens.length, index + 2)),
            tokens.slice(Math.max(0, index - 1), index + 1),
            tokens.slice(Math.max(0, index - 1), Math.min(tokens.length, index + 2)),
            tokens.slice(index, Math.min(tokens.length, index + 3)),
            tokens.slice(Math.max(0, index - 2), index + 1),
            tokens.slice(Math.max(0, index - 2), Math.min(tokens.length, index + 3))
          ]

          for (const window of windows) {
            if (window.length < 2 || window.length > 5) continue
            if (!window.includes(surface)) continue
            if (window.some((token) => token.length === 1 && token !== 'a' && token !== 'i')) continue
            if (window.every((token) => token.length <= 2 || connectorWords.has(token))) continue
            const phrase = window.join(' ')
            const existing = evidence.phrases.get(phrase) ?? { count: 0, years: new Set() }
            existing.count += 1
            existing.years.add(currentYear)
            evidence.phrases.set(phrase, existing)
          }
          evidenceByWord.set(canonical, evidence)
        }
      }
    }
  }

  const result = new Map()
  for (const [word, evidence] of evidenceByWord) {
    const phrases = [...evidence.phrases.entries()]
      .map(([phrase, stats]) => {
        const tokens = phrase.split(' ')
        const containsConnector = tokens.some((token) => connectorWords.has(token))
        const startsWithTarget = wordCandidatesForToken(tokens[0], wordKeys).includes(word)
        const endsWithTarget = wordCandidatesForToken(tokens[tokens.length - 1], wordKeys).includes(word)
        const weakLeadingContext = endsWithTarget && tokens.slice(0, -1).every((token) => connectorWords.has(token) || weakContextWords.has(token))
        const weakTrailingContext = startsWithTarget && tokens.slice(1).every((token) => weakContextWords.has(token))
        if (weakLeadingContext || weakTrailingContext) return null
        const genericPenalty = tokens.some((token) => genericExamWords.has(token)) ? 24 : 0
        const leadingConnectorPenalty = connectorWords.has(tokens[0]) ? 18 : 0
        const lengthScore = tokens.length === 2 ? 12 : tokens.length === 3 ? 8 : tokens.length === 4 ? 4 : 0
        return {
          phrase,
          count: stats.count,
          years: [...stats.years].sort((left, right) => left - right),
          score: stats.count * 30 + stats.years.size * 12 + lengthScore + (containsConnector ? 5 : 0) +
            (startsWithTarget ? 20 : 0) + (endsWithTarget ? 4 : 0) - genericPenalty - leadingConnectorPenalty
        }
      })
      .filter(Boolean)
      .sort((left, right) => right.score - left.score || left.phrase.length - right.phrase.length)

    const selected = []
    for (const phrase of phrases) {
      if (selected.some((item) => item.phrase.includes(phrase.phrase) || phrase.phrase.includes(item.phrase))) continue
      selected.push({ phrase: phrase.phrase, count: phrase.count, years: phrase.years })
      if (selected.length === 2) break
    }

    result.set(word, {
      count: evidence.count,
      years: [...evidence.years].sort((left, right) => left - right),
      phrases: selected
    })
  }
  return result
}

const meaningsByWord = new Map()
const candidatesByWord = new Map()

for (const record of records) {
  const key = String(record.headword ?? '').toLowerCase()
  if (!idsByWord.has(key)) continue

  const meaning = parseMeaningLines(record.meaningLines ?? [])
  if (meaning) {
    const current = meaningsByWord.get(key)
    const currentScore = current ? current.split('；').length * 100 + current.length : -1
    const nextScore = meaning.split('；').length * 100 + meaning.length
    if (nextScore > currentScore) meaningsByWord.set(key, meaning)
  }

  const candidates = candidatesByWord.get(key) ?? []
  for (const part of splitCandidates(key, record.collocationLines ?? record.lines ?? [])) {
    const parsed = parseCandidate(key, part, record.page)
    if (!parsed) continue
    const phraseKey = parsed.phrase.toLowerCase()
    if (candidates.some((item) => item.phrase.toLowerCase() === phraseKey)) continue
    candidates.push(parsed)
  }
  candidatesByWord.set(key, candidates.slice(0, 3))
}

const examEvidenceByWord = buildExamEvidence(examText)
const details = []

for (const word of words) {
  const key = word.word.toLowerCase()
  const coreMeaning = meaningsByWord.get(key)
  const collocations = candidatesByWord.get(key) ?? []
  const exam = examEvidenceByWord.get(key)
  if (!coreMeaning && collocations.length === 0 && !exam) continue
  details.push({
    wordId: word.id,
    ...(coreMeaning ? { coreMeaning } : {}),
    collocations,
    ...(exam ? {
      exam: {
        count: exam.count,
        years: exam.years,
        phrases: exam.phrases
      }
    } : {})
  })
}

const serialized = JSON.stringify(details)
const fingerprint = createHash('sha256').update(serialized).digest('hex')
const coreMeaningCount = details.filter((detail) => detail.coreMeaning).length
const collocationCount = details.reduce((sum, detail) => sum + detail.collocations.length, 0)
const examEntryCount = details.filter((detail) => detail.exam).length
const examPhraseCount = details.reduce((sum, detail) => sum + (detail.exam?.phrases.length ?? 0), 0)

await writeFile(outputPath, `${JSON.stringify(details, null, 2)}\n`)
await writeFile(metaPath, `${JSON.stringify({
  version: 2,
  corpusFingerprint: corpusMeta.fingerprint,
  entryCount: details.length,
  coreMeaningCount,
  collocationCount,
  examEntryCount,
  examPhraseCount,
  examYears: examText ? [2010, 2025] : null,
  fingerprint
}, null, 2)}\n`)

console.log(`Wrote ${details.length} details: ${coreMeaningCount} meanings, ${collocationCount} red-book collocations, ${examEntryCount} exam words, ${examPhraseCount} exam phrases`)
