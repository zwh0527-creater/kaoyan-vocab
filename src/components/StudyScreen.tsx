import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { currentGroupIds, dailyGroupCount, markGroupSeen, togglePendingMastered } from '../studyEngine'
import type { StudyStateV3, WordDetailEntry, WordEntry } from '../types'
import { WordDetailSheet } from './WordDetailSheet'

interface StudyScreenProps {
  state: StudyStateV3
  wordMap: Map<number, WordEntry>
  onStateChange: Dispatch<SetStateAction<StudyStateV3>>
  onBack: () => void
  onCompleteGroup: () => void
  onNotify: (message: string) => void
}

let detailsPromise: Promise<Map<number, WordDetailEntry>> | null = null

function loadDetails() {
  detailsPromise ??= import('../data/word-details.json').then((module) => {
    const details = module.default as WordDetailEntry[]
    return new Map(details.map((detail) => [detail.wordId, detail]))
  })
  return detailsPromise
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
  const [revealedIds, setRevealedIds] = useState<Set<number>>(() => new Set())
  const [detailWordId, setDetailWordId] = useState<number | null>(null)
  const [detailMap, setDetailMap] = useState<Map<number, WordDetailEntry> | null>(null)
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
    if (latest >= 0) onStateChange((current) => markGroupSeen(current, latest))
  }, [onStateChange])

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
    if (detailMap || detailsLoading) return
    setDetailsLoading(true)
    void loadDetails()
      .then(setDetailMap)
      .catch(() => onNotify('词组数据暂时无法载入'))
      .finally(() => setDetailsLoading(false))
  }

  const selectedDetailWord = detailWordId === null ? undefined : wordMap.get(detailWordId)
  const groupNumber = state.completedGroups + 1

  return (
    <main className="study-page">
      <header className="study-header">
        <button className="back-button" type="button" onClick={onBack}>返回</button>
        <div className="study-title">
          <strong>第 {groupNumber} 组</strong>
          <span>今日共 {dailyGroupCount(state)} 组</span>
        </div>
        <span className="study-count">{state.groupSeenCount}<small> / {groupIds.length}</small></span>
      </header>
      <div className="study-progress" aria-hidden="true">
        <span style={{ width: `${groupIds.length ? (state.groupSeenCount / groupIds.length) * 100 : 0}%` }} />
      </div>

      <div className="word-list" ref={scrollRef} onScroll={handleScroll}>
        <div className="group-intro">
          <p>第 {state.round} 轮 · Group {String(groupNumber).padStart(2, '0')}</p>
          <h1>先想词义，再点开确认。</h1>
          <span>只有非常确定已经吃透的词，才标为熟词。</span>
        </div>

        {groupIds.map((id, index) => {
          const word = wordMap.get(id)
          if (!word) return null
          const isMastered = pendingMastered.has(id)
          const isMeaningVisible = revealedIds.has(id)
          return (
            <article
              className={`word-row${isMastered ? ' mastered' : ''}`}
              data-word-index={index}
              key={id}
            >
              <span className="word-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <button
                className="word-main"
                type="button"
                onClick={() => toggleMeaning(id)}
                aria-expanded={isMeaningVisible}
              >
                <span className="word-copy">
                  <strong>{word.word}</strong>
                  <small>{word.phonetic}</small>
                </span>
                <span className={`meaning${isMeaningVisible ? ' visible' : ''}`}>
                  {isMeaningVisible ? word.meaning : '点击查看中文释义'}
                </span>
              </button>
              <div className="word-actions">
                <button type="button" onClick={() => speak(word.word)}>发音</button>
                <button type="button" onClick={() => openDetails(id)}>详解</button>
                <button
                  className={`mastered-button${isMastered ? ' selected' : ''}`}
                  type="button"
                  onClick={() => onStateChange((current) => togglePendingMastered(current, id))}
                  aria-pressed={isMastered}
                >
                  {isMastered ? '已熟' : '熟词'}
                </button>
              </div>
            </article>
          )
        })}

        <section className="group-end">
          <p>{state.groupSeenCount < groupIds.length ? '滑到本组最后一个词后即可完成。' : '本组已看完，未标熟词会进入下一轮。'}</p>
          <button
            className="primary-button"
            type="button"
            onClick={onCompleteGroup}
            disabled={state.groupSeenCount < groupIds.length}
          >
            完成本组
          </button>
        </section>
      </div>

      {selectedDetailWord ? (
        <WordDetailSheet
          word={selectedDetailWord}
          detail={detailMap?.get(selectedDetailWord.id)}
          loading={detailsLoading}
          onClose={() => setDetailWordId(null)}
        />
      ) : null}
    </main>
  )
}
