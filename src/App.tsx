import { useCallback, useEffect, useRef, useState } from 'react'
import wordsJson from './data/words.json'
import wordDetailsMeta from './data/word-details-meta.json'
import corpusMeta from './data/corpus-meta.json'
import { MasteredBookScreen } from './components/MasteredBookScreen'
import { SearchScreen } from './components/SearchScreen'
import { StudyScreen } from './components/StudyScreen'
import {
  completeGroup,
  createInitialState,
  currentGroupIds,
  dailyGroupCount,
  nextStudyDayBoundary,
  restoreMastered,
  rolloverToDate,
  roundRemaining,
  studyDateKey
} from './studyEngine'
import { downloadBackup, loadStudyState, parseBackup, saveStudyState } from './storage'
import type { StudyStateV3, WordEntry } from './types'
import { updatePwa } from './pwa'

type Screen = 'home' | 'study' | 'group-summary' | 'summary' | 'settings' | 'mastered' | 'search'
type Toast = { id: number; message: string }
type GroupSummary = { reviewed: number; mastered: number; groupNumber: number }

const words = wordsJson as WordEntry[]
const wordMap = new Map(words.map((word) => [word.id, word]))
const allWordIds = words.map((word) => word.id)

function initializeState() {
  const now = new Date()
  const saved = loadStudyState(corpusMeta.fingerprint, allWordIds, now)
  return rolloverToDate(
    saved ?? createInitialState(allWordIds, corpusMeta.fingerprint, studyDateKey(now)),
    studyDateKey(now)
  )
}

function isIosSafari() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const standalone = window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  return ios && !standalone
}

function App() {
  const [state, setState] = useState<StudyStateV3>(initializeState)
  const [screen, setScreen] = useState<Screen>('home')
  const [groupSummary, setGroupSummary] = useState<GroupSummary | null>(null)
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
    let boundaryTimer = 0
    const scheduleBoundary = () => {
      window.clearTimeout(boundaryTimer)
      const now = new Date()
      boundaryTimer = window.setTimeout(() => {
        setState((current) => rolloverToDate(current, studyDateKey()))
        scheduleBoundary()
      }, nextStudyDayBoundary(now).getTime() - now.getTime())
    }
    const handleResume = () => {
      if (document.visibilityState === 'visible') {
        setState((current) => rolloverToDate(current, studyDateKey()))
        scheduleBoundary()
      }
    }
    scheduleBoundary()
    document.addEventListener('visibilitychange', handleResume)
    window.addEventListener('pageshow', handleResume)
    return () => {
      window.clearTimeout(boundaryTimer)
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

  const finishGroup = () => {
    const group = currentGroupIds(state)
    const pending = new Set(state.pendingMasteredIds)
    const next = completeGroup(state)
    if (next === state) return
    setGroupSummary({
      reviewed: group.length,
      mastered: group.filter((id) => pending.has(id)).length,
      groupNumber: state.completedGroups + 1
    })
    setState(next)
    setScreen(next.completedToday ? 'summary' : 'group-summary')
  }

  const importBackup = async (file: File) => {
    try {
      const now = new Date()
      const restored = parseBackup(await file.text(), corpusMeta.fingerprint, allWordIds, now)
      setState(rolloverToDate(restored, studyDateKey(now)))
      setScreen('home')
      notify('备份已恢复')
    } catch (error) {
      notify(error instanceof Error ? error.message : '备份无法导入')
    }
  }

  const resetProgress = () => {
    setState(createInitialState(allWordIds, corpusMeta.fingerprint, studyDateKey()))
    setScreen('home')
    notify('已重新开始第 1 轮')
  }

  const restoreWord = (wordId: number) => {
    setState((current) => restoreMastered(current, wordId, allWordIds))
    notify(`${wordMap.get(wordId)?.word ?? '这个词'} 已放回下一轮`)
  }

  return (
    <div className="app-shell">
      {screen === 'home' ? (
        <HomeScreen
          state={state}
          showInstallGuide={showInstallGuide}
          onDismissInstallGuide={dismissInstallGuide}
          onStudy={() => setScreen('study')}
          onSearch={() => setScreen('search')}
          onMastered={() => setScreen('mastered')}
          onSettings={() => setScreen('settings')}
          onUpdate={() => void updatePwa()}
          updateReady={updateReady}
        />
      ) : null}
      {screen === 'study' ? (
        <StudyScreen
          state={state}
          wordMap={wordMap}
          onStateChange={setState}
          onBack={() => setScreen('home')}
          onCompleteGroup={finishGroup}
          onNotify={notify}
        />
      ) : null}
      {screen === 'search' ? (
        <SearchScreen
          words={words}
          masteredIds={state.masteredIds}
          pendingMasteredIds={state.pendingMasteredIds}
          onBack={() => setScreen('home')}
          onNotify={notify}
        />
      ) : null}
      {screen === 'group-summary' && groupSummary ? (
        <GroupSummaryScreen
          summary={groupSummary}
          nextGroup={state.completedGroups + 1}
          totalGroups={dailyGroupCount(state)}
          onContinue={() => setScreen('study')}
          onHome={() => setScreen('home')}
        />
      ) : null}
      {screen === 'summary' ? <SummaryScreen state={state} onHome={() => setScreen('home')} /> : null}
      {screen === 'mastered' ? (
        <MasteredBookScreen
          masteredIds={state.masteredIds}
          words={words}
          onBack={() => setScreen('home')}
          onRestore={restoreWord}
        />
      ) : null}
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
  state: StudyStateV3
  showInstallGuide: boolean
  onDismissInstallGuide: () => void
  onStudy: () => void
  onSearch: () => void
  onMastered: () => void
  onSettings: () => void
  onUpdate: () => void
  updateReady: boolean
}

function HomeScreen({
  state,
  showInstallGuide,
  onDismissInstallGuide,
  onStudy,
  onSearch,
  onMastered,
  onSettings,
  onUpdate,
  updateReady
}: HomeProps) {
  const completedGroups = state.completedToday ? state.lastSummary?.groups ?? 0 : state.completedGroups
  const totalGroups = state.completedToday ? state.lastSummary?.groups ?? 0 : dailyGroupCount(state)
  const completedWords = state.completedToday ? state.lastSummary?.reviewed ?? 0 : state.completedGroups * 20
  const totalWords = state.completedToday ? state.lastSummary?.reviewed ?? 0 : state.dailyBatch.length
  const progress = totalGroups === 0 ? 100 : Math.round((completedGroups / totalGroups) * 100)
  const buttonLabel = state.allCompleted ? '全部过完' : state.completedToday
    ? '今天已完成'
    : state.completedGroups > 0 || state.groupSeenCount > 0
      ? `继续第 ${state.completedGroups + 1} 组`
      : '开始第 1 组'

  return (
    <main className="home-page page">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">词</div>
        <div className="topbar-actions">
          <button className="text-button" type="button" onClick={onSearch}>查词</button>
          <button className="text-button" type="button" onClick={onSettings}>设置</button>
        </div>
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
        <p className="method-note">每天十五组，每组二十词。每日中午 12:00 刷新。</p>
      </section>

      <section className="today-panel" aria-label="今日进度">
        <div className="progress-copy">
          <span>今日进度</span>
          <strong>{completedGroups}<small> / {totalGroups} 组</small></strong>
        </div>
        <div className="progress-track" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
        <div className="progress-meta">
          <span>{completedWords} / {totalWords} 词</span>
          <span>本轮还剩 {roundRemaining(state)} 词</span>
          <span>下一轮已留下 {state.nextRoundQueue.length} 词</span>
        </div>
      </section>

      <button
        className="primary-button home-action"
        type="button"
        onClick={onStudy}
        disabled={state.completedToday || state.allCompleted || state.dailyBatch.length === 0}
      >
        {buttonLabel}
      </button>
      <button className="book-link" type="button" onClick={onMastered}>
        <span><strong>熟词本</strong><small>只收你确认已经吃透的词</small></span>
        <b>{state.masteredIds.length} 词</b>
      </button>
      {updateReady ? <button className="update-link" type="button" onClick={onUpdate}>应用已下载的新版本</button> : null}
    </main>
  )
}

function GroupSummaryScreen({
  summary,
  nextGroup,
  totalGroups,
  onContinue,
  onHome
}: {
  summary: GroupSummary
  nextGroup: number
  totalGroups: number
  onContinue: () => void
  onHome: () => void
}) {
  return (
    <main className="summary-page page group-summary-page">
      <p className="round-label">第 {summary.groupNumber} 组完成</p>
      <h1>{summary.reviewed} 词</h1>
      <p className="summary-lead">其中 {summary.mastered} 个词已进入熟词本，其余词会在整轮结束后再见。</p>
      <button className="primary-button" type="button" onClick={onContinue}>继续第 {nextGroup} / {totalGroups} 组</button>
      <button className="text-button summary-home" type="button" onClick={onHome}>先回首页</button>
    </main>
  )
}

function SummaryScreen({ state, onHome }: { state: StudyStateV3; onHome: () => void }) {
  const summary = state.lastSummary
  return (
    <main className="summary-page page">
      <p className="round-label">今天结束</p>
      <h1>{summary?.groups ?? 0} 组</h1>
      <p className="summary-lead">今天完成 {summary?.reviewed ?? 0} 词，标为熟词 {summary?.mastered ?? 0} 个。</p>
      <dl className="summary-list">
        <div><dt>今日学习</dt><dd>{summary?.reviewed ?? 0} 词</dd></div>
        <div><dt>本轮还剩</dt><dd>{summary?.roundRemaining ?? 0}</dd></div>
        <div><dt>熟词本</dt><dd>{state.masteredIds.length}</dd></div>
      </dl>
      {summary?.roundCompleted && !state.allCompleted ? <p className="round-complete">这一轮已经完成，下一轮从下次中午 12 点刷新后开始。</p> : null}
      {state.allCompleted ? <p className="round-complete">当前学习池已经全部过完。</p> : null}
      <button className="primary-button" type="button" onClick={onHome}>返回首页</button>
    </main>
  )
}

interface SettingsProps {
  state: StudyStateV3
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
          <span><strong>导出备份</strong><small>保存当前轮次、小组位置和熟词本</small></span><b>导出</b>
        </button>
        <button className="settings-row" type="button" onClick={() => inputRef.current?.click()}>
          <span><strong>导入备份</strong><small>兼容旧版进度，只接受当前词表</small></span><b>选择文件</b>
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
          <p>基础词条整理自《考研大纲词汇乱序版》，详情页始终先显示大纲原释义；{wordDetailsMeta.coreMeaningCount} 个词另有红宝书补充释义，收录 {wordDetailsMeta.collocationCount} 条固定搭配、{wordDetailsMeta.exampleCount} 条红宝书例句与 {wordDetailsMeta.relatedWordCount} 条相关词记录；{wordDetailsMeta.examEntryCount} 个词带有 2010—2025 英语一真题语境，并提供 {wordDetailsMeta.examTranslationCount} 条对应译文。App 不包含原 PDF。</p>
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
                <p>清空后无法撤销，熟词本也会清空。建议先导出备份。</p>
                <button className="secondary-button" type="button" onClick={onExport}>导出备份</button>
                <button className="danger-button" type="button" onClick={() => setResetStep(2)}>继续重置</button>
              </>
            ) : (
              <>
                <h2 id="reset-title">确定从第 1 轮重来？</h2>
                <p>当前轮次、小组位置和熟词本都会被清除。</p>
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
