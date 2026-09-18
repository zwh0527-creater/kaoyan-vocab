import { readFile, writeFile } from 'node:fs/promises'
import { applyTranslationOverrides, attachTranslation, reviewContext, pruneEmptyExamEntries, refreshDetailMetadata } from './exam-translation-quality.mjs'

const detailsPath = process.argv[2] ?? 'src/data/word-details.json'
const metaPath = process.argv[3] ?? 'src/data/word-details-meta.json'
const cachePath = process.argv[4] ?? 'scripts/data/exam-translations.json'
const [details, meta, cache] = await Promise.all([detailsPath, metaPath, cachePath]
  .map(async (path) => JSON.parse(await readFile(path, 'utf8'))))
const translations = applyTranslationOverrides(cache)
let updated = 0
for (const detail of details) {
  for (const phrase of detail.exam?.phrases ?? []) {
    phrase.contexts = phrase.contexts.flatMap((context) => {
      const reviewed = reviewContext(context)
      if (!reviewed) { updated += 1; return [] }
      const translated = translations[reviewed.text]
      if (!translated) throw new Error(`Missing translation: ${reviewed.text}`)
      const next = attachTranslation(reviewed, translated)
      if (JSON.stringify(next) !== JSON.stringify(context)) updated += 1
      return [next]
    })
  }
}
const cleanedDetails = pruneEmptyExamEntries(details)
const nextMeta = refreshDetailMetadata(meta, cleanedDetails)
await writeFile(cachePath, `${JSON.stringify(translations)}\n`)
await writeFile(detailsPath, `${JSON.stringify(cleanedDetails, null, 2)}\n`)
await writeFile(metaPath, `${JSON.stringify(nextMeta, null, 2)}\n`)
console.log(JSON.stringify({ updatedContexts: updated }))
