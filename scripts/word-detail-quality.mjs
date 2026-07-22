const MEANING_STOP_CHARACTERS = new Set(
  [...'的了和或等是有在为以其与及把被可使指对中上一下者人事物某种时地而从于之个将也做来去由作表示用于尤常更']
)

const TRUSTED_SECONDARY_SENSES = new Set([
  'finding',
  'gracious',
  'indication'
])

function chineseCharacters(value) {
  return new Set(
    [...(String(value).match(/[\u3400-\u9fff]/g) ?? [])]
      .filter((character) => !MEANING_STOP_CHARACTERS.has(character))
  )
}

function delimitersAreBalanced(value, open, close) {
  let depth = 0
  for (const character of value) {
    if (character === open) depth += 1
    if (character === close) depth -= 1
    if (depth < 0) return false
  }
  return depth === 0
}

function hasAmbiguousCaseVariant(word, sameHeadwordEntries) {
  const lowercase = word.word.toLowerCase()
  return sameHeadwordEntries.length > 1 &&
    word.word !== lowercase &&
    sameHeadwordEntries.some((entry) => entry.word === lowercase)
}

export function assessCoreMeaning(word, coreMeaning, sameHeadwordEntries = [word]) {
  if (!coreMeaning || !/[\u3400-\u9fff]/.test(coreMeaning)) return 'missing'
  if (hasAmbiguousCaseVariant(word, sameHeadwordEntries)) return 'ambiguous-case'

  const balanced = [
    ['（', '）'],
    ['(', ')'],
    ['［', '］'],
    ['[', ']']
  ].every(([open, close]) => delimitersAreBalanced(coreMeaning, open, close))
  const hasOcrDamage = /[�□■◆』]|[•·]{2,}|[…⋯][•·]|[•·][…⋯]/.test(coreMeaning) ||
    /[（(［[、，,；;：:]$/.test(coreMeaning)
  if (!balanced || hasOcrDamage) return 'malformed-ocr'

  const baseCharacters = chineseCharacters(word.meaning)
  const detailCharacters = chineseCharacters(coreMeaning)
  const hasSharedMeaning = [...baseCharacters].some((character) => detailCharacters.has(character))
  if (!hasSharedMeaning && !TRUSTED_SECONDARY_SENSES.has(word.word.toLowerCase())) {
    return 'semantic-mismatch'
  }
  return null
}

export function syllabusExamSense(meaning) {
  return String(meaning)
    .replace(/^(?:(?:vt|vi|v|n|adj|adv|prep|pron|conj|num|art|aux)\.?\s*(?:\.\/|[./、])?\s*)+/i, '')
    .trim()
    .split(/[；;]/)
    .slice(0, 4)
    .join('；')
}
