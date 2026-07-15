import { useEffect, useRef } from 'react'
import type { WordDetailEntry, WordEntry } from '../types'

interface WordDetailSheetProps {
  word: WordEntry
  detail?: WordDetailEntry
  loading: boolean
  status?: 'mastered' | 'pending' | 'learning'
  onClose: () => void
}

export function WordDetailSheet({ word, detail, loading, status, onClose }: WordDetailSheetProps) {
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
            <p>
              词语详解
              {status ? <span className={`detail-status ${status}`}>
                {status === 'mastered' ? '熟词' : status === 'pending' ? '本组已标熟' : '学习中'}
              </span> : null}
            </p>
            <h2 id="detail-title">{word.word}</h2>
            <span>{word.phonetic}</span>
          </div>
          <button ref={closeRef} className="detail-close" type="button" onClick={onClose}>关闭</button>
        </header>
        <div className="detail-section">
          <h3>{detail?.coreMeaning ? '核心释义' : '大纲释义'}</h3>
          <p className="detail-meaning">{detail?.coreMeaning ?? word.meaning}</p>
          {detail?.coreMeaning && detail.coreMeaning !== word.meaning ? (
            <details className="source-meaning">
              <summary>查看大纲原释义</summary>
              <p>{word.meaning}</p>
            </details>
          ) : null}
        </div>

        {detail?.exam ? (
          <div className="detail-section exam-section">
            <h3>英语一真题</h3>
            <p className="exam-summary">2010—2025 真题中出现 {detail.exam.count} 次</p>
            <p className="exam-years">涉及年份：{detail.exam.years.join('、')}</p>
            {detail.exam.phrases.length ? (
              <ol className="exam-phrase-list">
                {detail.exam.phrases.map((item) => (
                  <li key={item.phrase}>
                    <strong>{item.phrase}</strong>
                    <span>{item.years.join('、')} 年真题{item.count > 1 ? ` · 共 ${item.count} 次` : ''}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="detail-empty">有真题记录，暂未提取到稳定的词语组合</p>}
          </div>
        ) : null}

        <div className="detail-section collocation-section">
          <h3>红宝书固定搭配</h3>
          {loading ? <p className="detail-empty">正在载入离线词条…</p> : detail?.collocations.length ? (
            <ol className="collocation-list">
              {detail.collocations.map((collocation) => (
                <li key={collocation.phrase.toLowerCase()}>
                  <strong>{collocation.phrase}</strong>
                  <span>{collocation.meaning}</span>
                </li>
              ))}
            </ol>
          ) : <p className="detail-empty">红宝书未列出固定搭配，不补写无来源内容</p>}
        </div>
      </section>
    </div>
  )
}
