import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  IconChevronLeft,
  IconCircle,
  IconCircleCheckFilled,
  IconNotebook,
  IconVolume
} from '@tabler/icons-react'
import {
  currentGroupIds,
  dailyGroupCount,
  markGroupScroll,
  markWordReviewed,
  togglePendingMastered
} from '../studyEngine'
import type { StudyStateV4, WordDetailEntry, WordEntry } from '../types'
import { studyMeaningFor } from '../studyMeanings'
import { loadWordDetail } from '../wordDetails'
import { wordLengthClass } from '../wordDisplay'
import { WordDetailSheet } from './WordDetailSheet'

interface StudyScreenProps {
  state: StudyStateV4
  wordMap: Map<number, WordEntry>
  onStateChange: Dispatch<SetStateAction<StudyStateV4>>
  onBack: () => void
  onCompleteGroup: () => void
  onNotify: (message: string) => void
}

export function StudyScreen({
  state,
  wordMap,
  onStateChange,
  onBack,
  onCompleteGroup,
  onNotify
}: StudyScreenProps) {
  const groupIds = currentGroupIds(state)
  const pendingMastered = useMemo(() => new Set(state.pendingMasteredIds), [state.pendingMasteredIds])
  const reviewedIds = useMemo(() => new Set(state.reviewedWordIds), [state.reviewedWordIds])
  const [revealedIds, setRevealedIds] = useState<Set<number>>(() => new Set())
  const [detailWordId, setDetailWordId] = useState<number | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<WordDetailEntry | undefined>()
  const [detailsLoading, setDetailsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const ticking = useRef(false)
  const groupKey = `${state.sessionDate}-${state.round}-${state.completedGroups}`

  const measureProgress = useCallback(() => {
    const container = scrollRef.current
    if (!container) return
    const checkpoint = container.getBoundingClientRect().top + container.clientHeight * 0.74
    let latest = -1
    for (const element of container.querySelectorAll<HTMLElement>('[data-word-index]')) {
      if (element.getBoundingClientRect().top <= checkpoint) latest = Number(element.dataset.wordIndex)
      else break
    }
    if (latest >= 0) onStateChange((current) => markGroupScroll(current, latest))
  }, [onStateChange])

  useEffect(() => {
    if (detailWordId === null) {
      setSelectedDetail(undefined)
      setDetailsLoading(false)
      return
    }
    let active = true
    setSelectedDetail(undefined)
    setDetailsLoading(true)
    void loadWordDetail(detailWordId)
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
  }, [detailWordId, onNotify])

  useEffect(() => {
    setRevealedIds(new Set())
    const target = scrollRef.current?.querySelector<HTMLElement>(`[data-word-index="${state.groupScrollIndex}"]`)
    if (state.groupScrollIndex > 0) target?.scrollIntoView({ block: 'start' })
    requestAnimationFrame(measureProgress)
  }, [groupKey]) // Restore once for each active group.

  const handleScroll = () => {
    if (ticking.current) return
    ticking.current = true
    requestAnimationFrame(() => {
      measureProgress()
      ticking.current = false
    })
  }

  const toggleMeaning = (id: number) => {
    if (!revealedIds.has(id)) {
      onStateChange((current) => markWordReviewed(current, id))
    }
    setRevealedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const speak = (word: string) => {
    if (!('speechSynthesis' in window)) {
      onNotify('当前系统无法播放发音')
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(word)
    const voices = window.speechSynthesis.getVoices()
    utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === 'en-us') ??
      voices.find((voice) => voice.lang.toLowerCase().startsWith('en')) ?? null
    utterance.lang = utterance.voice?.lang ?? 'en-US'
    utterance.rate = 0.82
    utterance.onerror = () => onNotify('发音暂时不可用')
    window.speechSynthesis.speak(utterance)
  }

  const openDetails = (wordId: number) => {
    setDetailWordId(wordId)
  }

  const selectedDetailWord = detailWordId === null ? undefined : wordMap.get(detailWordId)
  const groupNumber = state.completedGroups + 1
  const remainingWords = Math.max(0, groupIds.length - state.groupSeenCount)

  const toggleMastered = (wordId: number, isReviewed: boolean, isMastered: boolean) => {
    if (!isReviewed && !isMastered) {
      onNotify('先查看这个词的释义，再决定是否标为熟词')
      return
    }
    onStateChange((current) => togglePendingMastered(current, wordId))
  }

  return (
    <main className="study-page">
      <header className="study-header">
        <button className="back-button study-back" type="button" onClick={onBack}>
          <IconChevronLeft aria-hidden="true" stroke={1.8} />
          <span>返回</span>
        </button>
        <div className="study-title">
          <strong>第 {groupNumber} 组</strong>
          <span>今日共 {dailyGroupCount(state)} 组</span>
        </div>
        <span className="study-count">{String(state.groupSeenCount).padStart(2, '0')}<small> / {groupIds.length}</small></span>
      </header>
      <div className="study-progress" aria-hidden="true">
        <span style={{ width: `${groupIds.length ? (state.groupSeenCount / groupIds.length) * 100 : 0}%` }} />
      </div>

      <div className="word-list" ref={scrollRef} onScroll={handleScroll}>
        <div className="group-intro">
          <p>第 {state.round} 轮 · Group {String(groupNumber).padStart(2, '0')}</p>
          <h1>先想词义，再点确认。</h1>
          <span>只有非常确定已经吃透的词，才标为熟词。</span>
        </div>

        {groupIds.map((id, index) => {
          const word = wordMap.get(id)
          if (!word) return null
          const isMastered = pendingMastered.has(id)
          const isReviewed = reviewedIds.has(id)
          const isMeaningVisible = revealedIds.has(id)
          const studyMeaning = studyMeaningFor(word)
          return (
            <article
              className={`word-row${isMastered ? ' mastered' : ''}${isReviewed ? ' reviewed' : ''}`}
              data-word-index={index}
              key={id}
            >
              <span className="word-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <div className="word-row-content">
                <div className="word-topline">
                  <span className={`word-copy ${wordLengthClass(word.word)}`}>
                    <strong>{word.word}</strong>
                    <small>{word.phonetic}</small>
                  </span>
                  <div className="word-actions">
                    <button type="button" onClick={() => speak(word.word)} aria-label={`播放 ${word.word} 发音`}>
                      <IconVolume aria-hidden="true" stroke={1.7} />
                      <span>发音</span>
                    </button>
                    <button type="button" onClick={() => openDetails(id)} aria-label={`查看 ${word.word} 详解`}>
                      <IconNotebook aria-hidden="true" stroke={1.7} />
                      <span>详解</span>
                    </button>
                    <button
                      className={`mastered-button${isMastered ? ' selected' : ''}`}
                      type="button"
                      onClick={() => toggleMastered(id, isReviewed, isMastered)}
                      aria-pressed={isMastered}
                      aria-label={`${isMastered ? '取消' : ''}标记 ${word.word} 为熟词`}
                    >
                      {isMastered
                        ? <IconCircleCheckFilled aria-hidden="true" />
                        : <IconCircle aria-hidden="true" stroke={1.55} />}
                      <span>{isMastered ? '已熟' : '熟词'}</span>
                    </button>
                  </div>
                </div>
                <button
                  className={`meaning${isMeaningVisible ? ' visible' : ''}${isReviewed ? ' reviewed' : ''}`}
                  type="button"
                  onClick={() => toggleMeaning(id)}
                  aria-expanded={isMeaningVisible}
                  aria-label={`${word.word} ${isMeaningVisible ? studyMeaning : '轻触揭示释义'}`}
                >
                  {isMeaningVisible ? studyMeaning : '轻触揭示释义'}
                </button>
              </div>
            </article>
          )
        })}

      </div>

      <footer className={`study-footer${remainingWords === 0 ? ' ready' : ''}`}>
        <div className="study-footer-inner">
          {remainingWords === 0 ? (
            <>
              <p><i aria-hidden="true" />{groupIds.length} 个词均已查看，未标熟词会进入下一轮。</p>
              <button className="primary-button" type="button" onClick={onCompleteGroup}>完成本组</button>
            </>
          ) : (
            <p><i aria-hidden="true" />逐词查看释义后才能标熟；还剩 {remainingWords} 个词未查看。</p>
          )}
        </div>
      </footer>

      {selectedDetailWord ? (
        <WordDetailSheet
          word={selectedDetailWord}
          detail={selectedDetail}
          loading={detailsLoading}
          status={pendingMastered.has(selectedDetailWord.id) ? 'pending' : 'learning'}
          onClose={() => setDetailWordId(null)}
        />
      ) : null}
    </main>
  )
}
