# 001 — Fix the broken `animate-in` entrance-animation system

- **Status**: DONE (2026-08-07 — kept `@keyframes fadeIn` for `.animate-fade-in`, correcting a gap in this plan's own literal target sample; see executor report)
- **Commit**: 3d6aefc
- **Severity**: HIGH
- **Category**: Easing & duration (AUDIT.md §2) + Cohesion & tokens (AUDIT.md §7)
- **Estimated scope**: 1 file (`app.css`). Zero component files touched — this fixes all 114 call sites across 46 files at once because the bug is in the shared CSS, not in any individual component.

## Problem

`/Users/enesyazici/Desktop/quizwise/app.css:214-222` defines the app's shared entrance-animation system:

```css
/* app.css:214-222 — current */
@keyframes fadeIn    { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp   { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes splashIn  { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }

.animate-fade-in { animation: fadeIn 0.5s ease both; }
.animate-in { animation-fill-mode: both; }
.animate-in.fade-in { animation-name: fadeIn; }
.animate-in.zoom-in-95 { animation-name: splashIn; }
```

Every component in the app triggers this system with class strings like `animate-in fade-in duration-300` or `animate-in slide-in-from-bottom-4 duration-500` — e.g.:

- `/Users/enesyazici/Desktop/quizwise/components/Toast.tsx:44` — `` className={`... animate-in slide-in-from-right-4 duration-300 max-w-sm ${styles[t.type]}`} ``
- `/Users/enesyazici/Desktop/quizwise/components/AuthModal.tsx:91,93` — modal overlay/panel `duration-200`/`duration-300`
- `/Users/enesyazici/Desktop/quizwise/components/QuizPlayer.tsx:311` — `className="px-4 pb-4 animate-in fade-in slide-in-from-bottom-2 duration-300"`

This is broken in two independent ways, confirmed against both source and the production build (`.vercel/output/static/assets/index-CjS15j2z.css`):

1. **`duration-*` never controls the animation.** `tailwind.config.cjs` has `plugins: []` — no `tailwindcss-animate` is installed (confirmed absent from `package.json`). Tailwind's core `duration-*` utility only ever emits `transition-duration` (e.g. `.duration-300{transition-duration:.3s}`), never `animation-duration`. Since `app.css` never sets `animation-duration` anywhere for `.animate-in`, every entrance plays at the browser default, `animation-duration: 0s`. The content just appears — no fade, no slide, no zoom.
2. **`slide-in-from-*` classes don't exist at all.** Only `.fade-in` and `.zoom-in-95` have a matching `animation-name` rule. `slide-in-from-right-4`, `slide-in-from-bottom-2`, `slide-in-from-bottom-4`, `slide-in-from-bottom-6`, `slide-in-from-bottom-12`, `slide-in-from-top-2`, `slide-in-from-top-4`, `slide-in-from-right-8`, `slide-in-from-right-12` are used across the codebase (confirmed via `grep -orhE "slide-in-from-[a-z0-9\-]+"`) but have zero CSS backing — e.g. `Toast.tsx:44` uses `slide-in-from-right-4` with no `fade-in`/`zoom-in-95` alongside it, so that element gets **no animation at all**, not even a broken one.
3. **Combining `fade-in` + `zoom-in-95` on the same element is a coin-flip.** `/Users/enesyazici/Desktop/quizwise/components/EditCardModal.tsx` and several others use `animate-in fade-in zoom-in-95 duration-300`. Both `.animate-in.fade-in` and `.animate-in.zoom-in-95` have equal CSS specificity (0,2,0); only the one declared later in the stylesheet (`zoom-in-95` → `splashIn`) wins, so `fade-in` silently does nothing whenever combined with `zoom-in-95`.

This affects toasts, all modals, quiz feedback panels, the confidence-selector, dropdowns, and every other transient UI surface in the app — it is the single highest-leverage fix in the codebase.

## Target

Replace the fixed-keyframe system with a CSS-custom-property-driven system (the same mechanism `tailwindcss-animate`/shadcn use under the hood, implemented here directly in `app.css` with no new dependency). Each entrance modifier class sets one CSS variable; a single `enter` keyframe reads all of them, so any combination of `fade-in` + `zoom-in-95` + `slide-in-from-*` composes correctly. `duration-*` gets real rules that set `animation-duration` when combined with `.animate-in`, without touching the existing Tailwind `transition-duration` behavior of those same classes (different property, no conflict).

```css
/* app.css — target, replaces the block at app.css:214-222 */

/* ── Entrance animation system (animate-in + modifiers) ── */
:root {
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1); /* AUDIT.md §2 canonical strong ease-out */
}

@keyframes enter {
    from {
        opacity: var(--tw-enter-opacity, 1);
        transform: translate3d(var(--tw-enter-translate-x, 0), var(--tw-enter-translate-y, 0), 0)
                   scale3d(var(--tw-enter-scale, 1), var(--tw-enter-scale, 1), var(--tw-enter-scale, 1));
    }
    to {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale3d(1, 1, 1);
    }
}

.animate-fade-in { animation: fadeIn 0.5s ease both; }

.animate-in {
    animation-name: enter;
    animation-duration: 150ms; /* fallback if no duration-* class is present */
    animation-timing-function: var(--ease-out);
    animation-fill-mode: both;
}

/* Opacity */
.animate-in.fade-in { --tw-enter-opacity: 0; }

/* Scale */
.animate-in.zoom-in-95 { --tw-enter-scale: .95; }

/* Slide (Tailwind spacing scale: 1 = 0.25rem) */
.animate-in.slide-in-from-bottom-2  { --tw-enter-translate-y: 0.5rem; }
.animate-in.slide-in-from-bottom-4  { --tw-enter-translate-y: 1rem; }
.animate-in.slide-in-from-bottom-6  { --tw-enter-translate-y: 1.5rem; }
.animate-in.slide-in-from-bottom-12 { --tw-enter-translate-y: 3rem; }
.animate-in.slide-in-from-top-2     { --tw-enter-translate-y: -0.5rem; }
.animate-in.slide-in-from-top-4     { --tw-enter-translate-y: -1rem; }
.animate-in.slide-in-from-right-4   { --tw-enter-translate-x: 1rem; }
.animate-in.slide-in-from-right-8   { --tw-enter-translate-x: 2rem; }
.animate-in.slide-in-from-right-12  { --tw-enter-translate-x: 3rem; }

/* Duration (only takes effect combined with .animate-in — does not change
   the existing Tailwind transition-duration behavior of these same classes
   used elsewhere in the app) */
.animate-in.duration-150  { animation-duration: 150ms; }
.animate-in.duration-200  { animation-duration: 200ms; }
.animate-in.duration-300  { animation-duration: 300ms; }
.animate-in.duration-500  { animation-duration: 500ms; }
.animate-in.duration-700  { animation-duration: 700ms; }
.animate-in.duration-1000 { animation-duration: 1000ms; }
```

Note: `slideUp` and `splashIn` keyframes are removed (superseded by the unified `enter` keyframe + variables above); `fadeIn` keyframe is kept only because `.animate-fade-in` (a distinct, separately-used class, confirmed only used standalone) still references it directly.

## Repo conventions to follow

- Keep every existing className string in every component file **exactly as-is** — this plan is a pure CSS-side fix. Do not edit any file under `components/` or `hooks/`.
- The stagger system `.animate-card-enter` / `--stagger-i` at `app.css:224-231` is a separate, already-correctly-implemented mechanism (uses `animation:` shorthand with an explicit duration). Do not merge it into this change or rename its keyframe (`cardEnter`) — it is out of scope.
- `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` is the canonical value from AUDIT.md §2 — copy it exactly, do not approximate.

## Steps

1. Open `/Users/enesyazici/Desktop/quizwise/app.css`. Locate the block currently at lines 214-222:
   ```css
   @keyframes fadeIn    { from { opacity: 0; } to { opacity: 1; } }
   @keyframes slideUp   { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
   @keyframes splashIn  { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }

   .animate-fade-in { animation: fadeIn 0.5s ease both; }
   .animate-in { animation-fill-mode: both; }
   .animate-in.fade-in { animation-name: fadeIn; }
   .animate-in.zoom-in-95 { animation-name: splashIn; }
   ```
2. Replace that entire block with the full "Target" CSS block above (including the `:root { --ease-out: ... }` rule — if `app.css` already has a `:root { ... }` block elsewhere in the file, add the `--ease-out` declaration inside that existing block instead of creating a second `:root` block; otherwise add it as a standalone `:root { --ease-out: cubic-bezier(0.23, 1, 0.32, 1); }` right before the `@keyframes enter` rule).
3. Verify no other rule in `app.css` still references `slideUp` or `splashIn` by name (`grep -n "slideUp\|splashIn" app.css`) — if any reference remains outside the block you just replaced, STOP and report it instead of deleting it blind.
4. Leave every other section of `app.css` (stagger system, brand spinner, scroll-reveal, global button press feedback, gradient helpers) untouched.

## Boundaries

- Do NOT touch any file under `components/`, `hooks/`, or any `.tsx` file — this is a CSS-only fix, and its entire point is that no call site needs to change.
- Do NOT add `tailwindcss-animate` or any other new dependency to `package.json`.
- Do NOT modify `.animate-card-enter`, `.brand-spinner`, `.reveal`/`.draw-arc`, or the global `button:not(:disabled)` press-feedback rule — those are separate, already-functioning systems.
- If `slideUp` or `splashIn` turns out to be referenced somewhere you didn't expect (step 3), STOP and report instead of improvising a fix.

## Verification

- **Mechanical**: `npm run build` completes with no errors. `grep -c "animation-duration" app.css` returns at least 7 (the fallback + 6 explicit duration rules).
- **Feel check**: run `npm run dev`, open the app, and confirm:
  - Trigger a toast (any action that calls the toast helper) — it should visibly slide in from the right and fade in over ~300ms, not just appear.
  - Open any modal (e.g. Settings) — it should visibly zoom+fade in from `scale(0.95)`, not just appear.
  - In a quiz, select an answer option — the confidence-selector panel (`QuizPlayer.tsx:311`) should visibly fade+slide up from 8px below, not just appear.
  - Open a modal that combines `fade-in zoom-in-95` (e.g. `EditCardModal.tsx`) and confirm it now visibly fades AND zooms together, not just zooms.
  - In Chrome DevTools → Elements → Animations panel, select the toast/modal animation and set playback to 10%: confirm the `enter` keyframe interpolates opacity and transform smoothly across the full duration, with no snap/jump partway through.
- **Done when**: every `animate-in` element in the app visibly animates on mount, using the duration already specified in its className (150/200/300/500/700/1000ms), and no component file was modified.
