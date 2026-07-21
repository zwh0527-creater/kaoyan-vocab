import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import wordsUrl from './data/words.json?url'
import { startPwaRegistration } from './pwa'
import type { WordEntry } from './types'
import './styles.css'

startPwaRegistration()

const root = createRoot(document.getElementById('root')!)

function renderApp(words: WordEntry[]) {
  root.render(
    <StrictMode>
      <App words={words} />
    </StrictMode>
  )
}

root.render(<main className="bootstrap-screen"><span>正在打开词表…</span></main>)

void fetch(wordsUrl)
  .then((response) => {
    if (!response.ok) throw new Error('Vocabulary request failed')
    return response.json() as Promise<WordEntry[]>
  })
  .then((words) => {
    if (!Array.isArray(words) || words.length === 0) throw new Error('Vocabulary is empty')
    renderApp(words)
  })
  .catch(() => {
    root.render(
      <main className="bootstrap-screen error">
        <strong>词表暂时无法载入</strong>
        <span>请联网打开一次，离线内容准备好后即可正常使用。</span>
      </main>
    )
  })
