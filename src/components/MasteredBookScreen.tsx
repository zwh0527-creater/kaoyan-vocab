import { useEffect, useMemo, useRef, useState } from 'react'
import type { WordEntry } from '../types'
import { studyMeaningFor } from '../studyMeanings'

const PAGE_SIZE = 120

interface MasteredBookScreenProps {
  masteredIds: number[]
  words: WordEntry[]
  onBack: () => void
  onRestore: (wordId: number) => void
}

export function MasteredBookScreen({ masteredIds, words, onBack, onRestore }: MasteredBookScreenProps) {
  const masteredWords = useMemo(() => {
    const mastered = new Set(masteredIds)
    return words.filter((word) => mastered.has(word.id))
  }, [masteredIds, words])
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || visibleCount >= masteredWords.length) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisibleCount((count) => Math.min(count + PAGE_SIZE, masteredWords.length))
      }
    }, { rootMargin: '240px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [masteredWords.length, visibleCount])

  return (
    <main className="mastered-page page">
      <header className="settings-header">
        <button className="back-button" type="button" onClick={onBack}>返回</button>
        <div>
          <h1>熟词本</h1>
          <p>{masteredWords.length} 词</p>
        </div>
      </header>

      {masteredWords.length === 0 ? (
        <section className="empty-book">
          <h2>这里还没有熟词</h2>
          <p>只有你在学习时明确标为“熟词”的单词，才会进入这里。</p>
        </section>
      ) : (
        <div className="mastered-list">
          {masteredWords.slice(0, visibleCount).map((word) => (
            <article className="mastered-row" key={word.id}>
              <div>
                <strong>{word.word}</strong>
                <p>{studyMeaningFor(word)}</p>
              </div>
              <button type="button" onClick={() => onRestore(word.id)}>重新学习</button>
            </article>
          ))}
          <div ref={sentinelRef} className="list-sentinel" aria-hidden="true" />
        </div>
      )}
    </main>
  )
}
