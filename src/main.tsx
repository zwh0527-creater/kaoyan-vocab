import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import studyMeaningsUrl from './data/study-meanings.json?url'
import wordsUrl from './data/words.json?url'
import { startPwaRegistration } from './pwa'
import type { StudyMeaningEntry, WordEntry } from './types'
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

void Promise.all([fetch(wordsUrl), fetch(studyMeaningsUrl)])
  .then(async ([wordsResponse, meaningsResponse]) => {
    if (!wordsResponse.ok || !meaningsResponse.ok) throw new Error('Vocabulary request failed')
    return Promise.all([
      wordsResponse.json() as Promise<WordEntry[]>,
      meaningsResponse.json() as Promise<StudyMeaningEntry[]>
    ])
  })
  .then(([words, meanings]) => {
    if (!Array.isArray(words) || words.length === 0 || meanings.length !== words.length) {
      throw new Error('Vocabulary is incomplete')
    }
    const enrichedWords = words.map((word, index) => {
      const studyMeaning = meanings[index]
      if (studyMeaning.wordId !== word.id || !studyMeaning.meaning) {
        throw new Error(`Meaning mismatch at ${word.word}`)
      }
      return {
        ...word,
        studyMeaning: studyMeaning.meaning,
        studyMeaningStatus: studyMeaning.status
      }
    })
    renderApp(enrichedWords)
  })
  .catch(() => {
    root.render(
      <main className="bootstrap-screen error">
        <strong>词表暂时无法载入</strong>
        <span>请联网打开一次，离线内容准备好后即可正常使用。</span>
      </main>
    )
  })
