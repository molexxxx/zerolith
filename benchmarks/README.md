# Benchmarks

`npm run bench` runs the keyed-table operation set of js-framework-benchmark against two pages in headless Chromium: the zerolith implementation (`web/zerolith.js`, loading the production entry unbundled through an import map) and a hand-written DOM baseline (`web/vanilla.js`). Each sample times the operation plus the synchronous style and layout it forces, then waits a frame outside the measurement. The script prints the median per operation and the geometric mean of the zerolith to vanilla ratios. Pass an iteration count as the first argument; the default is 7.

This is a regression and architecture check, not a substitute for the public benchmark: the vanilla baseline here is written for this harness, and js-framework-benchmark measures through tracing to paint with CPU throttling. An entry there is on the [roadmap](../docs/ROADMAP.md).

## 2026-10-30, 0.1.0-alpha.2

Windows 11, Chrome Headless Shell 156, 11 iterations, production entry at 8,116 B gzip.

| Operation | Vanilla (ms) | zerolith (ms) | Ratio |
| --- | --- | --- | --- |
| create 1,000 rows | 21.6 | 29.9 | 1.38 |
| replace all rows | 20.0 | 27.9 | 1.40 |
| update every 10th row | 4.9 | 5.7 | 1.16 |
| select a row | 0.0 | 0.2 | n/a |
| swap two rows | 2.0 | 2.3 | 1.15 |
| remove a row | 1.6 | 2.4 | 1.50 |
| create 10,000 rows | 231.2 | 341.9 | 1.48 |
| append 1,000 rows | 27.3 | 27.8 | 1.02 |
| clear rows | 2.3 | 3.9 | 1.70 |
| geometric mean | | | 1.29 |

Since the first run the core grew from 6,248 to 8,116 B gzip with hydration, custom elements, and the diagnostics added since, and the geometric mean moved from 1.26 to 1.29. The page loads the production entry unbundled, so the template prepare pass of the build tools does not apply here.

## 2026-10-28, first run after the template layer

Windows 11, Chrome Headless Shell 156, 11 iterations, production entry at 6,248 B gzip.

| Operation | Vanilla (ms) | zerolith (ms) | Ratio |
| --- | --- | --- | --- |
| create 1,000 rows | 20.7 | 26.7 | 1.29 |
| replace all rows | 18.2 | 25.2 | 1.38 |
| update every 10th row | 3.9 | 3.7 | 0.95 |
| select a row | 0.0 | 0.1 | n/a |
| swap two rows | 1.1 | 1.4 | 1.27 |
| remove a row | 1.1 | 1.2 | 1.09 |
| create 10,000 rows | 224.7 | 292.5 | 1.30 |
| append 1,000 rows | 19.7 | 24.9 | 1.26 |
| clear rows | 1.7 | 3.5 | 2.06 |
| geometric mean | | | 1.26 |

Known costs to work on: `clear` pays for disposing one owner and three computed values per row; `replace` and the create operations pay for the same per-row setup. Both are candidates for a cheaper row representation once the API is frozen.
