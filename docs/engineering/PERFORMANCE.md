# Performance

Measured with `npm run perf -- <git-ref>` (`tools/perf.js`): the **same scenario** is run on the original code (`45f7284`, v1.0.6) and on the current tree, 5 clean runs each (new browser context, no cache), headless Chromium, in a 4-core Linux container, Node v22. Absolute numbers depend on the machine; only the **relative** comparison on the same machine is meaningful. Single environment, single session — not a statistical study and not representative of phones.

## Scenario

- **Startup:** navigation start → `KINGCODE_READY` on a cold context.
- **Large project:** 20 files × ~126 KB (≈ 2.5 MB), then 20 single-character edits, 320 ms apart (longer than the 250 ms save debounce, so each edit triggers exactly one save).
- **Main-thread blocking:** sum of `longtask` entries (> 50 ms) during those edits (`PerformanceObserver`).
- **Bytes written per edit:** `Storage.setItem` payload (old) / IndexedDB `put` payload (new), averaged.
- **Big document:** one-character edit in a 100,000-line document.
- **Page loads, first visit:** real `load` events in the first 3 s after opening the app.

## Results (median of 5; range in brackets)

| Metric | v1.0.6 (`45f7284`) | current (v1.4.0) | Change |
|---|---|---|---|
| Startup to ready (ms) | 585 [501–681] | 519 [516–601] | ≈ 11 % lower; ranges overlap, so treat as "not slower", not as a proven speed-up |
| Main-thread blocked during 20 edits (ms) | 1133 [384–1326] | 0 [0–0] | no long tasks in any run |
| Longest single task (ms) | 89 [62–108] | 0 [0–0] | — |
| Data written per edit | 2,659,340 chars (whole project, every edit) | 131,326 chars (the one changed file record) | ≈ 20× less (≈ project size ÷ changed-file size) |
| Edit in a 100k-line document (ms) | 10 [7–13] | 9 [9–20] | no difference — CodeMirror dominates; not claimed as an improvement |
| Page loads on first visit | 2 | 1 | the old service worker reloaded the page on first activation (F-07) |

An earlier run of the same tool, before I fixed its navigation counter, gave the same picture for the other metrics (startup 638 → 518 ms, blocked 1006 → 0 ms, bytes per edit identical); it is not used above.

## What explains the differences (and what is not proven)

- **Blocking and bytes:** v1.0.6 serialized and synchronously wrote the *entire* project to `localStorage` on every debounced change. v1.1.0 writes only the changed file record to IndexedDB asynchronously (`STORE.save`, differential writes). The measurements match that mechanism; the unit/E2E tests (`A-01: edits write only the changed file record`) guard the "one record per edit" property.
- **Startup:** the current build loads more scripts (14 vs 10 files) but no longer reloads itself on first visit. The measured difference is small and within run-to-run noise.
- **Not measured:** memory usage and leaks (no heap profiling was done; the earlier fix that deletes closed documents' CodeMirror Docs from the in-memory map is code-reviewed, not measured), phones/low-end devices, Firefox/Safari, network requests beyond the service-worker precache, and multi-hundred-file projects (the cap is 60 files).

## Capacity (verified by E2E, not benchmarked)

A project of 8 files × 2,000,000 characters (16 MB) persists and reloads on IndexedDB; the previous `localStorage` blob could not hold it (≈ 5 MB ceiling). A 50,000-line file edits and switches tabs in < 1.5 s in the test environment.

## Reproduce

```bash
npm install && npx playwright install chromium
npm run perf -- 45f7284      # current tree vs the original v1.0.6
```
