import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

function argument(name) {
  const index = process.argv.indexOf(name)
  if (index === -1 || !process.argv[index + 1]) throw new Error(`Missing ${name}`)
  return process.argv[index + 1]
}

const wordsPath = argument('--words')
const ocrPath = argument('--ocr')
const outputPath = argument('--output')
const metaPath = argument('--meta')
const corpusMetaPath = argument('--corpus-meta')

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
  return value
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

function splitCandidates(headword, lines) {
  return lines.flatMap((line) => {
    const normalized = line
      .replace(/[【\[]?词组[】\]]?/g, ' ')
      .replace(/（或\s*([a-z]+)）/gi, ' (or $1) ')
      .replace(/[~～]/g, headword)
    return normalized
      .split(/(?=[①②③④⑤⑥⑦⑧⑨⑩])/)
      .map((part) => part.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, ''))
      .filter((part) => cleanText(part) !== '')
  })
}

function parseCandidate(headword, candidate) {
  const text = cleanText(candidate)
  const chineseIndex = text.search(/[\u3400-\u9fff]/)
  if (chineseIndex < 1) return null
  const phrase = cleanText(text.slice(0, chineseIndex))
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
  return { phrase, meaning, relevance: 'postgraduate' }
}

const candidatesByWord = new Map()
for (const record of records) {
  const key = String(record.headword ?? '').toLowerCase()
  if (!idsByWord.has(key) || !Array.isArray(record.lines)) continue
  const candidates = candidatesByWord.get(key) ?? []
  for (const part of splitCandidates(key, record.lines)) {
    const parsed = parseCandidate(key, part)
    if (!parsed) continue
    const phraseKey = parsed.phrase.toLowerCase()
    if (candidates.some((item) => item.phrase.toLowerCase() === phraseKey)) continue
    candidates.push(parsed)
  }
  candidatesByWord.set(key, candidates.slice(0, 3))
}

const details = []
for (const word of words) {
  const collocations = candidatesByWord.get(word.word.toLowerCase()) ?? []
  if (collocations.length > 0) details.push({ wordId: word.id, collocations })
}

const serialized = JSON.stringify(details)
const fingerprint = createHash('sha256').update(serialized).digest('hex')
await writeFile(outputPath, `${JSON.stringify(details, null, 2)}\n`)
await writeFile(metaPath, `${JSON.stringify({
  version: 1,
  corpusFingerprint: corpusMeta.fingerprint,
  entryCount: details.length,
  collocationCount: details.reduce((sum, detail) => sum + detail.collocations.length, 0),
  fingerprint
}, null, 2)}\n`)

console.log(`Wrote ${details.length} word details with ${details.reduce((sum, detail) => sum + detail.collocations.length, 0)} collocations`)
