# Benchmarks

zerolith is measured on [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark), the shared public benchmark where every framework renders the same keyed table and performs the same operations, next to hand-written JavaScript and seven popular frameworks. The results below are the newest release's, measured again for every release; [How the results are measured](#how-the-results-are-measured) says how. Two scripts in this folder check a change between releases: [npm run bench](#npm-run-bench) against a hand-written page, and [npm run bench:compare](#npm-run-benchcompare) against an earlier build.

<!-- results: written by `npm run bench:report` from benchmarks/results/ -->
## Results

The newest release, zerolith 0.1.0-alpha.8, measured on 2026-11-02 with medians of 15 runs, held to one group of cores on an idle machine, next to hand-written JavaScript and seven popular frameworks. The score is each framework's weighted geometric mean: every operation's time over the fastest framework's, combined with the weights of the official results page, so 1.00 would be fastest everywhere and lower is faster. The last column is the run before, 0.1.0-alpha.6, 2026-11-01, with means of 10 runs, the cores left to the system.

| Framework | Entry | Version | Score | 0.1.0-alpha.6, 2026-11-01 |
| --- | --- | --- | --- | --- |
| vanilla | `vanillajs` | hand-written | 1.00 | 1.01 |
| Solid | `solid` | 1.9.3 | 1.07 | 1.14 |
| zerolith | `zerolith` | 0.1.0-alpha.8 | 1.08 | 1.14 |
| Svelte | `svelte` | 5.42.1 | 1.10 | 1.15 |
| Lit | `lit` | 3.2.0 | 1.18 | 1.24 |
| Vue | `vue` | 3.5.39 | 1.19 | 1.24 |
| Preact | `preact-signals` | 11.0.0 + 2.3.1 | 1.27 | 1.34 |
| Angular | `angular-cf-signals-nozone` | 22.2.2 | 1.29 | 1.38 |
| React | `react-hooks` | 19.2.0 | 1.41 | 1.48 |

### Every operation

Each cell is the median duration in milliseconds, with the factor against the fastest framework for that operation in parentheses.

| Operation | vanilla | Solid | zerolith | Svelte | Lit | Vue | Preact | Angular | React |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| create 1,000 rows | 28.5 (1.00) | 29.7 (1.04) | 31.9 (1.12) | 30.9 (1.08) | 33.2 (1.16) | 33.8 (1.19) | 38.8 (1.36) | 42.2 (1.48) | 34.6 (1.21) |
| replace all 1,000 rows | 30.1 (1.00) | 32.3 (1.07) | 33.2 (1.10) | 33.3 (1.11) | 34.7 (1.15) | 35.8 (1.19) | 40.7 (1.35) | 41.5 (1.38) | 40.3 (1.34) |
| update every 10th row (4x slowdown) | 12.3 (1.00) | 14.1 (1.15) | 14.4 (1.17) | 14.1 (1.15) | 14.8 (1.20) | 15.5 (1.26) | 14.1 (1.15) | 14.3 (1.16) | 17.8 (1.45) |
| select a row (4x slowdown) | 6.0 (1.00) | 6.4 (1.07) | 6.0 (1.00) | 8.2 (1.37) | 8.7 (1.45) | 6.8 (1.13) | 6.6 (1.10) | 8.4 (1.40) | 8.8 (1.47) |
| swap 2 rows (4x slowdown) | 15.4 (1.00) | 16.6 (1.08) | 16.2 (1.05) | 17.5 (1.14) | 20.2 (1.31) | 17.5 (1.14) | 18.9 (1.23) | 18.0 (1.17) | 127.3 (8.27) |
| remove one row (2x slowdown) | 13.8 (1.01) | 14.1 (1.03) | 13.7 (1.00) | 14.3 (1.04) | 14.8 (1.08) | 16.7 (1.22) | 14.7 (1.07) | 15.1 (1.10) | 15.1 (1.10) |
| create 10,000 rows | 306.0 (1.00) | 321.2 (1.05) | 337.9 (1.10) | 326.9 (1.07) | 349.3 (1.14) | 351.3 (1.15) | 408.4 (1.33) | 402.0 (1.31) | 418.7 (1.37) |
| append 1,000 rows to 1,000 | 31.2 (1.00) | 31.6 (1.01) | 33.4 (1.07) | 32.4 (1.04) | 35.8 (1.15) | 35.3 (1.13) | 41.0 (1.31) | 41.5 (1.33) | 37.2 (1.19) |
| clear 1,000 rows (4x slowdown) | 11.9 (1.00) | 14.5 (1.22) | 12.3 (1.03) | 13.3 (1.12) | 15.9 (1.34) | 15.3 (1.29) | 16.8 (1.41) | 15.1 (1.27) | 21.0 (1.76) |

### Memory, size, and first paint

| Measure | vanilla | Solid | zerolith | Svelte | Lit | Vue | Preact | Angular | React |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ready memory, after load (MB) | 0.57 | 0.59 | 0.72 | 0.66 | 0.72 | 0.86 | 0.69 | 1.14 | 1.18 |
| run memory, with 1,000 rows (MB) | 2.03 | 2.84 | 3.39 | 3.03 | 2.98 | 4.07 | 5.04 | 3.76 | 4.57 |
| after creating and clearing 1,000 rows 5 times (MB) | 0.65 | 0.78 | 0.96 | 0.97 | 0.87 | 1.18 | 8.94 | 1.70 | 1.97 |
| size uncompressed (kB) | 11.7 | 11.5 | 27.1 | 26.6 | 22.1 | 64.3 | 23.3 | 110.6 | 190.3 |
| size compressed (kB) | 2.5 | 4.5 | 8.1 | 9.7 | 7.3 | 23.3 | 8.3 | 33.8 | 51.4 |
| first paint (ms) | 125.4 | 124.4 | 127.1 | 128.3 | 121.4 | 127.1 | 132.3 | 136.8 | 213.6 |

### Every run

Each run's scores, newest first. A score compares frameworks within its own run, so a change in how the runs were taken moves every framework's score with it.

| Run | vanilla | Solid | zerolith | Svelte | Lit | Vue | Preact | Angular | React | Measured |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.1.0-alpha.8, 2026-11-02 | 1.00 | 1.07 | 1.08 | 1.10 | 1.18 | 1.19 | 1.27 | 1.29 | 1.41 | medians of 15 runs, held to one group of cores on an idle machine |
| 0.1.0-alpha.6, 2026-11-01 | 1.01 | 1.14 | 1.14 | 1.15 | 1.24 | 1.24 | 1.34 | 1.38 | 1.48 | means of 10 runs, the cores left to the system |
| 0.1.0-alpha.5, 2026-10-31 | 1.00 | 1.11 | 1.12 | 1.14 | 1.23 | 1.26 | 1.34 | 1.42 | 1.44 | means of 10 runs, the cores left to the system |

0.1.0-alpha.6, 2026-11-01: 0.1.0-alpha.7 builds the same bundle byte for byte, so this run stands for it too.
<!-- /results -->

## How the results are measured

Every entry renders a table of rows and performs the same nine operations. The harness clicks a button and measures from the click to the end of the paint it causes, from Chrome's performance trace, so script, style, layout, and paint all count; five operations run with the CPU slowed by Chrome, as the official runs do, and each operation's duration is the median of 15 runs, 25 for selecting a row, as the official results page shows them by default. The memory results are what `performance.measureUserAgentSpecificMemory()` reports for the page after an operation and a forced garbage collection, and the size results are the bytes of the entry's files, uncompressed and compressed; each of those is one run, as the harness takes them, so small differences there say little.

Each framework is the keyed entry of the benchmark's repository at the commit [frameworks.json](frameworks.json) names, built from its own lockfile. zerolith is the entry in [js-framework-benchmark/](js-framework-benchmark/), pinned to the release and built with `npm run build-prod`; it updates rows by setting a new array, as the guides teach, so the keyed list compares all 1,000 keys to find the changed rows, where the Solid, Svelte, and Preact entries write to a signal in each changed row. The official results, measured by the benchmark's maintainer, are at https://krausest.github.io/js-framework-benchmark/; zerolith is not among them until the entry is accepted upstream.

The benchmark's driver runs each framework in a browser process of its own. On a processor whose cores differ, such as the Ryzen 9 9950X3D these runs used, a process held to one half of the cores took 38 to 53% longer than one held to the other (see [npm run bench:compare](#npm-run-benchcompare)), so a run is taken with the runner held to one group of cores, which every browser it starts inherits, on an otherwise idle machine. The runs before 2026-11-02 left the cores to the system and took means of 10 runs, and every framework's score in them is higher for it.

### Reproducing

[js-framework-benchmark/README.md](js-framework-benchmark/README.md) lists the steps to run the entry from a checkout of the benchmark. To measure every framework the results show, pass their entries to the runner, held to one group of cores: from a Windows Command Prompt, `start "" /affinity FF /wait /b cmd /c npm run bench -- --headless --framework keyed/vanillajs keyed/zerolith keyed/solid keyed/svelte keyed/vue keyed/react-hooks keyed/angular-cf-signals-nozone keyed/preact-signals keyed/lit` keeps it on the first eight logical processors, and on Linux, `taskset -c 0-7` in front of the same `npm run bench` does the same.

Then, in this repository, `npm run bench:collect -- <checkout>/webdriver-ts/results --date <YYYY-MM-DD> --zerolith <version> --method <text> --machine <text>` writes the run into [results/](results/), and `npm run bench:report` writes the results section above from every run there. A test fails while the section and the runs disagree.

## npm run bench

`npm run bench` runs the same operations against two pages in headless Chromium: the zerolith implementation (`web/zerolith.js`, loading the production entry unbundled through an import map) and a hand-written DOM baseline (`web/vanilla.js`), whose rows are copies of one prepared row filled through the text nodes the copy holds, with one listener on the table body for every row's links, as the fastest hand-written entries of js-framework-benchmark are written. It measures the two against each other as [npm run bench:compare](#npm-run-benchcompare) measures two builds: side by side in one page, so both run in one renderer process, alternating sample by sample and trading frames halfway in a new page, each operation under js-framework-benchmark's CPU slowdown, with garbage collected before every sample. Each sample times the operation plus the synchronous style and layout it forces, then waits a frame outside the measurement. The script prints each page's time for every operation, the geometric mean of its median in the two frames, and the geometric mean of the zerolith to vanilla ratios, which leaves out an operation vanilla does in under a millisecond, where a sample is mostly timer resolution. Pass an iteration count as the first argument; the default is 7.

It is a quick check that a change did not make rendering slower, not a substitute for the public benchmark: the baseline here is written for this harness, and the page skips the template prepare pass of the build tools.

### Newest: 0.1.0-alpha.8, 2026-11-02

Windows 11, Chrome Headless Shell 156, 15 iterations, two runs on an otherwise idle machine. js-framework-benchmark itself measured the same release at 1.08 of vanilla ([Results](#results)), as this page does.

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

### Every run

| Run | Core gzip | Geometric mean |
| --- | --- | --- |
| 2026-11-02, 0.1.0-alpha.8 | 9,897 B | 1.08 |
| 2026-11-01, 0.1.0-alpha.6 | 9,909 B | 1.03 |
| 2026-10-31, 0.1.0-alpha.5 | 9,548 B | 1.05 |
| 2026-10-31, main at `38d5e74` | 9,512 B | 1.09 |
| 2026-10-30, 0.1.0-alpha.2 | 8,116 B | 1.29 |
| 2026-10-28, first run after the template layer | 6,248 B | 1.26 |

The runs before 2026-11-02 measured each page in a browser of its own, without the CPU slowdowns, against a vanilla page that built each row with `createElement` and gave each link a listener of its own, so they compare with each other but not with the newest. The core grew with hydration, custom elements, and diagnostics, and since 0.1.0-alpha.4 with the rendering work that clones each template from a copy prepared once, locates bindings by position, and gives keyed lists fast paths for creating, appending, replacing, swapping, removing, and clearing rows, and for updating rows that keep their places.

## npm run bench:compare

`npm run bench:compare` measures what a change does to the core's speed. It builds the core at a base commit in a temporary worktree, HEAD unless `--base` names another, then loads that build and the working tree's side by side in one page of a headless Chromium, a frame each, and times every iteration of every operation on both, alternating which goes first, so the two meet the same load and drift between runs cancels. The frames share one renderer process, since two tabs are two processes and where the system runs each shows in the result: with the same build in two tabs on a Ryzen 9 9950X3D, whose two halves of cores differ, a process held to one half took 48 to 53% longer than one held to the other with the machine otherwise idle, and 38 to 40% longer with a game running, up to 2.3 times as long on one operation, and with both held to the same half the tab opened second still took 1.4 to 3.7% longer. Halfway the builds trade frames, in a new page with a renderer process of its own, since in a page loaded after another in the same process one frame ran an operation up to 21% slower; a build's time for an operation is the geometric mean of its median in each frame, so a frame's own speed divides out, and each operation's factor is the change's time over the base's. With the same build on both sides, three runs gave overall factors of -0.4 to +0.4%, with single operations within 7%, so a change of a few percent in one operation needs more `--iterations` than the default 15. The small operations run under js-framework-benchmark's CPU slowdowns, so they take long enough to time. A pass crosses when their geometric mean is more than `--threshold` percent above 1, 5 by default, or one operation's factor is more than `--operation-threshold` percent above 1, 15 by default; a crossing pass is confirmed with fresh samples, and the run fails only when the confirming pass crosses too, so one noisy pass cannot fail a change. The base's build is kept in a cache folder, `ZEROLITH_BENCH_CACHE` or one in the temporary folder, so later runs against the same commit skip its install and build.

CI runs it on every push and pull request against `--base baseline`, the commit [baseline](baseline) names, so slowdowns too small to fail one push cannot add up unnoticed: every push is measured against the same commit. The baseline moves only in a commit that says why: after each release, to the release's tag, and after a change that makes the core faster, to that change, so the gain is kept; a deliberate slowdown moves it with its reason.
