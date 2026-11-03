# Benchmarks

Two harnesses measure zerolith. [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) is the shared public benchmark, where every framework renders the same keyed table; it is run here with zerolith next to the popular frameworks. `npm run bench` is this repository's quick check against a hand-written DOM baseline.

## js-framework-benchmark

Every entry renders a table of rows and performs the same nine operations. The harness clicks a button and measures from the click to the end of the paint it causes, from Chrome's performance trace, so script, style, layout, and paint all count; five operations run with the CPU slowed by Chrome, as the official runs do. The memory results are what `performance.measureUserAgentSpecificMemory()` reports for the page after an operation and a forced garbage collection, and the size results are the bytes of the entry's files, uncompressed and compressed.

The zerolith entry is in [js-framework-benchmark/](js-framework-benchmark/). The official results, measured by the benchmark's maintainer, are at https://krausest.github.io/js-framework-benchmark/; zerolith is not among them until the entry is accepted upstream.

### Results, 2026-11-01

One full run on one machine with every entry as published, zerolith at 0.1.0-alpha.6 installed from npm. The last column is the run of 2026-10-31, with zerolith at 0.1.0-alpha.5. 0.1.0-alpha.7 changes no runtime code, and the entry built with it is the same bundle byte for byte, so these results hold for it as well; the entry built with 0.1.0-alpha.8 differs from it only in the diagnostics link the bundle carries, `https://zerolith.dev/e/` in place of `https://molexxxx.github.io/zerolith/e/`.

| Framework | Entry | Version | Weighted geometric mean | 2026-10-31 |
| --- | --- | --- | --- | --- |
| vanilla | `vanillajs` | hand-written | 1.01 | 1.00 |
| Solid | `solid` | 1.9.3 | 1.14 | 1.11 |
| zerolith | `zerolith` | 0.1.0-alpha.6 | 1.14 | 1.12, at 0.1.0-alpha.5 |
| Svelte | `svelte` | 5.42.1 | 1.15 | 1.14 |
| Lit | `lit` | 3.2.0 | 1.24 | 1.23 |
| Vue | `vue` | 3.5.39 | 1.24 | 1.26 |
| Preact | `preact-signals` | 11.0.0, signals 2.3.1 | 1.34 | 1.34 |
| Angular | `angular-cf-signals-nozone` | 22.2.2 | 1.38 | 1.42 |
| React | `react-hooks` | 19.2.0 | 1.48 | 1.44 |

The weighted geometric mean combines each framework's factor against the fastest result of every operation, with the weights of the official results page, so 1.00 would be fastest everywhere; vanilla's 1.01 comes from zerolith selecting a row fastest in this run.

Between the two days the other entries, whose code did not change, moved by as much as 2.8 percent, more than zerolith's 1.8 percent, so the day-to-day comparison says little. Measured side by side instead, in one run the same day with zerolith built from `main` at `301d419`, whose core is the one 0.1.0-alpha.6 shipped, next to 0.1.0-alpha.5 as published and vanilla, the new core's weighted geometric mean was 1.14 to 0.1.0-alpha.5's 1.15: faster at creating, selecting, swapping, and clearing rows, slightly slower at removing one, and level on the rest.

Each cell below is the mean duration in milliseconds, with the factor against the fastest framework for that operation in parentheses.

| Operation | vanilla | Solid | zerolith | Svelte | Lit | Vue | Preact | Angular | React |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| create rows: create 1,000 rows | 30.4 (1.00) | 32.3 (1.06) | 35.1 (1.15) | 32.9 (1.08) | 36.0 (1.18) | 36.3 (1.19) | 42.1 (1.38) | 45.3 (1.49) | 37.9 (1.24) |
| replace all rows: replace all 1,000 rows | 33.6 (1.00) | 36.6 (1.09) | 37.6 (1.12) | 37.8 (1.13) | 39.3 (1.17) | 41.7 (1.24) | 46.9 (1.40) | 50.1 (1.49) | 44.6 (1.33) |
| partial update: update every 10th of 1,000 rows (4x slowdown) | 20.7 (1.00) | 24.8 (1.19) | 24.7 (1.19) | 25.0 (1.20) | 25.1 (1.21) | 26.3 (1.27) | 24.1 (1.16) | 25.1 (1.21) | 30.3 (1.46) |
| select row: highlight a row (4x slowdown) | 8.5 (1.17) | 10.3 (1.41) | 7.3 (1.00) | 10.7 (1.48) | 11.3 (1.56) | 9.2 (1.26) | 9.2 (1.27) | 11.2 (1.55) | 13.2 (1.82) |
| swap rows: swap 2 of 1,000 rows (4x slowdown) | 23.0 (1.00) | 35.0 (1.52) | 25.9 (1.13) | 30.0 (1.30) | 29.2 (1.27) | 27.0 (1.17) | 27.1 (1.18) | 25.1 (1.09) | 244.5 (10.62) |
| remove row: remove one row (2x slowdown) | 18.9 (1.00) | 20.9 (1.10) | 21.4 (1.13) | 21.3 (1.13) | 21.3 (1.13) | 23.5 (1.24) | 21.5 (1.14) | 20.9 (1.11) | 22.4 (1.19) |
| create many rows: create 10,000 rows | 324.2 (1.00) | 352.3 (1.09) | 371.9 (1.15) | 355.1 (1.10) | 381.0 (1.18) | 388.9 (1.20) | 441.3 (1.36) | 445.9 (1.38) | 453.0 (1.40) |
| append rows: add 1,000 rows to 1,000 | 33.9 (1.00) | 36.9 (1.09) | 37.6 (1.11) | 37.1 (1.09) | 41.0 (1.21) | 40.3 (1.19) | 47.3 (1.40) | 47.7 (1.41) | 42.8 (1.26) |
| clear rows: clear 1,000 rows (4x slowdown) | 16.8 (1.00) | 20.2 (1.20) | 19.8 (1.18) | 20.7 (1.23) | 27.8 (1.65) | 24.1 (1.43) | 29.4 (1.75) | 29.8 (1.77) | 32.2 (1.91) |

| Measure | vanilla | Solid | zerolith | Svelte | Lit | Vue | Preact | Angular | React |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ready memory, after load (MB) | 0.56 | 0.58 | 0.72 | 0.67 | 0.72 | 0.87 | 0.69 | 1.14 | 1.18 |
| run memory, with 1,000 rows (MB) | 2.02 | 2.83 | 3.39 | 3.02 | 2.98 | 4.07 | 5.04 | 3.76 | 4.57 |
| after creating and clearing 1,000 rows 5 times (MB) | 0.65 | 0.77 | 0.96 | 0.97 | 0.88 | 1.19 | 8.94 | 1.68 | 1.97 |
| size uncompressed (kB) | 11.7 | 11.5 | 27.1 | 26.6 | 22.1 | 64.3 | 23.3 | 110.6 | 190.3 |
| size compressed (kB) | 2.5 | 4.5 | 8.2 | 9.7 | 7.3 | 23.3 | 8.3 | 33.8 | 51.4 |
| first paint (ms) | 112.7 | 115.4 | 113.8 | 120.2 | 114.4 | 116.4 | 112.2 | 118.4 | 208.9 |

zerolith's entry updates rows by setting a new array, as the guides teach, so the keyed list compares all 1,000 keys to find the changed rows, where the Solid, Svelte, and Preact entries write to a signal in each changed row. The entry's bundle grew from 26.2 to 27.1 kB uncompressed and from 7.9 to 8.2 kB compressed with this release's new checks and cleanup paths.

Each framework is the keyed entry of the benchmark's repository at commit `ca8715d` (2026-10-25), built from its own lockfile; zerolith is the entry in [js-framework-benchmark/](js-framework-benchmark/), installed from its lockfile and built with `npm run build-prod`. The durations are the mean of 10 runs, and 20 for selecting a row; the memory, size, and first paint results are one run each, as the harness takes them, so small differences there say little.

The machine was an AMD Ryzen 9 9950X3D (16 cores) with 31.1 GB of memory, on Windows 11 Pro (build 26200), with Chrome 156.0.8078.74 run headless by the benchmark's own driver and Node 24.13.0, as on 2026-10-31. It was in normal use during the runs, and the frameworks ran one after another; the vanilla entry, measured in the same run, is the reference to read the others against. The benchmark's driver runs each framework in a browser process of its own, and on this processor, whose two halves of cores differ, a process held to one half took 38 to 53% longer than one held to the other (see [npm run bench:compare](#npm-run-benchcompare)); these runs did not hold the browser to either half, so a difference of a few percent between two frameworks here can be where the system ran each one.

### Held to one group of cores, 2026-11-02

vanilla and zerolith 0.1.0-alpha.8 alone, from the same checkout and builds, with the runner held to the first eight logical processors as [Reproducing](#reproducing) shows and the machine otherwise idle, over the nine timed operations. Each cell is the median of 15 runs, as the official page shows them by default; script is the part of it spent running JavaScript, and the rest is style, layout, and paint.

| Operation | vanilla (ms) | zerolith (ms) | zerolith over vanilla | vanilla script (ms) | zerolith script (ms) |
| --- | --- | --- | --- | --- | --- |
| create 1,000 rows | 28.4 | 31.7 | 1.12 | 1.7 | 4.9 |
| replace all 1,000 rows | 29.4 | 32.5 | 1.11 | 3.6 | 6.5 |
| update every 10th row | 12.5 | 13.8 | 1.10 | 0.4 | 1.2 |
| select a row | 6.0 | 5.6 | 0.93 | 0.4 | 0.6 |
| swap 2 rows | 16.7 | 18.4 | 1.10 | 0.2 | 0.4 |
| remove one row | 14.9 | 15.7 | 1.05 | 0.4 | 0.2 |
| create 10,000 rows | 302.3 | 335.5 | 1.11 | 17.7 | 42.8 |
| append 1,000 rows | 31.1 | 33.7 | 1.08 | 1.8 | 4.5 |
| clear 1,000 rows | 12.1 | 12.1 | 1.00 | 9.0 | 8.9 |
| weighted geometric mean | | | 1.08 | | |

Held to one group, zerolith's factor against vanilla is 1.08, where the run above, left to the system, put zerolith at 1.14 and vanilla at 1.01; a run the same day with 0.1.0-alpha.7, while a game ran on the machine, gave 1.08 as well. Nearly all of the difference is script: the paint after creating 1,000 rows takes 26.3 ms for vanilla and 26.4 for zerolith, while the script before it takes 1.7 and 4.9, about 3 µs more for each row.

### Reproducing

[js-framework-benchmark/README.md](js-framework-benchmark/README.md) lists the steps to run the entry from a checkout of the benchmark. To measure the same frameworks, pass them all to the runner: `npm run bench -- --framework keyed/vanillajs keyed/zerolith keyed/solid keyed/svelte keyed/vue keyed/react-hooks keyed/angular-cf-signals-nozone keyed/preact-signals keyed/lit`.

On a processor whose cores differ, hold the runner to one group of them, which every browser it starts inherits: from a Windows Command Prompt, `start "" /affinity FF /wait /b cmd /c npm run bench -- --framework keyed/vanillajs keyed/zerolith` keeps it on the first eight logical processors, and on Linux, `taskset -c 0-7 npm run bench -- --framework keyed/vanillajs keyed/zerolith` does the same.

## npm run bench

`npm run bench` runs the same operations against two pages in headless Chromium: the zerolith implementation (`web/zerolith.js`, loading the production entry unbundled through an import map) and a hand-written DOM baseline (`web/vanilla.js`). It measures the two against each other as [npm run bench:compare](#npm-run-benchcompare) measures two builds: side by side in one page, so both run in one renderer process, alternating sample by sample and trading frames halfway in a new page, each operation under js-framework-benchmark's CPU slowdown, with garbage collected before every sample. Each sample times the operation plus the synchronous style and layout it forces, then waits a frame outside the measurement. The script prints each page's time for every operation, the geometric mean of its median in the two frames, and the geometric mean of the zerolith to vanilla ratios, which leaves out an operation vanilla does in under a millisecond, where a sample is mostly timer resolution. Pass an iteration count as the first argument; the default is 7.

It is a quick check that a change did not make rendering slower, not a substitute for the public benchmark: the baseline here is written for this harness, and the page skips the template prepare pass of the build tools.

### 2026-11-02, 0.1.0-alpha.8

Windows 11, Chrome Headless Shell 156, 15 iterations, two runs with the machine otherwise idle, the zerolith row written on one line as the js-framework-benchmark entry writes it, against the vanilla page as it is now: each row a copy of one prepared row, filled through the text nodes the copy holds, with one listener on the table body for every row's links, as the fastest hand-written entries of js-framework-benchmark are written. Earlier the same day the same core measured 1.08 twice at `43b854f` with a game running on the machine, and 1.03 twice against the earlier vanilla page, which built each row with `createElement` and gave each link a listener of its own; held to one group of cores, js-framework-benchmark itself measured 1.08 ([above](#held-to-one-group-of-cores-2026-11-02)), as this page does. The runs before these measured each page in a browser of its own, without the CPU slowdowns, so their numbers do not compare with these.

| Operation | Vanilla (ms) | zerolith (ms) | Ratio | Second run |
| --- | --- | --- | --- | --- |
| create 1,000 rows | 21.7 | 24.2 | 1.11 | 1.14 |
| replace all rows | 20.1 | 22.4 | 1.11 | 1.13 |
| update every 10th row | 28.4 | 29.2 | 1.03 | 1.00 |
| select a row | 0.2 | 0.4 | n/a | n/a |
| swap two rows | 12.9 | 13.5 | 1.04 | 1.03 |
| remove a row | 5.8 | 6.1 | 1.06 | 1.03 |
| create 10,000 rows | 225.8 | 245.6 | 1.09 | 1.09 |
| append 1,000 rows | 20.8 | 22.3 | 1.07 | 1.04 |
| clear rows | 12.3 | 13.7 | 1.11 | 1.13 |
| geometric mean | | | 1.08 | 1.07 |

### 2026-11-01, 0.1.0-alpha.6

Windows 11, Chrome Headless Shell 156, 11 iterations.

| Operation | Vanilla (ms) | zerolith (ms) | Ratio |
| --- | --- | --- | --- |
| create 1,000 rows | 21.1 | 24.1 | 1.14 |
| replace all rows | 18.3 | 21.5 | 1.17 |
| update every 10th row | 4.4 | 4.4 | 1.00 |
| select a row | 0.0 | 0.1 | n/a |
| swap two rows | 1.8 | 1.4 | 0.78 |
| remove a row | 1.2 | 1.1 | 0.92 |
| create 10,000 rows | 217.9 | 255.3 | 1.17 |
| append 1,000 rows | 21.1 | 20.6 | 0.98 |
| clear rows | 1.6 | 1.9 | 1.19 |
| geometric mean | | | 1.03 |

Run against 0.1.0-alpha.5 as published, alternating under the same load at 11 iterations each, the two cores measured within each other's spread: 1.11 and 1.08 for 0.1.0-alpha.5, 1.06 and 1.11 for 0.1.0-alpha.6.

### Earlier runs

| Run | Core gzip | Geometric mean |
| --- | --- | --- |
| 2026-10-28, first run after the template layer | 6,248 B | 1.26 |
| 2026-10-30, 0.1.0-alpha.2 | 8,116 B | 1.29 |
| 2026-10-31, main at `38d5e74` | 9,512 B | 1.09 |
| 2026-10-31, 0.1.0-alpha.5 | 9,548 B | 1.05 |
| 2026-11-01, 0.1.0-alpha.6 | 9,909 B | 1.03 |

The core grew with hydration, custom elements, and diagnostics, and since 0.1.0-alpha.4 with the rendering work that clones each template from a copy prepared once, locates bindings by position, and gives keyed lists fast paths for creating, appending, replacing, swapping, removing, and clearing rows, and for updating rows that keep their places. 0.1.0-alpha.6 adds the factory form of `render`, `hydrate`, and `renderToString`, the cleanup a failed mount does, and coded refusals for a function given to `when` or `each`.

## npm run bench:compare

`npm run bench:compare` measures what a change does to the core's speed. It builds the core at a base commit in a temporary worktree, HEAD unless `--base` names another, then loads that build and the working tree's side by side in one page of a headless Chromium, a frame each, and times every iteration of every operation on both, alternating which goes first, so the two meet the same load and drift between runs cancels. The frames share one renderer process, since two tabs are two processes and where the system runs each shows in the result: with the same build in two tabs on a Ryzen 9 9950X3D, whose two halves of cores differ, a process held to one half took 48 to 53% longer than one held to the other with the machine otherwise idle, and 38 to 40% longer with a game running, up to 2.3 times as long on one operation, and with both held to the same half the tab opened second still took 1.4 to 3.7% longer. Halfway the builds trade frames, in a new page with a renderer process of its own, since in a page loaded after another in the same process one frame ran an operation up to 21% slower; a build's time for an operation is the geometric mean of its median in each frame, so a frame's own speed divides out, and each operation's factor is the change's time over the base's. With the same build on both sides, three runs gave overall factors of -0.4 to +0.4%, with single operations within 7%, so a change of a few percent in one operation needs more `--iterations` than the default 15. The small operations run under js-framework-benchmark's CPU slowdowns, so they take long enough to time. A pass crosses when their geometric mean is more than `--threshold` percent above 1, 5 by default, or one operation's factor is more than `--operation-threshold` percent above 1, 15 by default; a crossing pass is confirmed with fresh samples, and the run fails only when the confirming pass crosses too, so one noisy pass cannot fail a change. The base's build is kept in a cache folder, `ZEROLITH_BENCH_CACHE` or one in the temporary folder, so later runs against the same commit skip its install and build.

CI runs it on every push and pull request against `--base baseline`, the commit [baseline](baseline) names, so slowdowns too small to fail one push cannot add up unnoticed: every push is measured against the same commit. The baseline moves only in a commit that says why: after each release, to the release's tag, and after a change that makes the core faster, to that change, so the gain is kept; a deliberate slowdown moves it with its reason.
