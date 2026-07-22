import { useEffect, useMemo, useRef, useState } from 'react'
import { searchWords } from '../search'
import { studyMeaningFor } from '../studyMeanings'
import type { WordDetailEntry, WordEntry } from '../types'
import { loadWordDetail } from '../wordDetails'
import { wordLengthClass } from '../wordDisplay'
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
  const [selectedDetail, setSelectedDetail] = useState<WordDetailEntry | undefined>()
  const [selectedWordId, setSelectedWordId] = useState<number | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const mastered = useMemo(() => new Set(masteredIds), [masteredIds])
  const pending = useMemo(() => new Set(pendingMasteredIds), [pendingMasteredIds])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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
    () => searchWords(words, query),
    [query, words]
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

      <section className="search-results" aria-live="polite">
        {!query ? (
          <div className="search-empty">
            <strong>{words.length} 个词都可以查</strong>
            <p>搜中文时优先匹配逐词校订的常用义，同时保留原考研词表释义反查。</p>
          </div>
        ) : searchResult.matches.length ? (
          <>
            <p className="search-count">
              找到 {searchResult.total} 个结果{searchResult.total > 80 ? '，先显示前 80 个' : ''}
            </p>
            <div className="search-list">
              {searchResult.matches.map((word) => {
                const status = statusFor(word.id)
                const meaning = studyMeaningFor(word)
                return (
                  <button className="search-row" type="button" key={word.id} onClick={() => setSelectedWordId(word.id)}>
                    <span className={`search-word ${wordLengthClass(word.word)}`}>
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
