import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const DEFAULT_PDF = '考研大纲词汇乱序版.pdf'
const input = resolve(process.argv[2] ?? DEFAULT_PDF)
const outputDir = resolve(process.argv[3] ?? 'src/data')
const tempDir = mkdtempSync(join(tmpdir(), 'kaoyan-vocab-'))
const textPath = join(tempDir, 'vocab.txt')

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim()
}

export function parsePage(pageText, sourcePage, startingId) {
  const entries = []
  const pageMarker = /第\s*[０-９0-9]+\s*[／/]\s*[０-９0-9]+页/

  for (const rawLine of pageText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || pageMarker.test(line)) continue

    // WPS stores the abound/upgrade rows with overlapping text objects. pdftotext
    // interleaves both rows, so preserve the visually rendered PDF values here.
    if (sourcePage === 91 && line.startsWith('abound')) {
      const id = startingId + entries.length
      entries.push({
        id,
        word: 'abound',
        phonetic: "/ə'baund/",
        meaning: 'vi.大量存在；(in，with)充满，富于',
        sourcePage,
        originalOrder: id
      })
      continue
    }
    if (sourcePage === 91 && line.startsWith("/' ʌ")) continue
    if (sourcePage === 91 && line.startsWith('upgrade')) {
      const id = startingId + entries.length
      entries.push({
        id,
        word: 'upgrade',
        phonetic: "/ˌʌp'greid/",
        meaning: 'v.提升,使升级',
        sourcePage,
        originalOrder: id
      })
      continue
    }

    const headwordMatch = line.match(/^([A-Za-z][A-Za-z'(). -]*?)\s{2,}(.+)$/)
    if (!headwordMatch) {
      throw new Error(`第 ${sourcePage} 页存在无法识别的词条行：${line}`)
    }
    const word = normalizeText(headwordMatch[1])
    const rest = headwordMatch[2].trim()
    let phonetic = ''
    let meaning = ''

    if (rest.startsWith('/')) {
      const end = rest.indexOf('/', 1)
      if (end > 0) {
        phonetic = normalizeText(rest.slice(0, end + 1))
        meaning = normalizeText(rest.slice(end + 1))
      }
    } else if (rest.startsWith('[')) {
      const end = rest.indexOf(']', 1)
      if (end > 0) {
        phonetic = normalizeText(rest.slice(0, end + 1))
        meaning = normalizeText(rest.slice(end + 1))
      }
    } else {
      const columns = rest.split(/\s{2,}/).map(normalizeText)
      if (columns.length >= 2) {
        phonetic = columns[0]
        meaning = normalizeText(columns.slice(1).join(' '))
      }
    }

    if (!word || !phonetic || !meaning) {
      throw new Error(`第 ${sourcePage} 页存在无法拆分的词条行：${line}`)
    }
    const id = startingId + entries.length
    entries.push({
      id,
      word,
      phonetic,
      meaning,
      sourcePage,
      originalOrder: id
    })
  }
  return entries
}

try {
  execFileSync('pdftotext', ['-layout', input, textPath], { stdio: 'inherit' })
  const pages = readFileSync(textPath, 'utf8').split('\f').filter((page) => page.trim())
  const words = []
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    words.push(...parsePage(pages[pageIndex], pageIndex + 1, words.length))
  }

  if (pages.length !== 117) throw new Error(`PDF 页数应为 117，实际解析为 ${pages.length}`)
  if (words.length !== 5493) throw new Error(`词条数应为 5493，实际解析为 ${words.length}`)

  const serializedWords = JSON.stringify(words)
  const fingerprint = createHash('sha256').update(serializedWords).digest('hex')
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, 'words.json'), `${JSON.stringify(words, null, 2)}\n`)
  writeFileSync(
    join(outputDir, 'corpus-meta.json'),
    `${JSON.stringify({ fingerprint, wordCount: words.length, pageCount: pages.length }, null, 2)}\n`
  )
  console.log(`已生成 ${words.length} 条词汇，指纹 ${fingerprint}`)
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
