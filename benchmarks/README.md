# Benchmarks

Two harnesses measure zerolith. [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) is the shared public benchmark, where every framework renders the same keyed table; it is run here with zerolith next to the popular frameworks. `npm run bench` is this repository's quick check against a hand-written DOM baseline.

## js-framework-benchmark

Every entry renders a table of rows and performs the same nine operations. The harness clicks a button and measures from the click to the end of the paint it causes, from Chrome's performance trace, so script, style, layout, and paint all count; five operations run with the CPU slowed by Chrome, as the official runs do. The memory results are what `performance.measureUserAgentSpecificMemory()` reports for the page after an operation and a forced garbage collection, and the size results are the bytes of the entry's files, uncompressed and compressed.

The zerolith entry is in [js-framework-benchmark/](js-framework-benchmark/). The official results, measured by the benchmark's maintainer, are at https://krausest.github.io/js-framework-benchmark/; zerolith is not among them until the entry is accepted upstream.

### Results, 2026-10-31

| Framework | Entry | Version | Weighted geometric mean |
| --- | --- | --- | --- |
| vanilla | `vanillajs` | hand-written | 1.00 |
| Solid | `solid` | 1.9.3 | 1.09 |
| Svelte | `svelte` | 5.42.1 | 1.13 |
| zerolith | `zerolith` | main at `38d5e74`, after 0.1.0-alpha.4 | 1.14 |
| Lit | `lit` | 3.2.0 | 1.23 |
| Vue | `vue` | 3.5.39 | 1.25 |
| Preact | `preact-signals` | 11.0.0, signals 2.3.1 | 1.33 |
| Angular | `angular-cf-signals-nozone` | 22.2.2 | 1.37 |
| React | `react-hooks` | 19.2.0 | 1.47 |

The weighted geometric mean combines each framework's factor against the fastest result of every operation, with the weights of the official results page, so 1.00 would be fastest everywhere. Each cell below is the mean duration in milliseconds with that factor in parentheses.

| Operation | vanilla | Solid | Svelte | zerolith | Lit | Vue | Preact | Angular | React |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| create rows: create 1,000 rows | 30.1 (1.00) | 32.4 (1.08) | 32.9 (1.09) | 34.1 (1.13) | 35.6 (1.18) | 36.3 (1.21) | 41.4 (1.38) | 42.8 (1.42) | 38.7 (1.29) |
| replace all rows: replace all 1,000 rows | 32.5 (1.00) | 36.0 (1.11) | 36.7 (1.13) | 36.7 (1.13) | 39.6 (1.22) | 39.1 (1.20) | 46.0 (1.41) | 47.3 (1.46) | 43.0 (1.32) |
| partial update: update every 10th of 1,000 rows (4x slowdown) | 19.6 (1.00) | 20.1 (1.02) | 19.9 (1.02) | 26.3 (1.34) | 22.5 (1.15) | 25.1 (1.28) | 20.3 (1.03) | 23.6 (1.20) | 29.7 (1.52) |
| select row: highlight a row (4x slowdown) | 7.2 (1.00) | 7.9 (1.10) | 10.8 (1.50) | 7.4 (1.02) | 10.1 (1.40) | 9.0 (1.25) | 9.0 (1.24) | 11.3 (1.57) | 11.4 (1.57) |
| swap rows: swap 2 of 1,000 rows (4x slowdown) | 21.2 (1.00) | 24.2 (1.14) | 27.6 (1.30) | 22.9 (1.08) | 29.2 (1.38) | 26.1 (1.24) | 26.4 (1.25) | 25.6 (1.21) | 165.5 (7.83) |
| remove row: remove one row (2x slowdown) | 15.9 (1.00) | 17.8 (1.12) | 18.7 (1.17) | 17.3 (1.08) | 19.5 (1.23) | 21.3 (1.34) | 20.0 (1.26) | 19.0 (1.19) | 19.6 (1.23) |
| create many rows: create 10,000 rows | 329.4 (1.00) | 357.1 (1.08) | 362.2 (1.10) | 371.0 (1.13) | 388.2 (1.18) | 391.3 (1.19) | 455.3 (1.38) | 447.1 (1.36) | 457.3 (1.39) |
| append rows: add 1,000 rows to 1,000 | 34.2 (1.00) | 37.4 (1.09) | 37.4 (1.09) | 38.7 (1.13) | 41.6 (1.22) | 40.5 (1.18) | 47.4 (1.38) | 46.3 (1.35) | 43.0 (1.26) |
| clear rows: clear 1,000 rows (4x slowdown) | 17.3 (1.00) | 20.1 (1.16) | 20.4 (1.18) | 19.3 (1.12) | 23.9 (1.38) | 24.5 (1.41) | 28.2 (1.63) | 28.6 (1.65) | 31.9 (1.84) |

| Measure | vanilla | Solid | Svelte | zerolith | Lit | Vue | Preact | Angular | React |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ready memory, after load (MB) | 0.56 | 0.59 | 0.66 | 0.72 | 0.72 | 0.87 | 0.69 | 1.13 | 1.18 |
| run memory, with 1,000 rows (MB) | 2.03 | 2.83 | 3.02 | 3.38 | 2.99 | 4.06 | 5.04 | 3.76 | 4.57 |
| after creating and clearing 1,000 rows 5 times (MB) | 0.65 | 0.77 | 0.97 | 0.94 | 0.88 | 1.19 | 8.94 | 1.69 | 1.97 |
| size uncompressed (kB) | 11.7 | 11.5 | 26.6 | 26.0 | 22.1 | 64.3 | 23.3 | 110.6 | 190.3 |
| size compressed (kB) | 2.5 | 4.5 | 9.7 | 7.9 | 7.3 | 23.3 | 8.3 | 33.8 | 51.4 |
| first paint (ms) | 117.5 | 108.8 | 110.7 | 104.8 | 107.6 | 113.8 | 115.4 | 121.4 | 208.1 |

In this run, zerolith selected, swapped, removed, and cleared rows 3 to 7 percent faster than Solid, the closest framework, a margin within the variation between runs on this machine, so those four operations are best read as level with Solid; it created and appended rows within about 5 percent of Solid and Svelte. The partial update is its weakest operation: its entry sets a new array, as the guides teach, so the keyed list compares all 1,000 keys to find the 100 changed rows, where the Solid, Svelte, and Preact entries write to a signal in each of the 100 rows.

Each framework is the keyed entry of the benchmark's repository at commit `ca8715d` (2026-10-25), built from its own lockfile; zerolith is the entry in [js-framework-benchmark/](js-framework-benchmark/), built against the core at commit `38d5e74` on the main branch, after 0.1.0-alpha.4. The durations are the mean of 10 runs, and 20 for selecting a row; the memory, size, and first paint results are one run each, as the harness takes them, so small differences there say little.

The machine was an AMD Ryzen 9 9950X3D (16 cores) with 31.1 GB of memory, on Windows 11 Pro (build 26200), with Chrome 156.0.8078.74 run headless by the benchmark's own driver and Node 24.13.0. It was in normal use during the run, and the frameworks ran one after another, so a result can move by a few percent between runs; the vanilla entry, measured in the same run, is the reference to read the others against.

### Reproducing

[js-framework-benchmark/README.md](js-framework-benchmark/README.md) lists the steps to run the entry from a checkout of the benchmark. To measure the same frameworks, pass them all to the runner: `npm run bench -- --framework keyed/vanillajs keyed/zerolith keyed/solid keyed/svelte keyed/vue keyed/react-hooks keyed/angular-cf-signals-nozone keyed/preact-signals keyed/lit`.

## npm run bench

`npm run bench` runs the same operations against two pages in headless Chromium: the zerolith implementation (`web/zerolith.js`, loading the production entry unbundled through an import map) and a hand-written DOM baseline (`web/vanilla.js`). Each sample times the operation plus the synchronous style and layout it forces, then waits a frame outside the measurement. The script prints the median per operation and the geometric mean of the zerolith to vanilla ratios. Pass an iteration count as the first argument; the default is 7.

It is a quick check that a change did not make rendering slower, not a substitute for the public benchmark: the baseline here is written for this harness, and the page skips the template prepare pass of the build tools.

### 2026-10-31, main at `38d5e74`

Windows 11, Chrome Headless Shell 156, 11 iterations.

| Operation | Vanilla (ms) | zerolith (ms) | Ratio |
| --- | --- | --- | --- |
| create 1,000 rows | 21.5 | 23.5 | 1.09 |
| replace all rows | 20.2 | 21.9 | 1.08 |
| update every 10th row | 4.9 | 4.4 | 0.90 |
| select a row | 0.0 | 0.1 | n/a |
| swap two rows | 1.2 | 1.5 | 1.25 |
| remove a row | 1.1 | 1.3 | 1.18 |
| create 10,000 rows | 227.9 | 255.7 | 1.12 |
| append 1,000 rows | 19.7 | 22.4 | 1.14 |
| clear rows | 2.3 | 2.5 | 1.09 |
| geometric mean | | | 1.09 |

### Earlier runs

| Run | Core gzip | Geometric mean |
| --- | --- | --- |
| 2026-10-28, first run after the template layer | 6,248 B | 1.26 |
| 2026-10-30, 0.1.0-alpha.2 | 8,116 B | 1.29 |
| 2026-10-31, main at `38d5e74` | 9,512 B | 1.09 |

The core grew with hydration, custom elements, and diagnostics, and since 0.1.0-alpha.4 with the rendering work that clones each template from a copy prepared once, locates bindings by position, and gives keyed lists fast paths for creating, appending, replacing, swapping, and clearing rows.
