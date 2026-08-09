# 004 — Make the quiz confidence-selector panel interruptible

- **Status**: DONE (2026-08-09 — applied directly, `tsc --noEmit` and `npm run build` clean; benefits from plan 003's global `prefers-reduced-motion` fallback automatically, no extra work needed there)
- **Commit**: 3d6aefc
- **Severity**: MEDIUM (recalibrated down from the initial audit pass — see Problem section for why)
- **Category**: Interruptibility (AUDIT.md §4)
- **Estimated scope**: 1 file (`components/QuizPlayer.tsx`). Depends on plan 001 having already introduced the `--ease-out` token in `app.css` — apply plan 001 first.

## Problem

`/Users/enesyazici/Desktop/quizwise/components/QuizPlayer.tsx:309-311`:

```tsx
{/* Metakognitive Kalibrierung: Selbsteinschätzung vor Aufdeckung der Lösung */}
{!showResult && selectedOptions.length > 0 && (
  <div className="px-4 pb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
```

This panel (confidence self-rating: "unsicher"/"sicher") is conditionally rendered — React fully unmounts and remounts the `<div>` whenever `selectedOptions.length` crosses the `0` boundary. For a single-choice question this happens at most once per question (select → stays selected → submit). For a multi-select question, a user can toggle options such that `selectedOptions.length` goes from `1` back to `0` and up again — each crossing fully unmounts and remounts this `<div>`, restarting the `@keyframes`-based entrance from zero rather than smoothly reversing mid-animation. This is a real but narrower case than "restarts on every option click" — it only restarts on a full deselect-then-reselect, not on every click while at least one option stays selected.

Once plan 001 is applied, this entrance will actually play (currently it's silently broken — 0ms duration, see plan 001) — which is exactly why it's worth fixing the interruptibility now, at the same time, rather than shipping a newly-visible animation that then visibly stutters on rapid multi-select toggling.

## Target

Keep the panel mounted in the DOM at all times once the question is being answered; toggle its visibility with a CSS transition (not a keyframe animation, not a mount/unmount) driven by a `data-visible` attribute, using the CSS grid `0fr → 1fr` auto-height reveal technique (no hardcoded pixel height, no JS measurement — the standard modern approach for animating an unknown-height block). Because it's a genuine transition on a persistent element, rapid toggling retargets smoothly instead of restarting.

```tsx
/* components/QuizPlayer.tsx — target */
<div
  data-visible={!showResult && selectedOptions.length > 0}
  className="grid transition-[grid-template-rows,opacity] duration-300 ease-[var(--ease-out)] opacity-0 [grid-template-rows:0fr] data-[visible=true]:opacity-100 data-[visible=true]:[grid-template-rows:1fr]"
>
  <div className="overflow-hidden">
    <div className="px-4 pb-4">
      <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">{t('quiz.confidence')}</p>
      <div className="flex gap-2">
        {/* ...the two existing buttons, unchanged... */}
      </div>
    </div>
  </div>
</div>
```

## Repo conventions to follow

- `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` is introduced in `app.css` by plan 001 (`plans/001-fix-animate-in-duration-system.md`) — reuse it via `ease-[var(--ease-out)]` rather than hand-typing a new cubic-bezier. **This plan must be applied after plan 001**; if `--ease-out` is not yet defined in `app.css` when you reach this plan, apply plan 001 first.
- 300ms matches the existing `duration-300` this element already used, so the visible timing doesn't change — only the mechanism (transition vs. keyframe) and the persistence of the DOM node change.

## Steps

1. Open `/Users/enesyazici/Desktop/quizwise/components/QuizPlayer.tsx`. Locate the block at (approximately, may have shifted slightly) lines 309-334:
   ```tsx
   {!showResult && selectedOptions.length > 0 && (
     <div className="px-4 pb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
       <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">{t('quiz.confidence')}</p>
       <div className="flex gap-2">
         <button
           onClick={() => setConfidence('unsicher')}
           className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all flex items-center justify-center gap-2 ${
             confidence === 'unsicher' ? '' : 'border-slate-100 dark:border-slate-800 text-slate-400 hover:border-slate-300'
           }`}
           style={confidence === 'unsicher' ? { borderColor: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)' } : undefined}
         >
           {t('quiz.unsure')}
         </button>
         <button
           onClick={() => setConfidence('sicher')}
           className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all flex items-center justify-center gap-2 ${
             confidence === 'sicher' ? '' : 'border-slate-100 dark:border-slate-800 text-slate-400 hover:border-slate-300'
           }`}
           style={confidence === 'sicher' ? { borderColor: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)' } : undefined}
         >
           {t('quiz.sure')}
         </button>
       </div>
     </div>
   )}
   ```
2. Replace the `{!showResult && selectedOptions.length > 0 && ( <div className="px-4 pb-4 animate-in fade-in slide-in-from-bottom-2 duration-300"> ... </div> )}` conditional block with an always-rendered structure: remove the `{condition && ( ... )}` wrapper entirely, and instead render the outer `<div>` unconditionally with a `data-visible={!showResult && selectedOptions.length > 0}` attribute and the className from the "Target" section above. Move the original inner content (the `<p>` and the `<div className="flex gap-2">...</div>` with the two buttons) one level deeper, inside two nested wrapper divs: an `overflow-hidden` div, then a `px-4 pb-4` div (the original padding, now on the innermost div instead of the outer one — see the exact nesting in the Target code block).
3. Do not change anything inside the two `<button>` elements — their `onClick`, className, and style logic stay exactly as they are.
4. When `!showResult && selectedOptions.length > 0` is `false` (nothing selected yet, or result already shown), the panel is now still in the DOM but collapsed to `grid-template-rows: 0fr` and `opacity: 0`, clipped by the inner `overflow-hidden` div — confirm this doesn't introduce any interactable-but-invisible element by checking that the collapsed state has no meaningful height for the buttons to be clicked in (grid-template-rows: 0fr collapses the row to 0px regardless of content height, so this is safe without needing `pointer-events: none` — but add `pointer-events-none` to the outer div's className when `data-visible` is falsy if you want to be defensive; not required for correctness).

## Boundaries

- Do NOT touch the MC option `<button>` list above this block (`components/QuizPlayer.tsx:277-296`) — that's out of scope for this plan (it's finding #8 in the original audit — SRS-frequency related, not selected for this round).
- Do NOT touch any other `animate-in` usage in this file or elsewhere — this plan is scoped to exactly this one confidence panel.
- Do NOT apply this plan before plan 001 — it depends on the `--ease-out` CSS variable plan 001 introduces.
- Do NOT change the 300ms duration or introduce a new value — reuse the existing `duration-300` timing so the visible pacing is unchanged.

## Verification

- **Mechanical**: `npx tsc --noEmit` passes. `npm run build` completes with no errors.
- **Feel check**:
  - In a single-choice quiz question, select an option and confirm the confidence panel smoothly grows in and fades in over ~300ms (same visible timing as before plan 001+004, now actually visible).
  - In a multi-select question, rapidly click an option to select it, then immediately deselect it, then immediately reselect it (three clicks in quick succession, faster than 300ms apart). Confirm the panel's height/opacity **reverses smoothly from wherever it currently is** rather than snapping to collapsed and restarting the grow-in from zero — this is the actual fix being verified.
  - In Chrome DevTools → Elements → Animations panel, set playback to 10% while performing the toggle above, and confirm `grid-template-rows` and `opacity` interpolate continuously with no visible jump at the moment of interruption.
  - Confirm the two confidence buttons ("unsicher"/"sicher") still work exactly as before — clicking one still calls `setConfidence(...)` and visually marks it selected.
- **Done when**: rapidly toggling a multi-select question's selection across the `selectedOptions.length === 0` boundary no longer causes the confidence panel's entrance animation to visibly restart/snap, and single-select behavior is visually unchanged from before this plan.
