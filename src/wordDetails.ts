import type { WordDetailEntry } from './types'

let detailsPromise: Promise<Map<number, WordDetailEntry>> | null = null

export function loadWordDetails() {
  detailsPromise ??= import('./data/word-details.json').then((module) => {
    const details = module.default as WordDetailEntry[]
    return new Map(details.map((detail) => [detail.wordId, detail]))
  })
  return detailsPromise
}
