# Grouped Study And Mastered Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the offline vocabulary PWA to 20-word groups, explicit mastered-word handling, per-word restoration, and a calmer editorial dictionary study screen with English I–relevant collocations.

**Architecture:** Replace the V1 “mark unfamiliar” engine with a V2 group-atomic state machine while retaining a strict V1 migration path. Keep the immutable 5493-word corpus and its fingerprint unchanged; store optional collocations in a separately versioned static dataset. Split the oversized study UI into focused screen and sheet components, while keeping routing and persistence orchestration in `App.tsx`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, vite-plugin-pwa, browser localStorage, macOS PDFKit/Vision for build-time OCR, static JSON assets.

---

## File Map

- Modify `src/types.ts`: retain V1 types and add V2 study, summary, backup, and collocation types.
- Modify `src/studyEngine.ts`: implement group selectors, group completion, rollover, familiar restoration, and V1 migration.
- Modify `src/studyEngine.test.ts`: lock down group, day, round, familiar, and migration rules.
- Modify `src/storage.ts`: load V2 first, migrate V1 safely, validate V2 backups, and keep invalid imports non-destructive.
- Modify `src/storage.test.ts`: verify V1/V2 persistence and rejection cases.
- Create `src/data/word-details.json`: optional static collocations keyed by word ID.
- Create `src/data/word-details-meta.json`: independent detail dataset version, count, and fingerprint.
- Create `scripts/extract-redbook-collocations.swift`: OCR only headwords and `【词组】` blocks from the supplied red-book PDF.
- Create `scripts/build-word-details.mjs`: normalize OCR candidates, map to the base corpus, filter unsafe/noisy content, and emit validated JSON.
- Modify `src/data.test.ts`: validate the detail dataset without changing the base corpus assertion.
- Create `src/components/StudyScreen.tsx`: render only the active 20-word group.
- Create `src/components/WordDetailSheet.tsx`: accessible bottom sheet for meaning and collocations.
- Create `src/components/MasteredBookScreen.tsx`: lightweight English/Chinese list with per-word restore.
- Modify `src/App.tsx`: orchestrate screens, group summaries, storage, and speech.
- Modify `src/styles.css`: implement the editorial dictionary visual system and responsive states.
- Modify `README.md`: preserve the user's existing live URL/source edits and add the new learning rules.

### Task 1: Define And Test The V2 State Machine

**Files:**
- Modify: `src/types.ts`
- Modify: `src/studyEngine.ts`
- Test: `src/studyEngine.test.ts`

- [ ] **Step 1: Replace the V1-only engine tests with V2 behavior tests**

Add focused tests using the public API below:

```ts
import {
  completeGroup,
  createInitialState,
  currentGroupIds,
  markGroupSeen,
  restoreMastered,
  rolloverToDate,
  togglePendingMastered
} from './studyEngine'

it('creates fifteen groups of twenty for the first day', () => {
  const state = createInitialState(ids, 'fingerprint', '2026-07-12')
  expect(state.dailyBatch).toHaveLength(300)
  expect(currentGroupIds(state)).toEqual(ids.slice(0, 20))
})

it('sends only unmarked words to the next round', () => {
  let state = createInitialState(ids.slice(0, 20), 'fingerprint', '2026-07-12')
  for (const id of ids.slice(0, 15)) state = togglePendingMastered(state, id)
  state = markGroupSeen(state, 19)
  state = completeGroup(state)
  expect(state.masteredIds).toEqual(ids.slice(0, 15))
  expect(state.nextRoundQueue).toEqual(ids.slice(15, 20))
})

it('restores exactly one mastered word without changing the current group', () => {
  const before = { ...finishedState, masteredIds: [1, 2, 3], allCompleted: true }
  const after = restoreMastered(before, 2, ids)
  expect(after.masteredIds).toEqual([1, 3])
  expect(after.nextRoundQueue).toEqual([2])
  expect(after.dailyBatch).toEqual(before.dailyBatch)
})
```

- [ ] **Step 2: Run the engine test and confirm the expected failure**

Run: `npm test -- --run src/studyEngine.test.ts`

Expected: FAIL because the V2 functions and fields do not exist.

- [ ] **Step 3: Add V2 types while retaining V1 migration types**

Define these exact public shapes in `src/types.ts`:

```ts
export interface StudySummaryV2 {
  reviewed: number
  groups: number
  mastered: number
  roundRemaining: number
  roundCompleted: boolean
}

export interface StudyStateV2 {
  schemaVersion: 2
  corpusFingerprint: string
  round: number
  currentQueue: number[]
  nextRoundQueue: number[]
  sessionDate: string
  dailyBatch: number[]
  completedGroups: number
  groupSeenCount: number
  groupScrollIndex: number
  pendingMasteredIds: number[]
  masteredIds: number[]
  completedToday: boolean
  allCompleted: boolean
  lastSummary: StudySummaryV2 | null
}

export interface BackupV2 {
  format: 'kaoyan-vocab-backup'
  version: 2
  exportedAt: string
  corpusFingerprint: string
  state: StudyStateV2
}
```

- [ ] **Step 4: Implement the group-atomic engine**

Expose these constants and functions from `src/studyEngine.ts`:

```ts
export const DAILY_LIMIT = 300
export const GROUP_SIZE = 20

export function currentGroupIds(state: StudyStateV2) {
  const start = state.completedGroups * GROUP_SIZE
  return state.dailyBatch.slice(start, start + GROUP_SIZE)
}

export function dailyGroupCount(state: StudyStateV2) {
  return Math.ceil(state.dailyBatch.length / GROUP_SIZE)
}
```

`completeGroup` must require every active-group word to be seen, move pending mastered IDs into `masteredIds`, append every unmarked ID to `nextRoundQueue`, then either advance one group or settle the day. `rolloverToDate` must keep the incomplete group and later groups, reset the incomplete group's reading position, top up only from `currentQueue`, and begin `nextRoundQueue` only on a later local date after the current round finishes. `restoreMastered` must remove one ID from `masteredIds`, insert only that ID into `nextRoundQueue` in corpus order, clear `allCompleted`, and leave `dailyBatch` untouched.

- [ ] **Step 5: Run the engine tests**

Run: `npm test -- --run src/studyEngine.test.ts`

Expected: all state-engine tests PASS, including 300/15 grouping, 15 familiar + 285 waiting, incomplete-group rollover, short final day, no cross-round mixing, and one-word restoration.

- [ ] **Step 6: Commit the engine change**

```bash
git add src/types.ts src/studyEngine.ts src/studyEngine.test.ts
git commit -m "feat: add grouped mastery study engine"
```

### Task 2: Migrate And Validate Local Progress

**Files:**
- Modify: `src/storage.ts`
- Modify: `src/storage.test.ts`
- Modify: `src/studyEngine.ts`
- Test: `src/studyEngine.test.ts`

- [ ] **Step 1: Add failing migration and backup tests**

Cover these exact outcomes:

```ts
it('migrates V1 without inventing mastered words', () => {
  const migrated = migrateV1ToV2(v1State, ids, '2026-07-12')
  expect(migrated.masteredIds).toEqual([])
  expect(new Set([
    ...migrated.currentQueue,
    ...migrated.dailyBatch,
    ...migrated.nextRoundQueue
  ])).toEqual(new Set(ids))
})

it('rejects an invalid V2 backup without mutating current state', () => {
  const current = createInitialState(ids, 'fingerprint', '2026-07-12')
  expect(() => parseBackup(invalidJson, 'fingerprint', ids)).toThrow()
  expect(current.masteredIds).toEqual([])
})
```

- [ ] **Step 2: Run migration and storage tests to verify failure**

Run: `npm test -- --run src/studyEngine.test.ts src/storage.test.ts`

Expected: FAIL because V1 migration and V2 validation are absent.

- [ ] **Step 3: Implement deterministic V1 migration**

Add `migrateV1ToV2(state, allWordIds, sessionDate)` in `studyEngine.ts`. Set `masteredIds` and `pendingMasteredIds` to empty. Treat complete 20-word boundaries from the V1 `seenCount` as processed but unmastered, retain the incomplete group from its first word, include every historically removed ID in `nextRoundQueue`, and sort/de-duplicate all queues by `allWordIds`.

- [ ] **Step 4: Upgrade storage and backup parsing**

Use `kaoyan-vocab.study.v2` as the new storage key while retaining a read-only fallback to `kaoyan-vocab.study.v1`. Validate queue uniqueness, ID membership, active-group pending marks, group bounds, and corpus fingerprint. Accept backup versions 1 and 2; migrate version 1 before returning. Do not write anything until parsing and validation have succeeded.

- [ ] **Step 5: Run storage and engine tests**

Run: `npm test -- --run src/studyEngine.test.ts src/storage.test.ts`

Expected: PASS for V1 migration, V2 round trip, damaged JSON, wrong corpus, illegal IDs, duplicate queues, and per-word mastered restoration.

- [ ] **Step 6: Commit persistence changes**

```bash
git add src/storage.ts src/storage.test.ts src/studyEngine.ts src/studyEngine.test.ts
git commit -m "feat: migrate study progress to v2"
```

### Task 3: Build The Optional Collocation Dataset

**Files:**
- Create: `scripts/extract-redbook-collocations.swift`
- Create: `scripts/build-word-details.mjs`
- Create: `src/data/word-details.json`
- Create: `src/data/word-details-meta.json`
- Modify: `src/types.ts`
- Modify: `src/data.test.ts`

- [ ] **Step 1: Add failing static-data validation**

Add types and assertions:

```ts
export interface CollocationEntry {
  phrase: string
  meaning: string
  relevance: 'english-1' | 'postgraduate' | 'general'
}

export interface WordDetailEntry {
  wordId: number
  collocations: CollocationEntry[]
}
```

The test must reject unknown word IDs, duplicate detail records, empty strings, duplicate phrases, more than three phrases, and non-corpus order. It must separately assert that `words.json` still contains exactly 5493 entries and that `corpus-meta.json` is unchanged.

- [ ] **Step 2: Run data tests and confirm failure**

Run: `npm test -- --run src/data.test.ts`

Expected: FAIL because the detail assets do not exist.

- [ ] **Step 3: Extract red-book candidates with local OCR**

Implement a Swift command that uses PDFKit to render one page at a time and Vision `VNRecognizeTextRequest` with `recognitionLanguages = ["zh-Hans", "en-US"]`. Emit newline-delimited JSON containing only page number, detected headword, and lines under `【词组】`. It must not copy page images, long examples, memory notes, or analysis blocks into the repository.

Run:

```bash
swift scripts/extract-redbook-collocations.swift \
  "/Users/zhangweihao/27考研红宝书 考研英语词汇 【公众号：南山锅锅】.pdf" \
  /tmp/redbook-collocations.ndjson
```

Expected: the output contains parseable candidate records and the repository contains no extracted scan images.

- [ ] **Step 4: Normalize, match, and filter candidates**

Implement `build-word-details.mjs` to restore `~` to the current headword, normalize whitespace, reject phrases with unmatched brackets or OCR replacement characters, reject domain labels and sentences longer than 80 characters, match headwords case-insensitively while writing the base word ID, keep at most three distinct phrases, and label red-book candidates `postgraduate`. The script must emit a SHA-256 fingerprint over the final JSON.

- [ ] **Step 5: Generate and validate details**

Run:

```bash
node scripts/build-word-details.mjs \
  --words src/data/words.json \
  --ocr /tmp/redbook-collocations.ndjson \
  --output src/data/word-details.json \
  --meta src/data/word-details-meta.json
npm test -- --run src/data.test.ts
```

Expected: PASS. Words without reliable phrases remain absent or have an empty phrase list; no synthetic phrase is added merely to increase coverage.

- [ ] **Step 6: Commit detail data and reproducible scripts**

```bash
git add scripts/extract-redbook-collocations.swift scripts/build-word-details.mjs src/data/word-details.json src/data/word-details-meta.json src/data.test.ts src/types.ts
git commit -m "feat: add offline postgraduate collocations"
```

### Task 4: Build Focused Study And Mastered-Book Screens

**Files:**
- Create: `src/components/StudyScreen.tsx`
- Create: `src/components/WordDetailSheet.tsx`
- Create: `src/components/MasteredBookScreen.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the detail sheet**

`WordDetailSheet` receives `word`, optional `detail`, and `onClose`. Render a dialog with an explicit close button, the base meaning, and zero to three phrase rows. When phrases are missing, render `暂未收录可靠搭配`. Move focus into the dialog on open, close on Escape or backdrop click, and restore focus to the triggering button.

- [ ] **Step 2: Create the 20-word study screen**

Render only `currentGroupIds(state)`. A word-body click toggles its local revealed-meaning ID; it never changes mastery. The `熟词` button calls `togglePendingMastered`; `详解` opens the sheet; pronunciation uses the existing speech synthesis path. Enable `完成本组` only when `groupSeenCount` equals the group length.

- [ ] **Step 3: Create the minimal mastered book**

Render English, Chinese meaning, and one `重新学习` button per word. Keep the original corpus order. Use incremental rendering in chunks so a nearly full 5493-word book does not mount every row at once. Each button calls `restoreMastered` for only its own ID.

- [ ] **Step 4: Rewire App orchestration**

Extend `Screen` with `group-summary` and `mastered`. Initialize with `loadStudyState(corpusFingerprint, allWordIds)`. Add home progress for groups and words, a familiar-book entry, group-summary continuation, daily summary, V1 import migration, V2 export, and reset behavior. Preserve install guide, offline notification, update-ready behavior, and the user's existing speech fallback.

- [ ] **Step 5: Run TypeScript and unit tests**

Run: `npm test -- --run && npm run build`

Expected: all tests PASS and Vite production build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit the UI behavior**

```bash
git add src/App.tsx src/components src/types.ts
git commit -m "feat: add grouped study and mastered book screens"
```

### Task 5: Apply The Editorial Dictionary Visual System

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Replace the dense row system with an editorial rhythm**

Use the existing warm-paper tokens as the base, remove decorative glow, and keep one continuous reading surface. Give each word row generous vertical space, large serif English, quiet phonetics, readable 15px Chinese, fine rules, and a separate low-emphasis action line. Avoid card shadows, nested cards, glass effects, gradients, and decorative icons.

- [ ] **Step 2: Style mastery, details, summaries, and dark mode**

Make `熟词` an outlined action and `已熟` a pale oxblood state. Style the detail sheet as a paper panel with a large headword and simple phrase dividers. Keep group summaries typographic instead of celebratory. Provide equivalent dark tokens, 44px controls, safe-area padding, visible focus rings, and a no-motion media query.

- [ ] **Step 3: Verify responsive layout in browser**

Start: `npm run dev -- --host 127.0.0.1`

Check 320x844, 375x812, 390x844, and 430x932. Verify no horizontal overflow, no clipped detail sheet, reachable controls, readable hidden/revealed meanings, and stable scroll position.

- [ ] **Step 4: Commit the visual redesign**

```bash
git add src/styles.css
git commit -m "style: redesign study flow as editorial dictionary"
```

### Task 6: Regression, Offline, Documentation, And Release

**Files:**
- Modify: `README.md`
- Verify: `vite.config.ts`, generated `dist/`, GitHub Pages workflow

- [ ] **Step 1: Update README without overwriting user changes**

Preserve the existing live URL, 5493-word source note, and publish instructions. Change the old “only unfamiliar words continue” wording to the V2 rule: unmarked words continue to the next round, only explicitly mastered words leave, and the mastered book restores one word at a time.

- [ ] **Step 2: Run the complete automated suite**

Run:

```bash
npm test -- --run
npm run build
```

Expected: all tests PASS and `dist/` builds successfully.

- [ ] **Step 3: Run mobile and offline acceptance checks**

Verify the first 300 words form 15 groups, a 15-mastered day leaves 285 for the next round, tomorrow continues the current round's unseen words, partial groups repeat only within that group, one restored mastered word does not change other mastered words, backups round-trip, and airplane-mode study/detail/mastery/save all work. Confirm updates do not refresh an active study screen.

- [ ] **Step 4: Commit documentation and any verified QA-only fixes**

```bash
git add README.md
git commit -m "docs: explain grouped mastery workflow"
```

- [ ] **Step 5: Push and verify GitHub Pages**

Run: `git push origin main`

Expected: GitHub Actions completes successfully and the published HTTPS PWA shows the V2 study flow. Re-open after one successful load with network disabled and confirm the core path remains usable.
