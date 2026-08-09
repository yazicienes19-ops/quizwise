# 003 — Gate `:hover` motion behind `(hover: hover)` and honor `prefers-reduced-motion` systemically

- **Status**: DONE (2026-08-09 — `tailwind.config.cjs`/`app.css` applied as planned; the GraphCanvas.tsx step was applied by hand after the isolated-worktree executor's base commit turned out to predate the entire Wissensnetz feature — it still had the old `MindmapCanvas.tsx`. Fixed the real `GraphCanvas.tsx` directly, matching the plan's intent exactly. `tsc --noEmit` and `npm run build` both clean.)
- **Commit**: 3d6aefc
- **Severity**: HIGH
- **Category**: Accessibility (AUDIT.md §6)
- **Estimated scope**: 3 files (`tailwind.config.cjs`, `app.css`, `components/GraphCanvas.tsx`). Zero of the 119 individual `hover:scale-*` call sites need to change — the Tailwind `hover` variant itself gets redefined once, globally.

## Problem

### 6.1 — Ungated `:hover` motion (systemic)

`@media (hover: hover) and (pointer: fine)` appears **zero times** in this codebase. Tailwind's `hover:` variant compiles to a plain `:hover` pseudo-class by default. There are 119 `hover:scale-*`/`hover:translate-*` usages across dozens of files, e.g.:

- `/Users/enesyazici/Desktop/quizwise/components/Dashboard.tsx:239,271,305,355,401` — `hover:scale-[1.02]` / `hover:scale-110`
- `/Users/enesyazici/Desktop/quizwise/components/AppContent.tsx:279,297,420` — `hover:scale-105 active:scale-95`
- `/Users/enesyazici/Desktop/quizwise/components/ChapterSelectorModal.tsx:151` — `hover:scale-[1.02] active:scale-95`

On touch devices, tapping any of these elements fires the `:hover` state (there is no real "hover" on touch, but browsers simulate it on tap), and the scaled-up transform stays visually "stuck" until the user taps elsewhere. This is a mobile-first study app — nearly every interactive element in it has this false-positive.

### 6.2 — `prefers-reduced-motion` is handled in only 4 narrow places

Confirmed via `grep -rn "prefers-reduced-motion" app.css components/`: exactly 4 blocks exist, all decorative-only —
- `app.css:230` — `.animate-card-enter` (see 6.3 below — also has its own bug)
- `app.css:237` — `.brand-spinner`
- `app.css:250` — `.reveal` / `.draw-arc` (landing page scroll-reveal)
- `components/GraphCanvas.tsx:994` — `.wn-float` / `.wn-breathe` (idle node float/breathe loop)

`useReducedMotion` (the framer-motion hook) is imported nowhere in the codebase (`grep -rn "useReducedMotion"` → 0 hits), even though `framer-motion` is used in exactly one file, `GraphCanvas.tsx` — meaning the app's one JS-driven motion path is completely unguarded. The global button press-feedback rule (`app.css:256-262`, applies to every button in the app) and the Layout sidebar collapse transition (`Layout.tsx:162,174`) are likewise unguarded, along with all 119 hover sites from 6.1.

### 6.3 — Existing reduced-motion override removes feedback instead of trimming movement

`/Users/enesyazici/Desktop/quizwise/app.css:225-231`:

```css
/* app.css:225-231 — current */
.animate-card-enter {
    animation: cardEnter 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(var(--stagger-i, 0) * 60ms);
}
@media (prefers-reduced-motion: reduce) {
    .animate-card-enter { animation: none; }
}
```

`cardEnter` combines `opacity: 0→1` with `transform: translateY(10px)→0`. Setting `animation: none` removes the opacity fade along with the position shift — under reduced motion, an element whose only route to `opacity: 1` was this animation could be left stuck at `opacity: 0`. AUDIT.md §6: "Reduced motion means fewer and gentler animations, not zero — keep opacity/color transitions that aid comprehension, remove position changes." Contrast with the correct pattern already in the same file at `app.css:250-253` (`.reveal { opacity: 1; transform: none; transition: none; }` — explicitly forces the visible end-state).

## Target

### Fix for 6.1 — redefine Tailwind's `hover` variant globally

```js
/* tailwind.config.cjs — target */
const plugin = require('tailwindcss/plugin');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [ /* ...unchanged... */ ],
  darkMode: 'class',
  theme: { /* ...unchanged... */ },
  plugins: [
    plugin(function ({ addVariant }) {
      addVariant('hover', '@media (hover: hover) and (pointer: fine) { &:hover }');
    }),
  ],
};
```

This makes every existing `hover:*` utility in every file compile with the media guard automatically — no component file changes needed.

### Fix for 6.2 — global CSS kill-switch + one JS branch for the one Framer Motion path

```css
/* app.css — add near the existing prefers-reduced-motion blocks (after app.css:253) */

/* ── Global reduced-motion fallback: collapses all transition/animation
   durations app-wide so movement stops being perceptible, while opacity/
   color state changes still happen (near-instantly) instead of being
   deleted. The 4 existing specific overrides above remain and take
   precedence for the cases they already hand-tune; this is the safety
   net for everything else (119 hover sites, the global button press
   effect, the sidebar collapse, and any future untouched component). ── */
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}
```

```tsx
/* components/GraphCanvas.tsx — target for the node motion.g block */
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
// ...
const shouldReduceMotion = useReducedMotion();
// ...inside the component that renders the node list, before the .map():
const nodeInitial = shouldReduceMotion
  ? { x: pos.x, y: pos.y, opacity: 1, scale: 1 }
  : { x: pos.x, y: pos.y, opacity: 0, scale: 0.6 };
const nodeExit = shouldReduceMotion
  ? { opacity: 1, scale: 1 }
  : { opacity: 0, scale: 0.6 };
// ...
<motion.g
  key={node.id}
  {...{ [NODE_DATA_ATTR]: true }}
  initial={nodeInitial}
  animate={{ x: pos.x, y: pos.y, opacity: 1, scale: 1 }}
  exit={nodeExit}
  ...
```

### Fix for 6.3

```css
/* app.css:230-232 — target */
@media (prefers-reduced-motion: reduce) {
    .animate-card-enter { animation: none; opacity: 1; transform: none; }
}
```

## Repo conventions to follow

- `app.css:250-253` (`.reveal`/`.draw-arc`) is the exemplar for "force the visible end-state explicitly" — the 6.3 fix mirrors it exactly.
- `components/GraphCanvas.tsx:994` already has a working `prefers-reduced-motion` block for CSS-driven motion in this same file — the new `useReducedMotion()` branch is the JS-side equivalent for the one motion path that isn't CSS-driven.
- Framer Motion's own docs pattern for this is exactly `const shouldReduceMotion = useReducedMotion(); const x = shouldReduceMotion ? 0 : 100;` — the branch above follows that shape.

## Steps

1. Open `/Users/enesyazici/Desktop/quizwise/tailwind.config.cjs`. Add `const plugin = require('tailwindcss/plugin');` as the first line (before the `/** @type ... */` comment). Add a `plugins: [ plugin(function ({ addVariant }) { addVariant('hover', '@media (hover: hover) and (pointer: fine) { &:hover }'); }), ]` array, replacing the current `plugins: [],` line. Leave `content`, `darkMode`, and `theme` exactly as they are.
2. Open `/Users/enesyazici/Desktop/quizwise/app.css`. Find the `.animate-card-enter` reduced-motion block (currently `app.css:230-232`, may have shifted if plan 001 was applied first — locate by searching for `.animate-card-enter { animation: none; }`). Change `.animate-card-enter { animation: none; }` to `.animate-card-enter { animation: none; opacity: 1; transform: none; }`.
3. In the same file, immediately after the existing `.reveal`/`.draw-arc` reduced-motion block (search for the block ending in `.draw-arc { animation: none; stroke-dashoffset: 0; }`), add the new global fallback block from the "Target" section above (the `*, *::before, *::after { animation-duration: 0.01ms !important; ... }` rule).
4. Open `/Users/enesyazici/Desktop/quizwise/components/GraphCanvas.tsx`. Change line 3 from `import { motion, AnimatePresence } from 'framer-motion';` to `import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';`.
5. Find the component function that renders the node list (contains the `.map()` producing the `<motion.g key={node.id} ... initial={{ x: pos.x, y: pos.y, opacity: 0, scale: 0.6 }} ...>` block, currently around line 1178). Add `const shouldReduceMotion = useReducedMotion();` near that component's other hook calls (top of the function body, alongside its existing `useState`/`useMemo`/`useCallback` calls).
6. Immediately before the `return (` that contains the node `.map()`, add:
   ```tsx
   const nodeInitial = (pos: GraphNodePosition) => shouldReduceMotion
     ? { x: pos.x, y: pos.y, opacity: 1, scale: 1 }
     : { x: pos.x, y: pos.y, opacity: 0, scale: 0.6 };
   const nodeExit = shouldReduceMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 };
   ```
   (Written as a small function for `initial` because `pos` is derived per-node inside the `.map()` callback — adjust the exact parameter/closure shape to match how `pos` is actually scoped at that point in the file; if `pos` is not a `GraphNodePosition`, use whatever its actual local type is instead of introducing a new import.)
7. Replace the three motion props on the `<motion.g>` node element:
   - `initial={{ x: pos.x, y: pos.y, opacity: 0, scale: 0.6 }}` → `initial={nodeInitial(pos)}`
   - `animate={{ x: pos.x, y: pos.y, opacity: 1, scale: 1 }}` → leave unchanged (the animate target is already the fully-visible state; reduced motion only needs to affect the *initial*/*exit* offsets so there's no animated distance to cover)
   - `exit={{ opacity: 0, scale: 0.6 }}` → `exit={nodeExit}`

## Boundaries

- Do NOT edit any of the 119 individual `hover:scale-*`/`hover:translate-*` call sites — the whole point of the `tailwind.config.cjs` fix is that they don't need to change.
- Do NOT remove or rewrite the 4 existing `prefers-reduced-motion` blocks (`.brand-spinner`, `.reveal`/`.draw-arc`, `.wn-float`/`.wn-breathe`) — only the `.animate-card-enter` one gets the opacity/transform addition; the others stay exactly as they are and continue to take precedence over the new global fallback for their specific selectors.
- Do NOT touch the edge (`<motion.g>` for edges, not nodes) animation in `GraphCanvas.tsx` unless it's trivial to include with the same `shouldReduceMotion` variable — if it requires materially different logic, leave it out of this plan and note it as a follow-up instead of expanding scope.
- Do NOT add any new npm dependency — `tailwindcss/plugin` ships inside the already-installed `tailwindcss` package; `useReducedMotion` ships inside the already-installed `framer-motion` package.
- If `tailwind.config.cjs`'s `content`/`darkMode`/`theme` blocks don't match what's quoted above (drift since the commit stamp), STOP and report instead of guessing how to merge.

## Verification

- **Mechanical**: `npm run build` completes with no errors (confirms the Tailwind plugin syntax is valid and PostCSS/Tailwind processes it). `npx tsc --noEmit` passes.
- **Feel check**:
  - In Chrome DevTools, open the Rendering panel → "Emulate CSS media feature `prefers-reduced-motion`" → set to `reduce`. Reload the app. Trigger a few `hover:scale-*` elements (e.g. a Dashboard quick-link tile) with the mouse — since reduced-motion and hover-gating are independent checks, hover should still scale (that's a separate concern from 6.1) but the *duration* of that transform should now be imperceptibly fast (the `0.01ms` global override), and toggling the state back should not show any visible movement.
  - With DevTools' device toolbar set to a touch device (e.g. "iPhone 14"), tap (don't hover with a mouse) a `hover:scale-*` element such as a Dashboard card. Confirm it does **not** visibly scale up and stay stuck — the media-gated `hover` variant should mean touch-simulated `:hover` no longer matches.
  - With `prefers-reduced-motion: reduce` still emulated, navigate to the Wissensnetz (Knowledge Graph) tab and add/select a node. Confirm it appears at full size/opacity immediately rather than growing from `scale(0.6)`/fading in — this confirms the `useReducedMotion()` branch in `GraphCanvas.tsx` is wired correctly.
  - With `prefers-reduced-motion: reduce` still emulated, visit the Dashboard (which uses `.animate-card-enter`) and confirm the cards render at full opacity immediately — not invisible/stuck at `opacity: 0`.
  - In DevTools' Animations panel, confirm the global button press-feedback (`app.css:256-262`) still visibly registers a click (some feedback, however brief) under reduced motion rather than looking completely unresponsive.
- **Done when**: touch-tap no longer triggers a stuck hover-scale anywhere in the app, `prefers-reduced-motion: reduce` measurably collapses movement app-wide (not just in the 4 previously-handled cases) without leaving any element stuck at `opacity: 0`, and the Wissensnetz node enter/exit specifically skips its scale/opacity animation under reduced motion.
