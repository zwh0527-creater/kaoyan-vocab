import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyTranslationOverrides, attachTranslation, buildReviewQueue, translationOverrides } from './exam-translation-quality.mjs'

const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const details = read('src/data/word-details.json')
const cache = read('scripts/data/exam-translations.json')
const contexts = details.flatMap((d) => (d.exam?.phrases ?? []).flatMap((p) => p.contexts))

describe('shared exam translations', () => {
  it('keeps every displayed translation and question synchronized with its source', () => {
    const errors = buildReviewQueue(details, cache).filter((row) => row.priority === 0)
    expect(errors.map(({ text, reasons }) => ({ text, reasons }))).toEqual([])
    const actualFingerprint = createHash('sha256').update(JSON.stringify(details)).digest('hex')
    expect(read('src/data/word-details-meta.json').fingerprint).toBe(actualFingerprint)
  })

  it('applies reviewed sentences to every reference, without altering official answers elsewhere', () => {
    for (const [text, entry] of Object.entries(translationOverrides)) {
      expect(cache[text]).toEqual({ translation: entry.translation, source: 'curated' })
      const matches = contexts.filter((c) => c.text === text)
      expect(matches.length, text).toBeGreaterThan(0)
      for (const c of matches) {
        expect(c.translation, text).toBe(entry.translation)
        expect(c.translationSource).toBe('curated')
        expect(c.translationQuestion).toBeUndefined()
      }
    }
    const official = { translation: '官方译文', source: 'official-answer', question: '47' }
    expect(applyTranslationOverrides({ unrelated: official }).unrelated).toEqual(official)
  })

  it('preserves the corrected idiom and the omitted main clause', () => {
    const dayJobs = contexts.filter((c) => c.text.includes('have day-jobs'))
    expect(dayJobs.length).toBeGreaterThan(0)
    expect(dayJobs.every((c) => c.translation.includes('日常工作') && !c.translation.includes('一天工作'))).toBe(true)
    const accidents = contexts.filter((c) => c.text.startsWith('A string of accidents,'))
    expect(accidents.length).toBeGreaterThan(0)
    expect(accidents.every((c) => c.translation.includes('严重质疑') && c.translation.includes('安全') && c.translation.includes('管理'))).toBe(true)
  })

  it('never infers a correction from just a matching year or substring', () => {
    const text = Object.keys(translationOverrides)[0]
    expect(applyTranslationOverrides({})[`Prefix ${text}`]).toBeUndefined()
    const unrelated = { text: 'Another example', year: 2024, translation: '另一条例句', translationSource: 'local-machine' }
    expect(attachTranslation(unrelated, undefined)).toEqual(unrelated)
  })

  it('removes obsolete question numbers when the translation source changes', () => {
    const old = { text: 'Example', year: 2020, translationQuestion: 50 }
    for (const source of ['curated', 'local-machine']) {
      expect(attachTranslation(old, { translation: '示例', source, question: 47 }).translationQuestion).toBeUndefined()
    }
    expect(attachTranslation(old, { translation: '示例', source: 'official-answer', question: '47' }).translationQuestion).toBe(47)
    expect(attachTranslation(old, { translation: '示例', source: 'official-answer' }).translationQuestion).toBeUndefined()
  })

  it('deduplicates the review queue while retaining all word and phrase references', () => {
    const fixture = [{ wordId: 7, exam: { phrases: [
      { phrase: 'one', contexts: [{ text: 'Repeated example', year: 2020, translation: '甲', translationSource: 'local-machine' }] },
      { phrase: 'two', contexts: [{ text: 'Repeated example', year: 2021, translation: '乙', translationSource: 'curated', translationQuestion: 50 }] }
    ] } }]
    const queue = buildReviewQueue(fixture, { 'Repeated example': { translation: '甲', source: 'local-machine' } }, [{ id: 7, word: 'example' }])
    expect(queue).toHaveLength(1)
    expect(queue[0].priority).toBe(0)
    expect(queue[0].reasons).toEqual(expect.arrayContaining(['conflicting-translations', 'cache-drift', 'stale-question']))
    expect(queue[0].references.map((r) => [r.word, r.phrase, r.year])).toEqual([['example', 'one', 2020], ['example', 'two', 2021]])
    expect(buildReviewQueue(fixture, {})[0].reasons).toContain('missing-cache-entry')
  })

  it('is stable when the cleaning command is rerun and repairs stale source data', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vocab-translations-'))
    try {
      const detailPath = join(dir, 'details.json')
      const metaPath = join(dir, 'meta.json')
      const cachePath = join(dir, 'cache.json')
      const altered = structuredClone(details)
      const text = Object.keys(translationOverrides).find((t) => t.includes('regulatory scope'))
      const changed = altered.flatMap((d) => (d.exam?.phrases ?? []).flatMap((p) => p.contexts)).find((c) => c.text === text)
      Object.assign(changed, { translation: '旧机器译文', translationSource: 'local-machine', translationQuestion: 50 })
      writeFileSync(detailPath, JSON.stringify(altered))
      writeFileSync(metaPath, JSON.stringify(read('src/data/word-details-meta.json')))
      writeFileSync(cachePath, JSON.stringify({ ...cache, [text]: { translation: '旧机器译文', source: 'local-machine' } }))
      const args = ['scripts/sync-exam-translations.mjs', detailPath, metaPath, cachePath]
      execFileSync(process.execPath, args)
      const once = [detailPath, metaPath, cachePath].map((p) => readFileSync(p, 'utf8'))
      expect(read(detailPath)).toEqual(details)
      execFileSync(process.execPath, args)
      expect([detailPath, metaPath, cachePath].map((p) => readFileSync(p, 'utf8'))).toEqual(once)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('uses the same corrections and question rules in the Python generator, without a model', () => {
    execFileSync('python3', ['-B', '-c', `
import importlib.util, json
spec = importlib.util.spec_from_file_location('translations', 'scripts/build-exam-translations.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
for text, value in m.CURATED_TRANSLATIONS.items():
    assert m.curated_translation(text) == value['translation']
    assert m.normalize_context(text) == text
    assert m.curated_translation('Prefix ' + text) is None
for source in ('curated', 'local-machine', 'official-answer'):
    rows = [{'wordId': 1, 'exam': {'phrases': [{'contexts': [{'text': 'Example', 'year': 2020, 'translationQuestion': 50}]}]}}]
    result = m.attach_translations(rows, {'Example': {'translation': '示例', 'source': source, 'question': '47'}})
    context = result[0]['exam']['phrases'][0]['contexts'][0]
    assert context.get('translationQuestion') == (47 if source == 'official-answer' else None)
`])
  })
})
