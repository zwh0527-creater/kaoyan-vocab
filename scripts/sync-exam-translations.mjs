import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { applyTranslationOverrides, attachTranslation } from './exam-translation-quality.mjs'

const detailsPath = process.argv[2] ?? 'src/data/word-details.json'
const metaPath = process.argv[3] ?? 'src/data/word-details-meta.json'
const cachePath = process.argv[4] ?? 'scripts/data/exam-translations.json'
const [details, meta, cache] = await Promise.all([detailsPath, metaPath, cachePath]
  .map(async (path) => JSON.parse(await readFile(path, 'utf8'))))
const translations = applyTranslationOverrides(cache)
let updated = 0
for (const detail of details) {
  for (const phrase of detail.exam?.phrases ?? []) {
    phrase.contexts = phrase.contexts.map((context) => {
      const translated = translations[context.text]
      if (!translated) throw new Error(`Missing translation: ${context.text}`)
      const next = attachTranslation(context, translated)
      if (JSON.stringify(next) !== JSON.stringify(context)) updated += 1
      return next
    })
  }
}
meta.fingerprint = createHash('sha256').update(JSON.stringify(details)).digest('hex')
meta.examTranslationCount = details.reduce((total, detail) => total + (detail.exam?.phrases ?? [])
  .reduce((sum, phrase) => sum + phrase.contexts.filter((context) => context.translation).length, 0), 0)
await writeFile(cachePath, `${JSON.stringify(translations)}\n`)
await writeFile(detailsPath, `${JSON.stringify(details, null, 2)}\n`)
await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`)
console.log(JSON.stringify({ updatedContexts: updated }))
