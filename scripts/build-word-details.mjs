import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { assessCoreMeaning, syllabusExamSense } from './word-detail-quality.mjs'

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
const examTranslationsPath = optionalArgument('--exam-translations')
const studyMeaningsPath = optionalArgument('--study-meanings')

const words = JSON.parse(await readFile(wordsPath, 'utf8'))
const corpusMeta = JSON.parse(await readFile(corpusMetaPath, 'utf8'))
const studyMeanings = studyMeaningsPath
  ? JSON.parse(await readFile(studyMeaningsPath, 'utf8'))
  : []
const rawLines = (await readFile(ocrPath, 'utf8')).split(/\r?\n/).filter(Boolean)
const records = rawLines.map((line) => JSON.parse(line))
const recordsByHeadword = new Map()
for (const record of records) {
  const key = String(record.headword ?? '').toLowerCase()
  const grouped = recordsByHeadword.get(key) ?? []
  grouped.push(record)
  recordsByHeadword.set(key, grouped)
}
const selectedRecords = records.filter((record) => {
  const key = String(record.headword ?? '').toLowerCase()
  const grouped = recordsByHeadword.get(key) ?? []
  if (grouped.length <= 1) return true
  const bestHeaderHeight = Math.max(...grouped.map((item) => Number(item.headerHeight ?? 0)))
  return Number(record.headerHeight ?? 0) === bestHeaderHeight
})
const examTranslations = examTranslationsPath
  ? JSON.parse(await readFile(examTranslationsPath, 'utf8'))
  : {}
const idsByWord = new Map()

for (const word of words) {
  const key = word.word.toLowerCase()
  const ids = idsByWord.get(key) ?? []
  ids.push(word.id)
  idsByWord.set(key, ids)
}
const canonicalWordKeys = new Set(idsByWord.keys())

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
  'sb', 'sth', 'somebody', 'someone', 'something', 'oneself', 'one', 'another', 'either', 'neither'
])

function inflectHeadword(headword, suffix) {
  if (suffix === 'd' || suffix === 'ed') return headword.endsWith('e') ? `${headword}d` : `${headword}ed`
  if (suffix === 'ing') return headword.endsWith('e') ? `${headword.slice(0, -1)}ing` : `${headword}ing`
  if (suffix === 's') return /(?:s|x|z|ch|sh)$/i.test(headword) ? `${headword}es` : `${headword}s`
  return headword
}

function expandTilde(value, headword) {
  return String(value)
    .replace(/~\s*(ed|ing|d|s)\b/gi, (_, suffix) => inflectHeadword(headword, suffix.toLowerCase()))
    .replace(/~(?=[A-Za-z])/g, `${headword} `)
    .replace(/~/g, headword)
}

function meaningChunks(lines) {
  const chunks = []
  let current = []
  for (const rawLine of lines) {
    const line = cleanText(rawLine)
    const startsSense = line.includes('词义') || senseMarker.test(line)
    if (startsSense && current.length) {
      chunks.push(current.join(' '))
      current = []
    }
    if (startsSense || current.length) current.push(line)
  }
  if (current.length) chunks.push(current.join(' '))
  return chunks
}

function parseRedbookExamples(headword, lines, page) {
  const examples = []
  for (const chunk of meaningChunks(lines)) {
    const colonIndex = chunk.search(/[:：]/)
    if (colonIndex < 0) continue
    const remainder = chunk.slice(colonIndex + 1).trim()
    const englishStart = remainder.search(/[A-Za-z~]/)
    if (englishStart < 0) continue
    const candidate = remainder.slice(englishStart)
    const chineseIndex = candidate.search(/[\u3400-\u9fff]/)
    if (chineseIndex < 2) continue

    const sentence = cleanText(expandTilde(candidate.slice(0, chineseIndex), headword))
      .replace(/\b(sb|sth)\.(?=[A-Za-z])/gi, '$1. ')
      .replace(/\breguested\b/gi, 'requested')
      .replace(/\btoveke\b/gi, 'twelve')
      .replace(/\s+([,.!?;:])/g, '$1')
    const meaning = cleanText(candidate.slice(chineseIndex))
      .replace(/[•⋯…]+/g, '…')
      .replace(/…?\d{1,3}[。. ]+红宝书.*$/g, '')
      .replace(/(?:【|\[).+$/g, '')
      .replace(/(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '')
      .trim()
    const normalizedHeadword = headword.replace(/[^a-z]/gi, '').toLowerCase()
    const normalizedSentence = sentence.replace(/[^a-z]/gi, '').toLowerCase()
    if (sentence.length < 3 || sentence.length > 220 || meaning.length < 2 || meaning.length > 180) continue
    if (!normalizedSentence.includes(normalizedHeadword.slice(0, Math.min(4, normalizedHeadword.length)))) continue
    if (/[�□■◆【】]/.test(sentence + meaning) || /[A-Za-z]/.test(meaning)) continue

    const unknownTokens = (sentence.toLowerCase().match(/[a-z]+/g) ?? [])
      .filter((token) => token.length >= 5 && !phraseLexicon.has(token) && !token.startsWith(normalizedHeadword.slice(0, 4)))
    if (unknownTokens.length > 0) continue
    if (examples.some((item) => item.sentence.toLowerCase() === sentence.toLowerCase())) continue
    examples.push({ sentence, meaning, sourcePage: page })
  }
  return examples.slice(0, 3)
}

const relationLabels = new Map([
  ['同义', 'synonym'],
  ['同必', 'synonym'],
  ['近义', 'synonym'],
  ['反义', 'antonym'],
  ['派生', 'derivative']
])

function parseRelatedWords(headword, lines, page) {
  const related = []
  let currentRelation = null
  for (const rawLine of lines) {
    const line = cleanText(rawLine)
    for (const [marker, relation] of relationLabels) {
      if (line.includes(marker)) {
        currentRelation = relation
        break
      }
    }
    if (!currentRelation) continue
    for (const token of line.toLowerCase().match(/[a-z][a-z'-]*/g) ?? []) {
      const key = token.replace(/^'+|'+$/g, '')
      if (key === headword || !idsByWord.has(key)) continue
      const sourceWord = words[idsByWord.get(key)[0]]
      if (!sourceWord || related.some((item) => item.relation === currentRelation && item.word === sourceWord.word)) continue
      related.push({
        relation: currentRelation,
        word: sourceWord.word,
        meaning: sourceWord.meaning,
        sourcePage: page
      })
    }
  }
  return related.slice(0, 8)
}

function parseCandidate(headword, candidate, page) {
  const text = cleanText(candidate)
  const chineseIndex = text.search(/[\u3400-\u9fff]/)
  if (chineseIndex < 1) return null
  const phrase = cleanText(text.slice(0, chineseIndex))
    .replace(/（/g, ' (')
    .replace(/）/g, ') ')
    .replace(/\b(sb|sth)\.(?=[A-Za-z])/gi, '$1. ')
    .replace(/[•⋯…]+$/g, '')
    .replace(/\s+/g, ' ')
  const meaning = cleanText(text.slice(chineseIndex).split(/[:：]/, 1)[0])
    .replace(/[•⋯…]+/g, '…')
  if (phrase.length < 2 || phrase.length > 80 || meaning.length < 1 || meaning.length > 120) return null
  if (!/[a-z]/i.test(phrase) || /[\u3400-\u9fff]/.test(phrase)) return null
  if (/[�□■◆•\[\]【】]/.test(phrase + meaning)) return null
  if (/[A-Za-z]{4,}/.test(meaning)) return null
  if ((phrase.match(/[.!?]/g) ?? []).length > 3) return null
  if (phrase.split(/\s+/).length > 12) return null
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
const examOptionLine = /^\s*(?:\[\s*[A-G](?:\s*[A-Z])?\s*\]?|[A-G][.)])\s*/i
const examInstructionLine = /^\s*(?:Directions:|Choose the best|Mark your answers|Read the following)/i

function normalizeExamContextText(value) {
  const literalRepairs = [
    [/about-fkce/gi, 'about-face'],
    [/backloadedpublic/gi, 'backloaded public'],
    [/equ ities/gi, 'equities'],
    [/firiends/gi, 'friends'],
    [/\bfiom\b/gi, 'from'],
    [/judgm ent/gi, 'judgment'],
    [/on ce/gi, 'once'],
    [/thoughtfill/gi, 'thoughtful'],
    [/unammous/gi, 'unanimous'],
    [/who5ve/gi, "who've"],
    [/thafs/gi, "that's"],
    [/ifs safer/gi, "it's safer"],
    [/courfs judges/gi, "court's judges"],
    [/Federal Circuifs/gi, "Federal Circuit's"],
    [/wouldVe/gi, "would've"],
    [/big-cily/gi, 'big-city'],
    [/soul-cmshingly/gi, 'soul-crushingly'],
    [/ccthe/gi, '"the'],
    [/describingdifferent/gi, 'describing different'],
    [/indifferent shoes/gi, 'in different shoes'],
    [/diferent/gi, 'different'],
    [/huntergatherer/gi, 'hunter-gatherer'],
    [/canwe/gi, 'can we'],
    [/ifwe/gi, 'if we'],
    [/comingfrom/gi, 'coming from'],
    [/shel£/gi, 'shelf'],
    [/iT unes/gi, 'iTunes'],
    [/onthe/gi, 'on the'],
    [/A n A nsw er/gi, 'An Answer'],
    [/Enlightenm ent/gi, 'Enlightenment']
  ]
  let text = String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/、/g, ',')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
  for (const [pattern, replacement] of literalRepairs) text = text.replace(pattern, replacement)
  text = text
    .replace(/CE O/g, 'CEO')
    .replace(/W eb/g, 'Web')
    .replace(/F A SB/g, 'FASB')
    .replace(/\b([A-Za-z]+)[59]\s+s\b/g, "$1's")
    .replace(/\b([A-Za-z]+)[59]s\b/g, "$1's")
    .replace(/\b([A-Za-z]+)[59](?=\s+[A-Za-z])/g, "$1'")
    .replace(/\b([A-Za-z]+)5ve\b/gi, "$1've")
    .replace(/(?<=[a-z])\/[59](?=\s|$)/g, ',"')
    .replace(/(?<=[a-z])[56]{2}(?=\s|$)/g, '"')
    .replace(/(?<!\d)66(?=[A-Za-z])/g, '"')
    .replace(/\b(20)\s+(\d)\s+(\d)\b/g, '$1$2$3')
    .replace(/\b(20)\s+(\d{2})\b/g, '$1$2')
    .replace(/\b([B-HJ-Z])\s+([a-z]{2,})\b/g, '$1$2')
    .replace(/\bA\s+(merica|ugust|fter|nd|ccounting|ppeals|llen|ccording|t|s|nyway|chievement|ll|nnette)\b/gi, (_, rest) => `A${rest}`)
    .replace(/\bA\s+m\s+erica\b/gi, 'America')
    .replace(/\bI\s+(n|t|s)\b/g, (_, rest) => `I${rest}`)
    .replace(/\bW\s+e\b/g, 'We')
    .replace(/\bH\s+e\b/g, 'He')
    .replace(/\bM\s+r\b/g, 'Mr')
    .replace(/\b(?:m\s+ost|f\s+ar|par\s+t)\b/g, (match) => match.replace(/\s+/g, ''))
    .replace(/\bdispropor\s+tionately\b/gi, 'disproportionately')
    .replace(/\bGeneration\s+Z(?=(?:need|seeking)\b)/g, 'Generation Z ')
    .replace(/\bAl(?=\s+art\b)/g, 'AI')
    .replace(/\b(2010)\s+s\b/g, '$1s')
    .replace(/\/J\s+We\b/g, '. We')
    .replace(/(?<=[A-Za-z])—(?=[A-Za-z])/g, ' — ')
    .replace(/\b(?:[A-Z]\s+){2,}[A-Z]\b/g, (match) => match.replace(/\s+/g, ''))
    .replace(/^\s*Text\s*\d+\s+/i, '')
    .replace(/^\s*\(\s*(4[1-9]|50)\s*\)\s*(?!_)/, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return text
}

function isReliableExamContext(text) {
  if (text.length < 28 || text.length > 520 || !/[A-Za-z]/.test(text)) return false
  if (/_{2,}|�|□|■|◆/.test(text)) return false
  if (/^(?:Directions|Part\s+[A-C]|Section\b|Choose the best|Read the following|In your essay|According to (?:Paragraph|the text)|Which of the following|What does |The author's attitude)/i.test(text)) return false
  if (/\d{4}\s*年\s*英语|第\s*\d+\s*页|\bquestions?\s+\d+/i.test(text)) return false
  if (/(?:^|\s)(?:[1-4]?\d|50)$/.test(text) || /\b[A-Za-z]+\d+[A-Za-z]*\b/.test(text) || /_\s*\d+\s*_/.test(text)) return false
  const blankNumbers = text.match(/(?<!\d)\b(?:[1-9]|[1-3]\d|40)\b(?!\d)/g) ?? []
  const words = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []
  if (blankNumbers.length > 0 || words.length < 6) return false
  if (/^[\s'"]*[a-z]/.test(text)) return false
  if (/\b[A-Z]$/.test(text) || /extra choices?.+blanks?/i.test(text)) return false
  if (/(?:fit in with|best title for|learned from).+\btext\b/i.test(text)) return false
  if (/(?:Part\s+B|list\s+A-G|numbered paragraphs)/i.test(text)) return false
  if (/\b(?:Mr|Mrs|Ms|Dr|St|U\.?S\.?)$/.test(text)) return false
  return true
}

function examContextAround(fragment, surface) {
  const text = normalizeExamContextText(cleanText(fragment)
    .replace(/\^[a-z]?/gi, '')
    .replace(/\bfbr\b/gi, 'for')
    .replace(/\bbom\b/g, 'born')
    .replace(/\bT he\b/g, 'The')
    .replace(/\bT his\b/g, 'This')
    .replace(/\bT hat\b/g, 'That')
    .replace(/\bT hese\b/g, 'These')
    .replace(/\bW ith\b/g, 'With')
    .replace(/\bW hen\b/g, 'When')
    .replace(/\bW here\b/g, 'Where')
    .replace(/\bW hile\b/g, 'While')
    .replace(/\bF or\b/g, 'For')
    .replace(/\bF rom\b/g, 'From')
    .replace(/\bY et\b/g, 'Yet')
    .replace(/\bA llen\b/g, 'Allen')
    .replace(/\bA ccording\b/g, 'According')
    .replace(/\bP aragraph\b/g, 'Paragraph')
    .replace(/\bM c(?=[A-Z])/g, 'Mc')
    .replace(/\bIA SB\b/g, 'IASB')
    .replace(/\bU niversity\b/g, 'University')
    .replace(/\bN oam\b/g, 'Noam')
    .replace(/\btoartifacts\b/gi, 'to artifacts')
    .replace(/\s+([,.:])/g, '$1')
    .replace(/\s+/g, ' '))
  const index = text.toLowerCase().indexOf(surface.toLowerCase())
  if (index < 0) return null
  if (text.length <= 440) return isReliableExamContext(text) ? text : null
  const start = Math.max(0, index - 165)
  const end = Math.min(text.length, index + surface.length + 255)
  const context = `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
  if (/\b\d{1,2}\s*$/.test(context)) return null
  return isReliableExamContext(context) ? context : null
}

function buildExamEvidence(rawText) {
  const evidenceByWord = new Map()
  let currentYear = null

  for (const page of rawText.split('\f')) {
    const yearMatch = page.match(/(20(?:1\d|2[0-5]))\s*年/)
    if (yearMatch) currentYear = Number(yearMatch[1])
    if (!currentYear) continue

    const fragments = page
      .split('\n')
      .filter((line) => !examOptionLine.test(line) && !examInstructionLine.test(line))
      .join(' ')
      .replace(/-\s+(?=[a-z])/gi, '')
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
        const canonicalWords = wordCandidatesForToken(surface, canonicalWordKeys)
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
            const existing = evidence.phrases.get(phrase) ?? { count: 0, years: new Set(), contexts: new Map() }
            existing.count += 1
            existing.years.add(currentYear)
            const context = examContextAround(cleanedFragment, surface)
            if (context && !existing.contexts.has(context)) existing.contexts.set(context, currentYear)
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
        const startsWithTarget = wordCandidatesForToken(tokens[0], canonicalWordKeys).includes(word)
        const endsWithTarget = wordCandidatesForToken(tokens[tokens.length - 1], canonicalWordKeys).includes(word)
        const weakLeadingContext = endsWithTarget && tokens.slice(0, -1).every((token) => connectorWords.has(token) || weakContextWords.has(token))
        const weakTrailingContext = startsWithTarget && tokens.slice(1).every((token) => weakContextWords.has(token))
        if (weakLeadingContext || weakTrailingContext || stats.contexts.size === 0) return null
        const genericPenalty = tokens.some((token) => genericExamWords.has(token)) ? 24 : 0
        const leadingConnectorPenalty = connectorWords.has(tokens[0]) ? 18 : 0
        const lengthScore = tokens.length === 2 ? 12 : tokens.length === 3 ? 8 : tokens.length === 4 ? 4 : 0
        return {
          phrase,
          count: stats.count,
          years: [...stats.years].sort((left, right) => left - right),
          contexts: [...stats.contexts.entries()]
            .map(([context, year]) => ({ context, year }))
            .sort((left, right) => {
              const leftContains = left.context.toLowerCase().includes(phrase) ? 0 : 1
              const rightContains = right.context.toLowerCase().includes(phrase) ? 0 : 1
              return leftContains - rightContains || left.context.length - right.context.length
            }),
          score: stats.count * 30 + stats.years.size * 12 + lengthScore + (containsConnector ? 5 : 0) +
            (startsWithTarget ? 20 : 0) + (endsWithTarget ? 4 : 0) - genericPenalty - leadingConnectorPenalty
        }
      })
      .filter(Boolean)
      .sort((left, right) => right.score - left.score || left.phrase.length - right.phrase.length)

    const selected = []
    for (const phrase of phrases) {
      if (selected.some((item) => item.phrase.includes(phrase.phrase) || phrase.phrase.includes(item.phrase))) continue
      selected.push({
        phrase: phrase.phrase,
        count: phrase.count,
        years: phrase.years,
        contexts: phrase.contexts.slice(0, 2).map((item) => ({ text: item.context, year: item.year }))
      })
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

function examUsageHint(wordKey, phrase, context) {
  const tokens = phrase.toLowerCase().split(/\s+/)
  const targetIndex = tokens.findIndex((token) => wordCandidatesForToken(token, canonicalWordKeys).includes(wordKey))
  if (targetIndex < 0) return null
  const surface = tokens[targetIndex]
  const previous = tokens[targetIndex - 1]
  const next = tokens[targetIndex + 1]
  const hints = []

  if (wordKey === 'due' && /\b(?:be|is|are|was|were|been|being)\s+due\s+to\s+do\b/i.test(context ?? '')) {
    return '结构：be due to + 动词原形，表示“预定、预计……”'
  }

  if (surface !== wordKey) hints.push(`此处使用 ${wordKey} 的 ${surface} 形式`)
  if (previous === 'by') hints.push(`结构：by + ${surface}，常见于被动表达`)
  if (next) {
    const complements = {
      of: '名词/代词，表示所属或对象',
      to: '名词或动词原形',
      for: '名词/代词，表示对象、原因或目的',
      by: '动作发出者或方式',
      with: '名词/代词，表示伴随或对象',
      in: '名词/动名词，表示范围或状态',
      on: '名词/动名词，表示对象或方面',
      from: '名词/代词，表示来源或分离',
      as: '名词，表示身份或作用'
    }
    if (complements[next]) hints.push(`结构：${surface} ${next} + ${complements[next]}`)
  }
  return hints.length ? hints.join('；') : null
}

function applyExamTranslations(item) {
  const contexts = item.contexts.flatMap((context) => {
    const translated = examTranslations[context.text]
    if (!translated) return examTranslationsPath ? [] : [context]
    return [{
      ...context,
      translation: translated.translation,
      translationSource: translated.source,
      ...(translated.question ? { translationQuestion: Number(translated.question) } : {})
    }]
  })
  return {
    ...item,
    contexts
  }
}

function enrichExamPhrase(wordKey, word, item) {
  const usage = examUsageHint(wordKey, item.phrase, item.contexts[0]?.text)
  return applyExamTranslations({
    ...item,
    meaning: studyMeanings[word.id]?.meaning ?? syllabusExamSense(word.meaning),
    ...(usage ? { usage } : {})
  })
}

const meaningsByWord = new Map()
const candidatesByWord = new Map()
const examplesByWord = new Map()
const relatedByWord = new Map()
const redbookInfoByWord = new Map()

for (const record of selectedRecords) {
  const key = String(record.headword ?? '').toLowerCase()
  if (!idsByWord.has(key)) continue

  const currentInfo = redbookInfoByWord.get(key)
  redbookInfoByWord.set(key, {
    sourcePage: currentInfo?.sourcePage ?? record.page,
    hasCollocationSection: Boolean(currentInfo?.hasCollocationSection || (record.collocationLines?.length ?? 0) > 0)
  })

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
  candidatesByWord.set(key, candidates.slice(0, 5))

  const examples = examplesByWord.get(key) ?? []
  for (const example of parseRedbookExamples(key, record.meaningLines ?? [], record.page)) {
    if (examples.some((item) => item.sentence.toLowerCase() === example.sentence.toLowerCase())) continue
    examples.push(example)
  }
  examplesByWord.set(key, examples.slice(0, 3))

  const relatedWords = relatedByWord.get(key) ?? []
  for (const related of parseRelatedWords(key, record.relatedLines ?? [], record.page)) {
    if (relatedWords.some((item) => item.relation === related.relation && item.word === related.word)) continue
    relatedWords.push(related)
  }
  relatedByWord.set(key, relatedWords.slice(0, 8))
}

const examEvidenceByWord = buildExamEvidence(examText)
const details = []

for (const word of words) {
  const key = word.word.toLowerCase()
  const sameHeadwordEntries = (idsByWord.get(key) ?? []).map((id) => words[id])
  const rawCoreMeaning = meaningsByWord.get(key)
  const coreIssue = rawCoreMeaning
    ? assessCoreMeaning(word, rawCoreMeaning, sameHeadwordEntries)
    : null
  const discardRedbook = coreIssue === 'semantic-mismatch' || coreIssue === 'ambiguous-case'
  const coreMeaning = undefined
  const collocations = discardRedbook ? [] : candidatesByWord.get(key) ?? []
  const examples = discardRedbook ? [] : examplesByWord.get(key) ?? []
  const relatedWords = discardRedbook ? [] : relatedByWord.get(key) ?? []
  const redbook = discardRedbook ? undefined : redbookInfoByWord.get(key)
  const exam = coreIssue === 'ambiguous-case' ? undefined : examEvidenceByWord.get(key)
  if (!coreMeaning && collocations.length === 0 && examples.length === 0 && relatedWords.length === 0 && !redbook && !exam) continue
  details.push({
    wordId: word.id,
    ...(coreMeaning ? { coreMeaning } : {}),
    collocations,
    ...(examples.length ? { examples } : {}),
    ...(relatedWords.length ? { relatedWords } : {}),
    ...(redbook ? { redbook } : {}),
    ...(exam ? {
      exam: {
        count: exam.count,
        years: exam.years,
        phrases: exam.phrases
          .map((item) => enrichExamPhrase(key, word, item))
          .filter((item) => item.contexts.length > 0)
      }
    } : {})
  })
}

const serialized = JSON.stringify(details)
const fingerprint = createHash('sha256').update(serialized).digest('hex')
const coreMeaningCount = details.filter((detail) => detail.coreMeaning).length
const collocationCount = details.reduce((sum, detail) => sum + detail.collocations.length, 0)
const redbookEntryCount = details.filter((detail) => detail.redbook).length
const collocationSectionCount = details.filter((detail) => detail.redbook?.hasCollocationSection).length
const unparsedCollocationSectionCount = details.filter((detail) => detail.redbook?.hasCollocationSection && detail.collocations.length === 0).length
const exampleCount = details.reduce((sum, detail) => sum + (detail.examples?.length ?? 0), 0)
const relatedWordCount = details.reduce((sum, detail) => sum + (detail.relatedWords?.length ?? 0), 0)
const examEntryCount = details.filter((detail) => detail.exam).length
const examPhraseCount = details.reduce((sum, detail) => sum + (detail.exam?.phrases.length ?? 0), 0)
const examContextCount = details.reduce((sum, detail) => sum + (detail.exam?.phrases ?? [])
  .reduce((phraseSum, phrase) => phraseSum + phrase.contexts.length, 0), 0)
const examTranslationCount = details.reduce((sum, detail) => sum + (detail.exam?.phrases ?? [])
  .reduce((phraseSum, phrase) => phraseSum + phrase.contexts.filter((context) => context.translation).length, 0), 0)

await writeFile(outputPath, `${JSON.stringify(details, null, 2)}\n`)
await writeFile(metaPath, `${JSON.stringify({
  version: 4,
  corpusFingerprint: corpusMeta.fingerprint,
  entryCount: details.length,
  coreMeaningCount,
  collocationCount,
  redbookEntryCount,
  collocationSectionCount,
  unparsedCollocationSectionCount,
  exampleCount,
  relatedWordCount,
  examEntryCount,
  examPhraseCount,
  examContextCount,
  examTranslationCount,
  examYears: examText ? [2010, 2025] : null,
  fingerprint
}, null, 2)}\n`)

console.log(`Wrote ${details.length} details: ${coreMeaningCount} meanings, ${collocationCount} red-book collocations, ${exampleCount} examples, ${relatedWordCount} related words, ${examEntryCount} exam words, ${examPhraseCount} exam phrases, ${examTranslationCount}/${examContextCount} translated contexts`)
