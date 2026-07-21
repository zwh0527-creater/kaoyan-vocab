import { useEffect, useMemo, useRef, useState } from 'react'
import { searchWords } from '../search'
import type { WordDetailEntry, WordEntry } from '../types'
import { loadWordDetail, loadWordSearchIndex } from '../wordDetails'
import { WordDetailSheet } from './WordDetailSheet'

interface SearchScreenProps {
  words: WordEntry[]
  masteredIds: number[]
  pendingMasteredIds: number[]
  onBack: () => void
  onNotify: (message: string) => void
}

type SearchStatus = 'mastered' | 'pending' | 'learning'

export function SearchScreen({
  words,
  masteredIds,
  pendingMasteredIds,
  onBack,
  onNotify
}: SearchScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [detailMeaningMap, setDetailMeaningMap] = useState<Map<number, string> | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<WordDetailEntry | undefined>()
  const [selectedWordId, setSelectedWordId] = useState<number | null>(null)
  const [indexLoading, setIndexLoading] = useState(true)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const mastered = useMemo(() => new Set(masteredIds), [masteredIds])
  const pending = useMemo(() => new Set(pendingMasteredIds), [pendingMasteredIds])

  useEffect(() => {
    inputRef.current?.focus()
    void loadWordSearchIndex()
      .then(setDetailMeaningMap)
      .catch(() => onNotify('离线词条索引暂时无法载入'))
      .finally(() => setIndexLoading(false))
  }, [onNotify])

  useEffect(() => {
    if (selectedWordId === null) {
      setSelectedDetail(undefined)
      setDetailsLoading(false)
      return
    }
    let active = true
    setSelectedDetail(undefined)
    setDetailsLoading(true)
    void loadWordDetail(selectedWordId)
      .then((detail) => {
        if (active) setSelectedDetail(detail)
      })
      .catch(() => onNotify('离线词条数据暂时无法载入'))
      .finally(() => {
        if (active) setDetailsLoading(false)
      })
    return () => {
      active = false
    }
  }, [onNotify, selectedWordId])

  const searchResult = useMemo(
    () => searchWords(words, detailMeaningMap, query),
    [detailMeaningMap, query, words]
  )

  const statusFor = (wordId: number): SearchStatus => {
    if (mastered.has(wordId)) return 'mastered'
    if (pending.has(wordId)) return 'pending'
    return 'learning'
  }
  const selectedWord = selectedWordId === null ? undefined : words[selectedWordId]
  const selectedStatus = selectedWord ? statusFor(selectedWord.id) : 'learning'

  return (
    <main className="search-page page">
      <header className="settings-header search-header">
        <button className="back-button" type="button" onClick={onBack}>返回</button>
        <h1>查词</h1>
      </header>

      <section className="search-intro">
        <h2>中文反查，也可以直接输入英文。</h2>
        <p>结果会同时告诉你这个词在熟词本里，还是仍在学习中。</p>
      </section>

      <div className="search-box">
        <label className="visually-hidden" htmlFor="word-search">输入英文单词或中文释义</label>
        <input
          ref={inputRef}
          id="word-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="例如：忽视 / neglect"
          autoComplete="off"
          enterKeyHint="search"
        />
        {query ? <button type="button" onClick={() => setQuery('')} aria-label="清空搜索">清空</button> : null}
      </div>

      <section className="search-results" aria-live="polite" aria-busy={indexLoading}>
        {!query ? (
          <div className="search-empty">
            <strong>{words.length} 个词都可以查</strong>
            <p>搜中文时会同时匹配大纲释义和红宝书补充释义；结果页优先显示大纲原文。</p>
          </div>
        ) : searchResult.matches.length ? (
          <>
            <p className="search-count">
              找到 {searchResult.total} 个结果{searchResult.total > 80 ? '，先显示前 80 个' : ''}
            </p>
            <div className="search-list">
              {searchResult.matches.map((word) => {
                const status = statusFor(word.id)
                const meaning = word.meaning
                return (
                  <button className="search-row" type="button" key={word.id} onClick={() => setSelectedWordId(word.id)}>
                    <span className="search-word">
                      <strong>{word.word}</strong>
                      <small>{word.phonetic}</small>
                    </span>
                    <span className={`search-status ${status}`}>
                      {status === 'mastered' ? '熟词' : status === 'pending' ? '本组已标熟' : '学习中'}
                    </span>
                    <span className="search-meaning">{meaning}</span>
                  </button>
                )
              })}
            </div>
          </>
        ) : indexLoading ? (
          <p className="search-message">正在载入离线释义…</p>
        ) : (
          <div className="search-empty no-result">
            <strong>没有找到</strong>
            <p>可以换成词根、完整英文或更短的中文关键词再试一次。</p>
          </div>
        )}
      </section>

      {selectedWord ? (
        <WordDetailSheet
          word={selectedWord}
          detail={selectedDetail}
          loading={detailsLoading}
          status={selectedStatus}
          onClose={() => setSelectedWordId(null)}
        />
      ) : null}
    </main>
  )
}
