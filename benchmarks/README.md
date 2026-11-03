# Benchmarks

zerolith is measured on [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark), the shared public benchmark where every framework renders the same keyed table and performs the same operations, next to hand-written JavaScript and seven popular frameworks. The results below are the newest release's, measured again for every release; [How the results are measured](#how-the-results-are-measured) says how. Two scripts in this folder check a change between releases: [npm run bench](#npm-run-bench) against a hand-written page, and [npm run bench:compare](#npm-run-benchcompare) against an earlier build.

<!-- results: written by `npm run bench:report` from benchmarks/results/ -->
## Results

The newest release, zerolith 0.1.0-alpha.8, measured on 2026-11-03 with medians of 15 runs on a GitHub-hosted runner, next to hand-written JavaScript and seven popular frameworks. The score is each framework's weighted geometric mean: every operation's time over the fastest framework's, combined with the weights of the official results page, so 1.00 would be fastest everywhere and lower is faster. No framework was fastest at every operation in this run, so none scores 1.00: each operation's fastest framework sets that operation's 1.00. This run did not measure the release before; every run's scores are listed below.

| Framework | Entry | Version | Score |
| --- | --- | --- | --- |
| vanilla | `vanillajs` | hand-written | 1.04 |
| Solid | `solid` | 1.9.3 | 1.12 |
| zerolith | `zerolith` | 0.1.0-alpha.8 | 1.14 |
| Svelte | `svelte` | 5.42.1 | 1.17 |
| Lit | `lit` | 3.2.0 | 1.27 |
| Vue | `vue` | 3.5.39 | 1.29 |
| Preact | `preact-signals` | 11.0.0 + 2.3.1 | 1.37 |
| Angular | `angular-cf-signals-nozone` | 22.2.2 | 1.42 |
| React | `react-hooks` | 19.2.0 | 1.48 |

### Every operation

Each cell is the median duration in milliseconds, with the factor against the fastest framework for that operation in parentheses.

| Operation | vanilla | Solid | zerolith | Svelte | Lit | Vue | Preact | Angular | React |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| create 1,000 rows | 56.4 (1.00) | 62.1 (1.10) | 67.9 (1.20) | 65.7 (1.16) | 69.5 (1.23) | 69.9 (1.24) | 80.9 (1.43) | 87.9 (1.56) | 70.6 (1.25) |
| replace all 1,000 rows | 67.5 (1.00) | 78.7 (1.17) | 77.4 (1.15) | 82.5 (1.22) | 83.5 (1.24) | 88.1 (1.31) | 101.8 (1.51) | 99.1 (1.47) | 97.8 (1.45) |
| update every 10th row (4x slowdown) | 45.0 (1.15) | 39.2 (1.00) | 48.2 (1.23) | 42.6 (1.09) | 50.6 (1.29) | 54.3 (1.39) | 42.4 (1.08) | 53.4 (1.36) | 52.3 (1.33) |
| select a row (4x slowdown) | 8.0 (1.00) | 11.6 (1.45) | 9.3 (1.16) | 13.6 (1.70) | 15.6 (1.95) | 10.3 (1.29) | 12.7 (1.59) | 15.6 (1.95) | 16.5 (2.06) |
| swap 2 rows (4x slowdown) | 53.0 (1.05) | 59.6 (1.18) | 57.8 (1.15) | 61.6 (1.22) | 71.3 (1.41) | 55.8 (1.11) | 66.9 (1.33) | 50.4 (1.00) | 353.2 (7.01) |
| remove one row (2x slowdown) | 41.9 (1.06) | 40.9 (1.04) | 43.8 (1.11) | 44.7 (1.13) | 39.4 (1.00) | 53.4 (1.36) | 41.2 (1.05) | 43.4 (1.10) | 44.3 (1.12) |
| create 10,000 rows | 652.1 (1.00) | 715.6 (1.10) | 750.5 (1.15) | 722.5 (1.11) | 777.9 (1.19) | 784.4 (1.20) | 907.9 (1.39) | 900.8 (1.38) | 934.5 (1.43) |
| append 1,000 rows to 1,000 | 75.9 (1.00) | 77.0 (1.01) | 82.6 (1.09) | 79.0 (1.04) | 90.3 (1.19) | 87.4 (1.15) | 102.9 (1.36) | 100.8 (1.33) | 92.0 (1.21) |
| clear 1,000 rows (4x slowdown) | 27.8 (1.07) | 36.0 (1.38) | 26.0 (1.00) | 33.8 (1.30) | 44.3 (1.70) | 41.2 (1.58) | 51.8 (1.99) | 50.2 (1.93) | 57.5 (2.21) |

### Memory, size, and first paint

The benchmark takes one sample of each, so a small difference here says little.

| Measure | vanilla | Solid | zerolith | Svelte | Lit | Vue | Preact | Angular | React |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ready memory, after load (MB) | 0.56 | 0.59 | 0.66 | 0.66 | 0.72 | 0.80 | 0.69 | 1.13 | 1.13 |
| run memory, with 1,000 rows (MB) | 1.87 | 2.64 | 3.21 | 2.87 | 2.79 | 3.91 | 4.89 | 3.61 | 4.42 |
| after creating and clearing 1,000 rows 5 times (MB) | 0.64 | 0.77 | 0.95 | 0.97 | 0.88 | 1.19 | 8.95 | 1.64 | 1.98 |
| size uncompressed (kB) | 11.3 | 11.5 | 27.1 | 26.6 | 22.1 | 64.3 | 23.3 | 110.6 | 190.3 |
| size compressed (kB) | 2.5 | 4.5 | 8.1 | 9.7 | 7.3 | 23.3 | 8.3 | 33.8 | 51.4 |
| first paint (ms) | 85.5 | 101.0 | 287.9 | 103.3 | 114.6 | 167.7 | 118.0 | 229.4 | 371.1 |

### Every run

Each run's scores, the newest release first. A score compares frameworks within its own run, so a change in how the runs were taken moves every framework's score with it.

| Run | vanilla | Solid | zerolith | Svelte | Lit | Vue | Preact | Angular | React | Measured |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.1.0-alpha.8, 2026-11-03 | 1.04 | 1.12 | 1.14 | 1.17 | 1.27 | 1.29 | 1.37 | 1.42 | 1.48 | medians of 15 runs on a GitHub-hosted runner |
| 0.1.0-alpha.8, 2026-11-02 | 1.00 | 1.07 | 1.08 | 1.10 | 1.18 | 1.19 | 1.27 | 1.29 | 1.41 | medians of 15 runs, held to one group of cores on an idle machine |
| 0.1.0-alpha.6, 2026-11-01 | 1.01 | 1.14 | 1.14 | 1.15 | 1.24 | 1.24 | 1.34 | 1.38 | 1.48 | means of 10 runs, the cores left to the system |
| 0.1.0-alpha.5, 2026-10-31 | 1.00 | 1.11 | 1.12 | 1.14 | 1.23 | 1.26 | 1.34 | 1.42 | 1.44 | means of 10 runs, the cores left to the system |

0.1.0-alpha.6, 2026-11-01: 0.1.0-alpha.7 builds the same bundle byte for byte, so this run stands for it too.
<!-- /results -->

## How the results are measured

Every entry renders a table of rows and performs the same nine operations. The harness clicks a button and measures from the click to the end of the paint it causes, from Chrome's performance trace, so script, style, layout, and paint all count; five operations run with the CPU slowed by Chrome, as the official runs do, and each operation's duration is the median of 15 runs, 25 for selecting a row, as the official results page shows them by default. The memory results are what `performance.measureUserAgentSpecificMemory()` reports for the page after an operation and a forced garbage collection, and the size results are the bytes of the entry's files, uncompressed and compressed; the harness takes one sample of each a pass, so the benchmarks workflow repeats them for five passes and keeps the medians, where the runs before 0.1.0-alpha.9 kept the one sample.

Each framework is the keyed entry of the benchmark's repository at the commit [frameworks.json](frameworks.json) names, built from its own lockfile. zerolith is the entry in [js-framework-benchmark/](js-framework-benchmark/), whose `package.json` pins the release exactly, installed by the benchmark's `npm run rebuild` and built with `npm run build-prod`; it updates rows by setting a new array, as the guides teach, so the keyed list compares all 1,000 keys to find the changed rows, where the Solid, Svelte, and Preact entries write to a signal in each changed row. The official results, measured by the benchmark's maintainer, are at https://krausest.github.io/js-framework-benchmark/; zerolith is not among them until the entry is accepted upstream.

Every release is measured once it is published, by the [benchmarks workflow](../.github/workflows/benchmarks.yml), which the release workflow starts. On a GitHub-hosted runner, it builds and checks every entry, runs the benchmark in headless Chrome, and commits the run to [results/](results/) with the section above, so the results are always the newest release's; it then deploys the docs site again, whose [benchmarks page](https://zerolith.dev/benchmarks/) renders the same runs. The job that builds and runs the other frameworks' code can change nothing in this repository, and runs on the release's tag, so nothing it could write to the Actions cache reaches a run on main; it hands on only the run's file, and a second job checks every field of it, that it measured the release, and that its frameworks are the ones frameworks.json lists, before it commits the run. A runner is a shared virtual machine, GitHub hands each run whichever one is free, and a change of machine or method moves every framework's score, so each release's run also measures the release before it, from that release's own entry files, in the same session on the same machine: its row in the table above compares with the newest like for like.

The runs from 2026-11-02 and before were taken on a desktop with a Ryzen 9 9950X3D, whose cores differ: a process held to one half of them took 38 to 53% longer than one held to the other (see [npm run bench:compare](#npm-run-benchcompare)), and the benchmark's driver runs each framework in a browser process of its own, so the 2026-11-02 run held the runner to one group of cores, which every browser it starts inherits, on an otherwise idle machine. The runs before it left the cores to the system and took means of 10 runs, and every framework's score in them is higher for it.

### Reproducing

[js-framework-benchmark/README.md](js-framework-benchmark/README.md) lists the steps to run the entry from a checkout of the benchmark. To measure every framework the results show, pass their entries to the runner, held to one group of cores: from a Windows Command Prompt, `start "" /affinity FF /wait /b cmd /c npm run bench -- --headless --framework keyed/vanillajs keyed/zerolith keyed/solid keyed/svelte keyed/vue keyed/react-hooks keyed/angular-cf-signals-nozone keyed/preact-signals keyed/lit` keeps it on the first eight logical processors, and on Linux, `taskset -c 0-7` in front of the same `npm run bench` does the same.

Then, in this repository, `npm run bench:collect -- <checkout>/webdriver-ts/results --date <YYYY-MM-DD> --zerolith <version> --method <text> --machine <text>` writes the run into [results/](results/), and `npm run bench:report` writes the results section above from every run there. A test fails while the section and the runs disagree. The workflow collects its run with `--out <file>` instead, and `npm run bench:report -- --add <file> --pin <version>` takes it in: the file is checked as every kept run is, the entry's pin moves to the release unless it names a later one, and the baseline moves with it unless it names a commit the release does not hold.

## npm run bench

`npm run bench` runs the same operations against two pages in headless Chromium: the zerolith implementation (`web/zerolith.js`, loading the production entry unbundled through an import map) and a hand-written DOM baseline (`web/vanilla.js`), whose rows are copies of one prepared row filled through the text nodes the copy holds, with one listener on the table body for every row's links, as the fastest hand-written entries of js-framework-benchmark are written. It measures the two against each other as [npm run bench:compare](#npm-run-benchcompare) measures two builds: side by side in one page, so both run in one renderer process, alternating sample by sample and trading frames halfway in a new page, each operation under js-framework-benchmark's CPU slowdown, with garbage collected before every sample. Each sample times the operation plus the synchronous style and layout it forces, then waits a frame outside the measurement. The script prints each page's time for every operation, the geometric mean of its median in the two frames, and the geometric mean of the zerolith to vanilla ratios, which leaves out an operation vanilla does in under a millisecond, where a sample is mostly timer resolution. Pass an iteration count as the first argument; the default is 7.

It is a quick check that a change did not make rendering slower, not a substitute for the public benchmark: the baseline here is written for this harness, and the page skips the template prepare pass of the build tools.

### Newest: 0.1.0-alpha.8, 2026-11-02

Windows 11, Chrome Headless Shell 156, 15 iterations, two runs on an otherwise idle machine. On the same machine, js-framework-benchmark itself measured the same release at 1.08 of vanilla, as this page does: the 2026-11-02 run in [Results](#results).

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

CI runs it on every push and pull request against `--base baseline`, the commit [baseline](baseline) names, so slowdowns too small to fail one push cannot add up unnoticed: every push is measured against the same commit. The baseline moves only in a commit that says why: after a change that makes the core faster, to that change, so the gain is kept, and after each release, to the release, in the benchmarks workflow's commit of its run, unless the baseline names a commit the release does not hold; a deliberate slowdown moves it with its reason.
