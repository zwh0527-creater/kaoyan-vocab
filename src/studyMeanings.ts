import type { StudyMeaningStatus, WordEntry } from './types'

export function studyMeaningFor(word: WordEntry) {
  return word.studyMeaning?.trim() || word.meaning
}

export function studyMeaningSourceLabel(status?: StudyMeaningStatus) {
  if (status === 'curated') return '人工校订 · 对照大纲、通用词典与考研词库'
  if (status === 'triple-cross-checked') return '考研大纲释义 · 词头及已有义项经三份词库交叉核对'
  if (status === 'cross-checked') return '考研大纲释义 · 词头及已有义项经公开词库交叉核对'
  if (status === 'dictionary-reviewed') return '人工复核 · 词典来源存在措辞差异'
  if (status === 'source-cross-checked') return '考研词表释义 · 词头经 ECDICT 核对'
  return '考研词表释义'
}
