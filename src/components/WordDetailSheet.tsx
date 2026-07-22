import { useEffect, useRef } from 'react'
import { IconX } from '@tabler/icons-react'
import { studyMeaningFor, studyMeaningSourceLabel } from '../studyMeanings'
import type { RelatedWordEntry, WordDetailEntry, WordEntry } from '../types'
import { wordLengthClass } from '../wordDisplay'

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

  const relatedGroups = detail?.relatedWords?.reduce<Record<string, RelatedWordEntry[]>>((groups, item) => {
    const group = groups[item.relation] ?? []
    group.push(item)
    groups[item.relation] = group
    return groups
  }, {})
  const collocationSourcePage = detail?.collocations[0]?.sourcePage ?? detail?.redbook?.sourcePage
  const studyMeaning = studyMeaningFor(word)

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
            <h2 id="detail-title" className={wordLengthClass(word.word)}>{word.word}</h2>
            <span>{word.phonetic}</span>
          </div>
          <button ref={closeRef} className="detail-close" type="button" onClick={onClose} aria-label="关闭">
            <IconX aria-hidden="true" stroke={1.7} />
          </button>
        </header>
        <div className="detail-section meaning-section">
          <h3>校订学习释义</h3>
          <p className="detail-meaning">{studyMeaning}</p>
          <p className="source-page">{studyMeaningSourceLabel(word.studyMeaningStatus)}</p>
          <details className="source-original">
            <summary>查看原考研词表释义</summary>
            <p>{word.meaning}</p>
            <small>来源：《考研大纲词汇乱序版》PDF 第 {word.sourcePage} 页，仅作原始资料记录</small>
          </details>
        </div>

        {detail?.exam ? (
          <div className="detail-section exam-section">
            <h3>英语一真题</h3>
            <p className="exam-summary">2010—2025 真题正文中检出 {detail.exam.count} 处</p>
            <p className="exam-years">涉及年份：{detail.exam.years.join('、')}</p>
            <p className="exam-note">“官方译文”来自本机答案资料；“校订译文”经过人工核对；其余辅助翻译由本地模型生成，遇到生硬处以英文原句为准。</p>
            {detail.exam.phrases.length ? (
              <ol className="exam-phrase-list">
                {detail.exam.phrases.map((item) => (
                  <li key={item.phrase}>
                    <div className="exam-phrase-heading">
                      <strong>{item.phrase}</strong>
                      <span>{item.years.join('、')} 年{item.count > 1 ? ` · ${item.count} 处` : ''}</span>
                    </div>
                    {item.usage ? <p className="exam-usage"><b>用法</b>{item.usage}</p> : null}
                    {item.contexts.map((context) => (
                      <blockquote className="exam-context" key={`${context.year}-${context.text}`}>
                        <small>{context.year} 年真题语境</small>
                        <p className="exam-context-original">{context.text}</p>
                        {context.translation ? (
                          <p className="exam-context-translation">
                            <b>{context.translationSource === 'official-answer'
                              ? `官方译文 · 第 ${context.translationQuestion} 题划线部分`
                              : context.translationSource === 'curated' ? '校订译文' : '辅助翻译'}</b>
                            {context.translation}
                          </p>
                        ) : (
                          <p className="exam-context-translation pending"><b>词义提示</b>{studyMeaning}</p>
                        )}
                      </blockquote>
                    ))}
                  </li>
                ))}
              </ol>
            ) : <p className="detail-empty">有真题记录，但暂未提取到完整且可靠的语境句。</p>}
          </div>
        ) : null}

        <div className="detail-section collocation-section">
          <h3>红宝书固定搭配</h3>
          {loading ? <p className="detail-empty">正在载入离线词条…</p> : detail?.collocations.length ? (
            <>
              <ol className="collocation-list">
                {detail.collocations.map((collocation) => (
                  <li key={collocation.phrase.toLowerCase()}>
                    <strong>{collocation.phrase}</strong>
                    <span>{collocation.meaning}</span>
                  </li>
                ))}
              </ol>
              {collocationSourcePage ? <p className="source-page">来源：红宝书 PDF 第 {collocationSourcePage} 页</p> : null}
            </>
          ) : detail?.redbook?.hasCollocationSection ? (
            <p className="detail-empty">原书设有“词组”栏，但 OCR 没有形成足够可靠的条目；暂不展示可能错误的内容。</p>
          ) : detail?.redbook ? (
            <p className="detail-empty">当前 OCR 没有识别到单列“词组”栏；原书通常未单列，也不排除扫描漏字。下面保留已识别的例句和用法。</p>
          ) : (
            <p className="detail-empty">红宝书正文没有为这个词单列可核对的词组内容。</p>
          )}
        </div>

        {detail?.examples?.length ? (
          <div className="detail-section example-section">
            <h3>红宝书例句与用法</h3>
            <ol className="example-list">
              {detail.examples.map((example) => (
                <li key={example.sentence.toLowerCase()}>
                  <strong>{example.sentence}</strong>
                  <span>{example.meaning}</span>
                </li>
              ))}
            </ol>
            <p className="source-page">来源：红宝书 PDF 第 {detail.examples[0].sourcePage} 页</p>
          </div>
        ) : null}

        {relatedGroups && Object.keys(relatedGroups).length ? (
          <div className="detail-section related-section">
            <h3>红宝书相关词</h3>
            {Object.entries(relatedGroups).map(([relation, items]) => (
              <div className="related-group" key={relation}>
                <h4>{relation === 'synonym' ? '同义 / 近义' : relation === 'antonym' ? '反义' : '派生'}</h4>
                <ul>
                  {items.map((item) => (
                    <li key={`${relation}-${item.word}`}>
                      <strong>{item.word}</strong>
                      <span>{item.meaning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
