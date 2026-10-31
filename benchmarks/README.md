# Benchmarks

Two harnesses measure zerolith. [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) is the shared public benchmark, where every framework renders the same keyed table; it is run here with zerolith next to the popular frameworks. `npm run bench` is this repository's quick check against a hand-written DOM baseline.

## js-framework-benchmark

Every entry renders a table of rows and performs the same nine operations. The harness clicks a button and measures from the click to the end of the paint it causes, from Chrome's performance trace, so script, style, layout, and paint all count; five operations run with the CPU slowed by Chrome, as the official runs do. The memory results are what `performance.measureUserAgentSpecificMemory()` reports for the page after an operation and a forced garbage collection, and the size results are the bytes of the entry's files, uncompressed and compressed.

The zerolith entry is in [js-framework-benchmark/](js-framework-benchmark/). The official results, measured by the benchmark's maintainer, are at https://krausest.github.io/js-framework-benchmark/; zerolith is not among them until the entry is accepted upstream.

### Results, 2026-10-31

Two full runs on one machine, the same day: the first with zerolith built from `main` at `38d5e74`, the second with every entry as published, zerolith at 0.1.0-alpha.5 installed from npm. The tables below are the second run.

| Framework | Entry | Version | Weighted geometric mean | First run |
| --- | --- | --- | --- | --- |
| vanilla | `vanillajs` | hand-written | 1.00 | 1.00 |
| Solid | `solid` | 1.9.3 | 1.11 | 1.09 |
| zerolith | `zerolith` | 0.1.0-alpha.5 | 1.12 | 1.14, at `38d5e74` |
| Svelte | `svelte` | 5.42.1 | 1.14 | 1.13 |
| Lit | `lit` | 3.2.0 | 1.23 | 1.23 |
| Vue | `vue` | 3.5.39 | 1.26 | 1.25 |
| Preact | `preact-signals` | 11.0.0, signals 2.3.1 | 1.34 | 1.33 |
| Angular | `angular-cf-signals-nozone` | 22.2.2 | 1.42 | 1.37 |
| React | `react-hooks` | 19.2.0 | 1.44 | 1.47 |

The weighted geometric mean combines each framework's factor against the fastest result of every operation, with the weights of the official results page, so 1.00 would be fastest everywhere.

Between the two runs, the weighted mean of the eight other entries, whose code did not change, moved by as much as 4.1 percent, and a single operation's duration against vanilla's by as much as 23 percent, so a smaller difference between two frameworks can come from the machine rather than the framework. By that measure zerolith, Solid, and Svelte are level, and all three lead Lit, Vue, Preact, Angular, and React by more than the variation; one run's factor for a single operation is a rough guide.

Each cell below is the mean duration in milliseconds, with the factor against the fastest framework for that operation in parentheses.

| Operation | vanilla | Solid | zerolith | Svelte | Lit | Vue | Preact | Angular | React |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| create rows: create 1,000 rows | 29.5 (1.00) | 31.5 (1.07) | 33.7 (1.14) | 32.7 (1.11) | 34.6 (1.17) | 34.9 (1.18) | 40.6 (1.37) | 43.3 (1.47) | 36.6 (1.24) |
| replace all rows: replace all 1,000 rows | 32.3 (1.00) | 35.8 (1.11) | 37.4 (1.16) | 37.1 (1.15) | 38.3 (1.19) | 39.4 (1.22) | 45.4 (1.41) | 47.8 (1.48) | 42.7 (1.32) |
| partial update: update every 10th of 1,000 rows (4x slowdown) | 19.4 (1.00) | 20.8 (1.07) | 22.7 (1.17) | 22.4 (1.16) | 23.1 (1.19) | 30.7 (1.58) | 22.1 (1.14) | 23.4 (1.21) | 28.8 (1.48) |
| select row: highlight a row (4x slowdown) | 6.6 (1.00) | 8.4 (1.27) | 7.5 (1.13) | 10.6 (1.60) | 9.9 (1.50) | 8.1 (1.22) | 8.7 (1.32) | 10.5 (1.59) | 11.4 (1.73) |
| swap rows: swap 2 of 1,000 rows (4x slowdown) | 20.1 (1.00) | 22.4 (1.12) | 23.6 (1.17) | 24.4 (1.22) | 28.5 (1.42) | 24.6 (1.22) | 25.9 (1.29) | 25.1 (1.25) | 154.5 (7.69) |
| remove row: remove one row (2x slowdown) | 17.2 (1.00) | 19.2 (1.12) | 17.1 (1.00) | 17.9 (1.04) | 19.3 (1.13) | 20.6 (1.20) | 18.8 (1.10) | 24.4 (1.43) | 18.9 (1.11) |
| create many rows: create 10,000 rows | 329.8 (1.00) | 353.6 (1.07) | 373.1 (1.13) | 368.4 (1.12) | 386.1 (1.17) | 391.8 (1.19) | 450.6 (1.37) | 446.8 (1.35) | 457.7 (1.39) |
| append rows: add 1,000 rows to 1,000 | 34.3 (1.00) | 37.0 (1.08) | 38.3 (1.11) | 37.5 (1.09) | 42.5 (1.24) | 40.2 (1.17) | 48.5 (1.41) | 47.5 (1.38) | 42.3 (1.23) |
| clear rows: clear 1,000 rows (4x slowdown) | 16.5 (1.00) | 20.6 (1.25) | 18.3 (1.11) | 19.8 (1.20) | 25.2 (1.53) | 23.3 (1.41) | 28.9 (1.75) | 28.5 (1.73) | 31.6 (1.92) |

| Measure | vanilla | Solid | zerolith | Svelte | Lit | Vue | Preact | Angular | React |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ready memory, after load (MB) | 0.56 | 0.59 | 0.72 | 0.66 | 0.71 | 0.86 | 0.69 | 1.13 | 1.18 |
| run memory, with 1,000 rows (MB) | 2.02 | 2.83 | 3.38 | 3.02 | 2.98 | 4.06 | 5.05 | 3.77 | 4.57 |
| after creating and clearing 1,000 rows 5 times (MB) | 0.65 | 0.78 | 0.95 | 0.98 | 0.88 | 1.19 | 8.94 | 1.69 | 1.97 |
| size uncompressed (kB) | 11.7 | 11.5 | 26.2 | 26.6 | 22.1 | 64.3 | 23.3 | 110.6 | 190.3 |
| size compressed (kB) | 2.5 | 4.5 | 7.9 | 9.7 | 7.3 | 23.3 | 8.3 | 33.8 | 51.4 |
| first paint (ms) | 113.7 | 111.0 | 119.5 | 124.8 | 111.5 | 112.0 | 115.7 | 139.9 | 211.4 |

zerolith's entry updates rows by setting a new array, as the guides teach, so the keyed list compares all 1,000 keys to find the changed rows, where the Solid, Svelte, and Preact entries write to a signal in each changed row. Since the first run, the keyed list skips its bookkeeping when every row keeps its place, which made the partial update 14 percent faster measured side by side in one browser.

Each framework is the keyed entry of the benchmark's repository at commit `ca8715d` (2026-10-25), built from its own lockfile; zerolith is the entry in [js-framework-benchmark/](js-framework-benchmark/), installed from its lockfile and built with `npm run build-prod`. The durations are the mean of 10 runs, and 20 for selecting a row; the memory, size, and first paint results are one run each, as the harness takes them, so small differences there say little.

The machine was an AMD Ryzen 9 9950X3D (16 cores) with 31.1 GB of memory, on Windows 11 Pro (build 26200), with Chrome 156.0.8078.74 run headless by the benchmark's own driver and Node 24.13.0. It was in normal use during both runs, and the frameworks ran one after another; the vanilla entry, measured in the same run, is the reference to read the others against.

### Reproducing

[js-framework-benchmark/README.md](js-framework-benchmark/README.md) lists the steps to run the entry from a checkout of the benchmark. To measure the same frameworks, pass them all to the runner: `npm run bench -- --framework keyed/vanillajs keyed/zerolith keyed/solid keyed/svelte keyed/vue keyed/react-hooks keyed/angular-cf-signals-nozone keyed/preact-signals keyed/lit`.

## npm run bench

`npm run bench` runs the same operations against two pages in headless Chromium: the zerolith implementation (`web/zerolith.js`, loading the production entry unbundled through an import map) and a hand-written DOM baseline (`web/vanilla.js`). Each sample times the operation plus the synchronous style and layout it forces, then waits a frame outside the measurement. The script prints the median per operation and the geometric mean of the zerolith to vanilla ratios. Pass an iteration count as the first argument; the default is 7.

It is a quick check that a change did not make rendering slower, not a substitute for the public benchmark: the baseline here is written for this harness, and the page skips the template prepare pass of the build tools.

### 2026-10-31, 0.1.0-alpha.5

Windows 11, Chrome Headless Shell 156, 11 iterations.

| Operation | Vanilla (ms) | zerolith (ms) | Ratio |
| --- | --- | --- | --- |
| create 1,000 rows | 22.0 | 24.4 | 1.11 |
| replace all rows | 20.7 | 21.9 | 1.06 |
| update every 10th row | 4.9 | 4.9 | 1.00 |
| select a row | 0.0 | 0.1 | n/a |
| swap two rows | 1.3 | 1.5 | 1.15 |
| remove a row | 1.1 | 1.2 | 1.09 |
| create 10,000 rows | 238.3 | 259.1 | 1.09 |
| append 1,000 rows | 20.7 | 20.6 | 1.00 |
| clear rows | 2.3 | 2.2 | 0.96 |
| geometric mean | | | 1.05 |

### Earlier runs

| Run | Core gzip | Geometric mean |
| --- | --- | --- |
| 2026-10-28, first run after the template layer | 6,248 B | 1.26 |
| 2026-10-30, 0.1.0-alpha.2 | 8,116 B | 1.29 |
| 2026-10-31, main at `38d5e74` | 9,512 B | 1.09 |
| 2026-10-31, 0.1.0-alpha.5 | 9,548 B | 1.05 |

The core grew with hydration, custom elements, and diagnostics, and since 0.1.0-alpha.4 with the rendering work that clones each template from a copy prepared once, locates bindings by position, and gives keyed lists fast paths for creating, appending, replacing, swapping, removing, and clearing rows, and for updating rows that keep their places.
