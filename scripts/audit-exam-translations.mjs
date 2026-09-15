import { readFile, writeFile } from 'node:fs/promises'
import { buildReviewQueue } from './exam-translation-quality.mjs'

const [details, cache, words] = await Promise.all([
  'src/data/word-details.json', 'scripts/data/exam-translations.json', 'src/data/words.json'
].map(async (path) => JSON.parse(await readFile(path, 'utf8'))))
const sentences = buildReviewQueue(details, cache, words)
const report = {
  note: '按原句去重；优先级 0 为数据一致性错误，1 为疑似漏译或 OCR 问题，2 为其余机器译文，3 为未触发规则的非机器译文。启发式提示需人工核对，不能证明译文正确或错误。',
  summary: {
    uniqueSentences: sentences.length,
    references: sentences.reduce((sum, row) => sum + row.references.length, 0),
    priorities: Object.fromEntries([0, 1, 2, 3].map((p) => [p, sentences.filter((r) => r.priority === p).length]))
  },
  sentences
}
const outputIndex = process.argv.indexOf('--output')
if (outputIndex !== -1) {
  const path = process.argv[outputIndex + 1]
  if (!path || path.startsWith('--')) throw new Error('--output requires a file path')
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`)
}
console.log(JSON.stringify(report.summary, null, 2))
if (process.argv.includes('--check') && sentences.some((row) => row.priority === 0)) process.exitCode = 1
