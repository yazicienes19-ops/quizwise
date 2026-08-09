# 002 — Make the streak star update when activity is recorded in the same session

- **Status**: DONE (2026-08-09 — merged by hand after the isolated-worktree executor's base commit turned out to be 8 commits stale; verified the final diff against current HEAD exactly matches this plan's Steps, `tsc --noEmit` clean)
- **Commit**: 3d6aefc
- **Severity**: HIGH
- **Category**: Missed opportunity (AUDIT.md §8) — a rare, high-emotion moment (reaching today's streak goal) currently renders with stale state instead of the reward it should be.
- **Estimated scope**: 2 files (`services/streakService.ts`, `components/Layout.tsx`).

## Problem

`/Users/enesyazici/Desktop/quizwise/components/Layout.tsx:103`:

```tsx
// components/Layout.tsx:103 — current
const streak = useMemo(() => getStreak(), []);
```

This computes the streak exactly once, on Layout's first render, and never again — the empty dependency array means the memo is frozen for the component's entire lifetime, regardless of how many times Layout re-renders for other reasons.

`recordActivity()` (the function that actually advances the streak) is called from four different descendant components, none of which share any prop or state with `Layout` that would cause it to re-render with fresh data:

- `/Users/enesyazici/Desktop/quizwise/hooks/useQuizState.ts:291,308`
- `/Users/enesyazici/Desktop/quizwise/components/AppContent.tsx:383,449`
- `/Users/enesyazici/Desktop/quizwise/components/FlashcardSystem.tsx:275,387`
- `/Users/enesyazici/Desktop/quizwise/components/GraphLearningOverlay.tsx:225,283,345`

Two places in `Layout.tsx` read `streak.todayDone` to decide whether to render the star filled gold or as a muted outline (`components/Layout.tsx:199-208` in the desktop sidebar, `components/Layout.tsx:494-503` in the mobile bar). Today, a user can finish a quiz, fill their streak for the day, and the star will keep showing the unfilled/muted state until they reload the app or navigate in a way that happens to remount `Layout` — the exact moment the product is supposed to reward them passes silently.

## Target

`streakService.ts` announces real updates via a `window` `CustomEvent`; `Layout.tsx` listens for it and re-reads `getStreak()`. Only fires when the streak data actually changed (not on every `recordActivity()` call — `recordActivity()` already no-ops if today was already counted, see `services/streakService.ts:48-52`), so no extra event traffic is introduced for repeat calls within the same day.

```ts
/* services/streakService.ts — target, additions only */

export const STREAK_UPDATED_EVENT = 'studearc:streak-updated';

export const recordActivity = (userId?: string | null): StreakData => {
  const data = load();
  const today = todayStr();

  if (data.lastDay === today) return data; // heute schon gezählt

  if (data.lastDay === yesterdayStr()) {
    data.current += 1;
  } else {
    data.current = 1;
  }
  data.lastDay = today;
  if (data.current > data.best) data.best = data.current;

  save(data);
  window.dispatchEvent(new CustomEvent(STREAK_UPDATED_EVENT));
  if (userId) {
    import('./syncService').then(({ syncLearningField }) => syncLearningField(userId, 'streak', data)).catch(() => {});
  }
  return data;
};
```

```tsx
/* components/Layout.tsx — target, replaces the useMemo at line 103 */
import { getStreak, STREAK_UPDATED_EVENT } from '../services/streakService';
// ...
const [streak, setStreak] = useState(() => getStreak());
useEffect(() => {
  const handleStreakUpdate = () => setStreak(getStreak());
  window.addEventListener(STREAK_UPDATED_EVENT, handleStreakUpdate);
  return () => window.removeEventListener(STREAK_UPDATED_EVENT, handleStreakUpdate);
}, []);
```

## Repo conventions to follow

- `Layout.tsx` already imports `useState` and `useEffect` from React (`components/Layout.tsx:2` — `import React, { useState, useEffect, useMemo } from 'react';`), so no new import statement for React hooks is needed, only the `getStreak`/`STREAK_UPDATED_EVENT` import needs updating.
- Follow the existing `window.addEventListener` + cleanup-in-return pattern already used elsewhere in this codebase for the same shape of problem (search `hooks/` and `components/` for any existing `addEventListener`/`removeEventListener` pair as a style reference if one exists; otherwise the block above is self-contained and correct as written).
- Do not introduce a global event-bus abstraction or pub-sub library — a single named `CustomEvent` on `window` is the minimal, sufficient mechanism here and matches the scale of the problem (one producer function, one consumer component).

## Steps

1. Open `/Users/enesyazici/Desktop/quizwise/services/streakService.ts`. Add `export const STREAK_UPDATED_EVENT = 'studearc:streak-updated';` near the top of the file, after the `STREAK_KEY` constant (currently at line 14).
2. In the same file, inside `recordActivity` (currently lines 48-62), add `window.dispatchEvent(new CustomEvent(STREAK_UPDATED_EVENT));` immediately after the `save(data);` call (currently line 58) and before the `if (userId) { ... }` block.
3. Open `/Users/enesyazici/Desktop/quizwise/components/Layout.tsx`. Change the import at line 6 from `import { getStreak } from '../services/streakService';` to `import { getStreak, STREAK_UPDATED_EVENT } from '../services/streakService';`.
4. Replace line 103, `const streak = useMemo(() => getStreak(), []);`, with:
   ```tsx
   const [streak, setStreak] = useState(() => getStreak());
   useEffect(() => {
     const handleStreakUpdate = () => setStreak(getStreak());
     window.addEventListener(STREAK_UPDATED_EVENT, handleStreakUpdate);
     return () => window.removeEventListener(STREAK_UPDATED_EVENT, handleStreakUpdate);
   }, []);
   ```
5. Confirm `useMemo` is still used elsewhere in `Layout.tsx` (it is, for `dueMistakesCount` and the due-cards count a few lines above) — do not remove the `useMemo` import.

## Boundaries

- Do NOT change `recordActivity`'s signature, return value, or its idempotent-per-day behavior (the `if (data.lastDay === today) return data;` early-return at `services/streakService.ts:52` must stay exactly as-is — it's what prevents the event from firing on every no-op call).
- Do NOT touch any of the four call sites of `recordActivity()` (`useQuizState.ts`, `AppContent.tsx`, `FlashcardSystem.tsx`, `GraphLearningOverlay.tsx`) — the event mechanism means none of them need to change.
- Do NOT touch the day-rollover self-correction logic inside `getStreak()` (`services/streakService.ts:65-75`) — that is a separate, pre-existing concern (streak expiring while the tab stays open across midnight) and out of scope for this plan.
- Do NOT add any new npm dependency — `CustomEvent`/`window.addEventListener` are native browser APIs.

## Verification

- **Mechanical**: `npx tsc --noEmit` passes. `npx vitest run services/streakService.test.ts` passes (existing tests must not break — none of them assert on `window.dispatchEvent`, so they should be unaffected, but confirm).
- **Feel check**:
  - In the browser with the sidebar visible, open two things that both call `recordActivity()` on completion in the same session — e.g. finish a quiz (`useQuizState.ts`), then separately review 5 flashcards (`FlashcardSystem.tsx:275/387`, which requires `sessionReviewCount.current === 5`). After whichever action completes first and actually flips `todayDone` from `false` to `true` for the day, confirm the sidebar star (`Layout.tsx:199-208`) and the mobile bar star (`Layout.tsx:494-503`) switch from muted/outline to filled gold **without a page reload or navigation**.
  - Repeat the same activity a second time in the same session (e.g. finish a second quiz) and confirm no visible flicker or redundant re-render happens — `recordActivity`'s early return means `STREAK_UPDATED_EVENT` should not fire again once `todayDone` is already `true` for the day.
- **Done when**: the streak star visibly updates in the same session, immediately after the activity that completes the day's streak, with no reload required.
