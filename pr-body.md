## The bug

`check-web-bundle-regression.cjs` used `.find()` for the main and common bundles:

```js
const mainBundle = bundles.find((b) => b.file.startsWith("index-")) || null;
```

`bundles` is sorted by size descending, so this measured **only the largest of the 7 emitted `index-*.js` chunks** and silently ignored the other six. They were invisible to the route-chunk check as well, since it filters out `index-`, so **95.09 kB** reached only `totalJsKb` and no dedicated ceiling.

## Measured on this branch

| | Old `.find()` | Correct sum |
|---|---|---|
| `mainBundleKb` | 1968.38 kB | **2063.47 kB** |
| vs ceiling 1972 | PASS, 3.6 kB margin | would FAIL |

That 3.6 kB margin was an artifact of the bug, not a real result.

## Why the ceiling moves in the same commit

`mainBundleKb` goes 1972 → 2100 because the metric was **under-measured, not because it grew**. Leaving the old ceiling would fail the build on bytes that were always being shipped. The rationale is recorded in the baseline's `note` field so a future reader doesn't mistake the jump for a regression.

Every emitted chunk is now attributed:

```
main 2063.47 + common 960.18 + route 777.19 + worker 126.68 + metro runtime
= 3931.17 kB across 67 files
```

`worker-*` and the metro runtime still have no dedicated ceiling and are covered only by `totalJsKb`. Left alone rather than inventing two ceilings for one expected file and fixed overhead.

## Guard status on this branch

```
PASS  file count           67      (limit 68)
PASS  total JS        3931.17 kB   (limit 4110)
PASS  main bundle     2063.47 kB   (limit 2100)   <- was hidden at 1968.38
PASS  common           960.18 kB   (limit 1522)
FAIL  route aggregate  777.19 kB   (limit 760)    <- pre-existing, see below
PASS  largest route    120.62 kB   (limit 130)
```

**The route-chunk failure is not caused by this PR.** It fails at 777.19 vs 760 on `main` today, before and after this change; this PR does not touch the route logic or that ceiling. Flagging it rather than folding it in, since raising it belongs with whoever is managing that budget.

## Provenance

Found while auditing a downstream copy of this repo (`collinsfoam-a11y/stk_final`), which carries the same guard and hid the same 95.09 kB. Verified here by building this branch and diffing the two code paths against the same `dist/`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Mf3AzG3iKxh8ajU69kf6R8
