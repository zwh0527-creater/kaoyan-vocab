import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const SHARD_SIZE = 128
const inputPath = process.argv[2] ?? 'src/data/word-details.json'
const outputDirectory = process.argv[3] ?? 'public/data/word-details'

const details = JSON.parse(await readFile(inputPath, 'utf8'))
if (!Array.isArray(details)) throw new Error('Word details must be an array')

await mkdir(outputDirectory, { recursive: true })
for (const filename of await readdir(outputDirectory)) {
  if (/^(?:\d{3}|search|manifest)\.json$/.test(filename)) {
    await unlink(join(outputDirectory, filename))
  }
}

const shards = new Map()
const searchIndex = []
let previousWordId = -1

for (const detail of details) {
  if (!Number.isInteger(detail.wordId) || detail.wordId <= previousWordId) {
    throw new Error(`Invalid or unsorted wordId: ${detail.wordId}`)
  }
  previousWordId = detail.wordId
  const shardId = Math.floor(detail.wordId / SHARD_SIZE)
  const shard = shards.get(shardId) ?? []
  shard.push(detail)
  shards.set(shardId, shard)
  if (detail.coreMeaning) searchIndex.push([detail.wordId, detail.coreMeaning])
}

let largestShardBytes = 0
for (const [shardId, entries] of shards) {
  const serialized = `${JSON.stringify(entries)}\n`
  largestShardBytes = Math.max(largestShardBytes, Buffer.byteLength(serialized))
  await writeFile(join(outputDirectory, `${String(shardId).padStart(3, '0')}.json`), serialized)
}

const sourceFingerprint = createHash('sha256').update(JSON.stringify(details)).digest('hex')
await writeFile(join(outputDirectory, 'search.json'), `${JSON.stringify(searchIndex)}\n`)
await writeFile(join(outputDirectory, 'manifest.json'), `${JSON.stringify({
  version: 1,
  shardSize: SHARD_SIZE,
  shardCount: shards.size,
  entryCount: details.length,
  searchEntryCount: searchIndex.length,
  sourceFingerprint
}, null, 2)}\n`)

console.log(`Prepared ${shards.size} detail shards; largest=${largestShardBytes} bytes; search=${searchIndex.length} entries`)
