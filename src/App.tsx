import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import wordsJson from './data/words.json'
import corpusMeta from './data/corpus-meta.json'
import { completeToday, createInitialState, localDateKey, markSeen, rolloverToDate, roundRemaining, toggleUnfamiliar } from './studyEngine'
import { downloadBackup, loadStudyState, parseBackup, saveStudyState } from './storage'
import type { StudyStateV1, WordEntry } from './types'
import { updatePwa } from './pwa'

type Screen = 'home' | 'study' | 'summary' | 'settings'
type Toast = { id: number; message: string }

const words = wordsJson as WordEntry[]
const wordMap = new Map(words.map((word) => [word.id, word]))
const allWordIds = words.map((word) => word.id)
const validIds = new Set(allWordIds)

function initializeState() {
  const saved = loadStudyState(corpusMeta.fingerprint, validIds)
  return rolloverToDate(
    saved ?? createInitialState(allWordIds, corpusMeta.fingerprint, localDateKey()),
    localDateKey()
  )
}

function isIosSafari() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const standalone = window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  return ios && !standalone
}

function App() {
  const [state, setState] = useState<StudyStateV1>(initializeState)
  const [screen, setScreen] = useState<Screen>('home')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [updateReady, setUpdateReady] = useState(false)
  const [showInstallGuide, setShowInstallGuide] = useState(
    () => isIosSafari() && localStorage.getItem('kaoyan-vocab.install-guide-dismissed') !== '1'
  )
  const toastCounter = useRef(0)

  const notify = useCallback((message: string) => {
    const id = ++toastCounter.current
    setToasts((current) => [...current, { id, message }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 2800)
  }, [])

  useEffect(() => {
    try {
      saveStudyState(state)
    } catch {
      notify('进度保存失败，请导出备份后检查浏览器存储')
    }
  }, [notify, state])

  useEffect(() => {
    const handleResume = () => {
      if (document.visibilityState === 'visible') setState((current) => rolloverToDate(current, localDateKey()))
    }
    document.addEventListener('visibilitychange', handleResume)
    window.addEventListener('pageshow', handleResume)
    return () => {
      document.removeEventListener('visibilitychange', handleResume)
      window.removeEventListener('pageshow', handleResume)
    }
  }, [])

  useEffect(() => {
    const handleUpdate = () => {
      setUpdateReady(true)
      notify('新版本已准备好，可在首页更新')
    }
    const handleOffline = () => notify('离线内容已准备好')
    window.addEventListener('kaoyan-pwa-update', handleUpdate)
    window.addEventListener('kaoyan-offline-ready', handleOffline)
    return () => {
      window.removeEventListener('kaoyan-pwa-update', handleUpdate)
      window.removeEventListener('kaoyan-offline-ready', handleOffline)
    }
  }, [notify])

  const dismissInstallGuide = () => {
    localStorage.setItem('kaoyan-vocab.install-guide-dismissed', '1')
    setShowInstallGuide(false)
  }

  const finishSession = () => {
    const next = completeToday(state)
    if (next === state) return
    setState(next)
    setScreen('summary')
  }

  const importBackup = async (file: File) => {
    try {
      const restored = parseBackup(await file.text(), corpusMeta.fingerprint, validIds)
      setState(rolloverToDate(restored, localDateKey()))
      setScreen('home')
      notify('备份已恢复')
    } catch (error) {
      notify(error instanceof Error ? error.message : '备份无法导入')
    }
  }

  const resetProgress = () => {
    setState(createInitialState(allWordIds, corpusMeta.fingerprint, localDateKey()))
    setScreen('home')
    notify('已重新开始第 1 轮')
  }

  return (
    <div className="app-shell">
      {screen === 'home' ? (
        <HomeScreen
          state={state}
          showInstallGuide={showInstallGuide}
          onDismissInstallGuide={dismissInstallGuide}
          onStudy={() => setScreen('study')}
          onSettings={() => setScreen('settings')}
          onUpdate={() => void updatePwa()}
          updateReady={updateReady}
        />
      ) : null}
      {screen === 'study' ? (
        <StudyScreen
          state={state}
          onStateChange={setState}
          onBack={() => setScreen('home')}
          onFinish={finishSession}
          onNotify={notify}
        />
      ) : null}
      {screen === 'summary' ? <SummaryScreen state={state} onHome={() => setScreen('home')} /> : null}
      {screen === 'settings' ? (
        <SettingsScreen
          state={state}
          onBack={() => setScreen('home')}
          onExport={() => downloadBackup(state)}
          onImport={importBackup}
          onReset={resetProgress}
        />
      ) : null}
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => <div className="toast" key={toast.id}>{toast.message}</div>)}
      </div>
    </div>
  )
}

interface HomeProps {
  state: StudyStateV1
  showInstallGuide: boolean
  onDismissInstallGuide: () => void
  onStudy: () => void
  onSettings: () => void
  onUpdate: () => void
  updateReady: boolean
}

function HomeScreen({ state, showInstallGuide, onDismissInstallGuide, onStudy, onSettings, onUpdate, updateReady }: HomeProps) {
  const progress = state.dailyBatch.length === 0 ? 100 : Math.round((state.seenCount / state.dailyBatch.length) * 100)
  const buttonLabel = state.mastered ? '全部过完' : state.completedToday ? '今天已完成' : state.seenCount > 0 ? '继续学习' : '开始今天'

  return (
    <main className="home-page page">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">词</div>
        <button className="text-button" type="button" onClick={onSettings}>设置</button>
      </header>

      {showInstallGuide ? (
        <section className="install-guide" aria-label="安装说明">
          <button className="guide-close" type="button" onClick={onDismissInstallGuide} aria-label="关闭安装说明">×</button>
          <strong>把它放到 iPhone 主屏幕</strong>
          <p>点 Safari 底部的“分享”，再选“添加到主屏幕”。首次打开成功后即可离线使用。</p>
        </section>
      ) : null}

      <section className="hero-block">
        <p className="round-label">第 {state.round} 轮</p>
        <h1>考研单词</h1>
        <p className="method-note">快速过，反复筛。只把不熟的词留到下一轮。</p>
      </section>

      <section className="today-panel" aria-label="今日进度">
        <div className="progress-copy">
          <span>今日</span>
          <strong>{state.completedToday ? state.lastSummary?.reviewed ?? 0 : state.seenCount}<small> / {state.completedToday ? state.lastSummary?.reviewed ?? 0 : state.dailyBatch.length}</small></strong>
        </div>
        <div className="progress-track" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
        <div className="progress-meta">
          <span>本轮还剩 {roundRemaining(state)} 词</span>
          <span>下一轮已留下 {state.nextRoundQueue.length} 词</span>
        </div>
      </section>

      <button
        className="primary-button home-action"
        type="button"
        onClick={onStudy}
        disabled={state.completedToday || state.mastered || state.dailyBatch.length === 0}
      >
        {buttonLabel}
      </button>
      {updateReady ? <button className="update-link" type="button" onClick={onUpdate}>应用已下载的新版本</button> : null}
    </main>
  )
}

interface StudyProps {
  state: StudyStateV1
  onStateChange: React.Dispatch<React.SetStateAction<StudyStateV1>>
  onBack: () => void
  onFinish: () => void
  onNotify: (message: string) => void
}

function StudyScreen({ state, onStateChange, onBack, onFinish, onNotify }: StudyProps) {
  const [showAll, setShowAll] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const ticking = useRef(false)
  const unfamiliar = useMemo(() => new Set(state.unfamiliarIds), [state.unfamiliarIds])

  const measureProgress = useCallback(() => {
    const container = scrollRef.current
    if (!container) return
    const checkpoint = container.getBoundingClientRect().top + container.clientHeight * 0.72
    let latest = -1
    for (const element of container.querySelectorAll<HTMLElement>('[data-word-index]')) {
      if (element.getBoundingClientRect().top <= checkpoint) latest = Number(element.dataset.wordIndex)
      else break
    }
    if (latest >= 0) onStateChange((current) => markSeen(current, latest))
  }, [onStateChange])

  const handleScroll = () => {
    if (ticking.current) return
    ticking.current = true
    requestAnimationFrame(() => {
      measureProgress()
      ticking.current = false
    })
  }

  useEffect(() => {
    const target = scrollRef.current?.querySelector<HTMLElement>(`[data-word-index="${state.scrollIndex}"]`)
    if (state.scrollIndex > 0) target?.scrollIntoView({ block: 'start' })
    requestAnimationFrame(measureProgress)
  }, []) // Restore only when the study screen mounts.

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

  return (
    <main className="study-page">
      <header className="study-header">
        <button className="back-button" type="button" onClick={onBack}>返回</button>
        <div className="study-title">
          <strong>第 {state.round} 轮</strong>
          <span>{state.seenCount} / {state.dailyBatch.length}</span>
        </div>
        <button className="text-button meaning-toggle" type="button" onClick={() => setShowAll((value) => !value)}>
          {showAll ? '隐藏释义' : '显示释义'}
        </button>
      </header>
      <div className="study-progress" aria-hidden="true">
        <span style={{ width: `${state.dailyBatch.length ? (state.seenCount / state.dailyBatch.length) * 100 : 0}%` }} />
      </div>

      <div className="word-list" ref={scrollRef} onScroll={handleScroll}>
        <p className="study-hint">想得起来就继续往下滑；想不起来，点一下留下它。</p>
        {state.dailyBatch.map((id, index) => {
          const word = wordMap.get(id)
          if (!word) return null
          const isUnfamiliar = unfamiliar.has(id)
          const revealMeaning = showAll || isUnfamiliar
          return (
            <article
              className={`word-row${isUnfamiliar ? ' unfamiliar' : ''}`}
              data-word-index={index}
              key={id}
            >
              <button
                className="word-main"
                type="button"
                onClick={() => onStateChange((current) => toggleUnfamiliar(current, id))}
                aria-pressed={isUnfamiliar}
                aria-label={`${isUnfamiliar ? '取消' : '标记'} ${word.word} 为不熟`}
              >
                <span className="word-copy">
                  <strong>{word.word}</strong>
                  <small>{word.phonetic}</small>
                </span>
                <span className={`meaning${revealMeaning ? ' visible' : ''}`} aria-hidden={!revealMeaning}>
                  {revealMeaning ? word.meaning : '释义已隐藏'}
                </span>
              </button>
              <button className="speak-button" type="button" onClick={() => speak(word.word)} aria-label={`播放 ${word.word} 的发音`}>
                发音
              </button>
              {isUnfamiliar ? <span className="unfamiliar-mark">不熟</span> : null}
            </article>
          )
        })}
        <section className="session-end">
          <p>今天这批词已经到底。</p>
          <button
            className="primary-button"
            type="button"
            onClick={onFinish}
            disabled={state.seenCount < state.dailyBatch.length}
          >
            完成今天
          </button>
        </section>
      </div>
    </main>
  )
}

function SummaryScreen({ state, onHome }: { state: StudyStateV1; onHome: () => void }) {
  const summary = state.lastSummary
  return (
    <main className="summary-page page">
      <p className="round-label">今天结束</p>
      <h1>{summary?.reviewed ?? 0} 词</h1>
      <p className="summary-lead">先把整张词表走完，比困在一个词上更重要。</p>
      <dl className="summary-list">
        <div><dt>留下的不熟词</dt><dd>{summary?.unfamiliar ?? 0}</dd></div>
        <div><dt>本轮还剩</dt><dd>{summary?.roundRemaining ?? 0}</dd></div>
        <div><dt>当前轮次</dt><dd>第 {state.round} 轮</dd></div>
      </dl>
      {summary?.roundCompleted && !state.mastered ? <p className="round-complete">这一轮已经完成。下一轮只过留下的不熟词。</p> : null}
      {state.mastered ? <p className="round-complete">词表已经全部过完。</p> : null}
      <button className="primary-button" type="button" onClick={onHome}>返回首页</button>
    </main>
  )
}

interface SettingsProps {
  state: StudyStateV1
  onBack: () => void
  onExport: () => void
  onImport: (file: File) => Promise<void>
  onReset: () => void
}

function SettingsScreen({ state, onBack, onExport, onImport, onReset }: SettingsProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0)

  return (
    <main className="settings-page page">
      <header className="settings-header">
        <button className="back-button" type="button" onClick={onBack}>返回</button>
        <h1>设置</h1>
      </header>

      <section className="settings-group">
        <h2>学习进度</h2>
        <button className="settings-row" type="button" onClick={onExport}>
          <span><strong>导出备份</strong><small>保存当前第 {state.round} 轮和学习位置</small></span><b>导出</b>
        </button>
        <button className="settings-row" type="button" onClick={() => inputRef.current?.click()}>
          <span><strong>导入备份</strong><small>只接受当前词表生成的备份</small></span><b>选择文件</b>
        </button>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          tabIndex={-1}
          aria-hidden="true"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void onImport(file)
            event.target.value = ''
          }}
        />
      </section>

      <section className="settings-group">
        <h2>词表</h2>
        <div className="source-note">
          <strong>{corpusMeta.wordCount} 条乱序词汇</strong>
          <p>整理自《考研大纲词汇乱序版》117 页。App 不包含原 PDF，只保留英文、音标、释义和来源页码。</p>
        </div>
      </section>

      <section className="settings-group danger-zone">
        <h2>重新开始</h2>
        <button className="danger-button" type="button" onClick={() => setResetStep(1)}>清空全部学习进度</button>
      </section>

      {resetStep > 0 ? (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
            {resetStep === 1 ? (
              <>
                <h2 id="reset-title">先留一份备份</h2>
                <p>清空后无法撤销。建议先导出备份，再继续下一步。</p>
                <button className="secondary-button" type="button" onClick={onExport}>导出备份</button>
                <button className="danger-button" type="button" onClick={() => setResetStep(2)}>继续重置</button>
              </>
            ) : (
              <>
                <h2 id="reset-title">确定从第 1 轮重来？</h2>
                <p>当前轮次、标记和阅读位置都会被清除。</p>
                <button className="danger-button solid" type="button" onClick={onReset}>确认清空</button>
              </>
            )}
            <button className="text-button modal-cancel" type="button" onClick={() => setResetStep(0)}>取消</button>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default App
