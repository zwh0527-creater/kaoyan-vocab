import type { WordDetailEntry } from './types'

const SHARD_SIZE = 128
const dataBaseUrl = `${import.meta.env.BASE_URL}data/word-details/`
const shardPromises = new Map<number, Promise<Map<number, WordDetailEntry>>>()
let searchIndexPromise: Promise<Map<number, string>> | null = null

async function fetchJson<T>(filename: string): Promise<T> {
  const response = await fetch(`${dataBaseUrl}${filename}`)
  if (!response.ok) throw new Error(`Unable to load ${filename}`)
  return response.json() as Promise<T>
}

export function loadWordSearchIndex() {
  searchIndexPromise ??= fetchJson<Array<[number, string]>>('search.json')
    .then((entries) => new Map(entries))
    .catch((error) => {
      searchIndexPromise = null
      throw error
    })
  return searchIndexPromise
}

export async function loadWordDetail(wordId: number) {
  const shardId = Math.floor(wordId / SHARD_SIZE)
  let shardPromise = shardPromises.get(shardId)
  if (!shardPromise) {
    shardPromise = fetchJson<WordDetailEntry[]>(`${String(shardId).padStart(3, '0')}.json`)
      .then((entries) => new Map(entries.map((entry) => [entry.wordId, entry])))
      .catch((error) => {
        shardPromises.delete(shardId)
        throw error
      })
    shardPromises.set(shardId, shardPromise)
  }
  return (await shardPromise).get(wordId)
}
