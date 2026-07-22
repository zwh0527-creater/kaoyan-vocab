export function wordLengthClass(word: string) {
  if (word.length >= 15) return 'word-length-extra-long'
  if (word.length >= 12) return 'word-length-long'
  return ''
}
