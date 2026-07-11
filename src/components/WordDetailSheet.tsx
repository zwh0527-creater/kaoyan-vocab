import { useEffect, useRef } from 'react'
import type { WordDetailEntry, WordEntry } from '../types'

interface WordDetailSheetProps {
  word: WordEntry
  detail?: WordDetailEntry
  loading: boolean
  onClose: () => void
}

export function WordDetailSheet({ word, detail, loading, onClose }: WordDetailSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previousFocus.current?.focus()
    }
  }, [onClose])

  return (
    <div className="detail-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="detail-sheet" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="detail-handle" aria-hidden="true" />
        <header className="detail-header">
          <div>
            <p>词语详解</p>
            <h2 id="detail-title">{word.word}</h2>
            <span>{word.phonetic}</span>
          </div>
          <button ref={closeRef} className="detail-close" type="button" onClick={onClose}>关闭</button>
        </header>
        <div className="detail-section">
          <h3>中文释义</h3>
          <p className="detail-meaning">{word.meaning}</p>
        </div>
        <div className="detail-section collocation-section">
          <h3>考研常见搭配</h3>
          {loading ? <p className="detail-empty">正在载入离线词组…</p> : detail?.collocations.length ? (
            <ol className="collocation-list">
              {detail.collocations.map((collocation) => (
                <li key={collocation.phrase.toLowerCase()}>
                  <strong>{collocation.phrase}</strong>
                  <span>{collocation.meaning}</span>
                </li>
              ))}
            </ol>
          ) : <p className="detail-empty">暂未收录可靠搭配</p>}
        </div>
      </section>
    </div>
  )
}
