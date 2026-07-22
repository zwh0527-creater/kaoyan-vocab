import type { StudyMeaningStatus, WordEntry } from './types'

export function studyMeaningFor(word: WordEntry) {
  return word.studyMeaning?.trim() || word.meaning
}

export function studyMeaningSourceLabel(status?: StudyMeaningStatus) {
  if (status === 'curated') return '人工校订 · 对照大纲、通用词典与考研词库'
  if (status === 'triple-cross-checked') return '考研大纲释义 · 已与 ECDICT 及两份公开考研词库逐词对照'
  if (status === 'cross-checked') return '考研大纲释义 · 已与 ECDICT 及公开考研词库逐词对照'
  if (status === 'dictionary-reviewed') return '人工复核 · 词典来源存在措辞差异'
  if (status === 'source-cross-checked') return '考研词表释义 · 已与 ECDICT 逐词核对'
  return '考研词表释义'
}
