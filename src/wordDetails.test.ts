import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('word detail loader', () => {
  it('loads and reuses only the shard that contains the requested word', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { wordId: 1948, coreMeaning: '交通，交通量', collocations: [] },
        { wordId: 1949, coreMeaning: '困扰', collocations: [] },
      ],
    })
    vi.stubGlobal('fetch', fetchMock)
    const { loadWordDetail } = await import('./wordDetails')

    await expect(loadWordDetail(1948)).resolves.toMatchObject({ wordId: 1948 })
    await expect(loadWordDetail(1949)).resolves.toMatchObject({ wordId: 1949 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/data/word-details/015.json')
  })

  it('allows a failed shard request to be retried', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ wordId: 1948, collocations: [] }],
      })
    vi.stubGlobal('fetch', fetchMock)
    const { loadWordDetail } = await import('./wordDetails')

    await expect(loadWordDetail(1948)).rejects.toThrow('Unable to load 015.json')
    await expect(loadWordDetail(1948)).resolves.toMatchObject({ wordId: 1948 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('loads the compact Chinese search index separately', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [[1948, '交通，交通量']],
    })
    vi.stubGlobal('fetch', fetchMock)
    const { loadWordSearchIndex } = await import('./wordDetails')

    const index = await loadWordSearchIndex()
    expect(index.get(1948)).toBe('交通，交通量')
    expect(fetchMock).toHaveBeenCalledWith('/data/word-details/search.json')
  })
})
