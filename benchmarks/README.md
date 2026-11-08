# Benchmarks

zerolith is measured on [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark), the shared public benchmark where every framework renders the same keyed table and performs the same operations, next to hand-written JavaScript and seven popular frameworks. The results below are the newest release's, measured again for every release; [How the results are measured](#how-the-results-are-measured) says how. Two scripts in this folder check a change between releases: [npm run bench](#npm-run-bench) against a hand-written page, and [npm run bench:compare](#npm-run-benchcompare) against an earlier build.

<!-- results: written by `npm run bench:report` from benchmarks/results/ -->
## Results

The newest release, zerolith 1.6.0, measured on 2026-11-08 with medians of 15 runs on a GitHub-hosted runner, next to hand-written JavaScript and seven popular frameworks. The score is each framework's weighted geometric mean: every operation's time over hand-written JavaScript's, combined with the weights of the official results page, so hand-written JavaScript is 1.00, a score of 1.10 takes 10% longer than it over the nine operations, and lower is faster. The release before, zerolith 1.5.0, ran in the same session on the same machine, so its row compares with the newest like for like.

| Framework | Entry | Version | Score |
| --- | --- | --- | --- |
| vanilla | `vanillajs` | hand-written | 1.00 |
| Solid | `solid` | 1.9.3 | 1.10 |
| zerolith | `zerolith` | 1.6.0 | 1.12 |
| Svelte | `svelte` | 5.42.1 | 1.15 |
| zerolith, the release before | `zerolith` | 1.5.0 | 1.16 |
| Lit | `lit` | 3.2.0 | 1.25 |
| Vue | `vue` | 3.5.39 | 1.27 |
| Preact | `preact-signals` | 11.0.0 + 2.3.1 | 1.34 |
| Angular | `angular-cf-signals-nozone` | 22.2.2 | 1.40 |
| React | `react-hooks` | 19.2.0 | 1.47 |

### Every operation

Each cell is the median duration in milliseconds, with the factor against hand-written JavaScript for that operation in parentheses; below 1.00 is faster than it.

| Operation | vanilla | Solid | zerolith | Svelte | Lit | Vue | Preact | Angular | React |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| create 1,000 rows | 58.8 (1.00) | 61.9 (1.05) | 71.5 (1.22) | 62.2 (1.06) | 71.6 (1.22) | 74.7 (1.27) | 79.3 (1.35) | 88.0 (1.50) | 71.0 (1.21) |
| replace all 1,000 rows | 67.7 (1.00) | 76.4 (1.13) | 74.4 (1.10) | 80.1 (1.18) | 78.1 (1.15) | 84.8 (1.25) | 95.2 (1.41) | 97.3 (1.44) | 94.4 (1.39) |
| update every 10th row (4x slowdown) | 39.7 (1.00) | 46.2 (1.16) | 51.3 (1.29) | 43.6 (1.10) | 51.7 (1.30) | 49.0 (1.23) | 43.5 (1.10) | 56.6 (1.43) | 54.1 (1.36) |
| select a row (4x slowdown) | 9.4 (1.00) | 11.5 (1.22) | 11.2 (1.19) | 16.3 (1.73) | 16.3 (1.73) | 12.0 (1.28) | 12.4 (1.32) | 16.9 (1.80) | 16.9 (1.80) |
| swap 2 rows (4x slowdown) | 41.6 (1.00) | 49.6 (1.19) | 43.3 (1.04) | 54.0 (1.30) | 68.6 (1.65) | 46.0 (1.11) | 59.4 (1.43) | 54.3 (1.31) | 319.0 (7.67) |
| remove one row (2x slowdown) | 35.4 (1.00) | 34.6 (0.98) | 35.6 (1.01) | 39.6 (1.12) | 40.1 (1.13) | 47.0 (1.33) | 43.8 (1.24) | 42.3 (1.19) | 46.6 (1.32) |
| create 10,000 rows | 641.7 (1.00) | 696.3 (1.09) | 729.0 (1.14) | 709.6 (1.11) | 748.8 (1.17) | 785.2 (1.22) | 875.0 (1.36) | 867.2 (1.35) | 926.2 (1.44) |
| append 1,000 rows to 1,000 | 76.5 (1.00) | 79.3 (1.04) | 84.4 (1.10) | 84.0 (1.10) | 85.6 (1.12) | 89.4 (1.17) | 98.0 (1.28) | 93.3 (1.22) | 89.7 (1.17) |
| clear 1,000 rows (4x slowdown) | 29.0 (1.00) | 35.7 (1.23) | 27.4 (0.94) | 34.8 (1.20) | 45.3 (1.56) | 44.2 (1.52) | 51.7 (1.78) | 48.4 (1.67) | 57.3 (1.98) |

### Memory, size, and first paint

Each value is the median of 5 passes, since the benchmark takes one sample of each a pass.

| Measure | vanilla | Solid | zerolith | Svelte | Lit | Vue | Preact | Angular | React |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ready memory, after load (MB) | 0.56 | 0.59 | 0.74 | 0.66 | 0.66 | 0.86 | 0.69 | 1.13 | 1.13 |
| run memory, with 1,000 rows (MB) | 1.87 | 2.68 | 2.82 | 2.87 | 2.79 | 3.91 | 4.90 | 3.60 | 4.42 |
| after creating and clearing 1,000 rows 5 times (MB) | 0.65 | 0.77 | 0.97 | 0.98 | 0.88 | 1.19 | 8.95 | 1.69 | 1.97 |
| size uncompressed (kB) | 11.3 | 11.5 | 29.9 | 26.6 | 22.1 | 64.3 | 23.3 | 110.6 | 190.3 |
| size compressed (kB) | 2.5 | 4.5 | 9.0 | 9.7 | 7.3 | 23.3 | 8.3 | 33.8 | 51.4 |
| first paint (ms) | 94.9 | 96.8 | 113.0 | 116.5 | 121.6 | 181.0 | 111.1 | 220.1 | 375.6 |

### Every run

Each run's scores, the newest release first. A score compares frameworks within its own run, so a change in how the runs were taken moves every framework's score with it.

| Run | vanilla | Solid | zerolith | Svelte | Lit | Vue | Preact | Angular | React | Measured |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1.6.0, 2026-11-08 | 1.00 | 1.10 | 1.12 | 1.15 | 1.25 | 1.27 | 1.34 | 1.40 | 1.47 | medians of 15 runs on a GitHub-hosted runner |
| 1.5.0, 2026-11-08 | 1.00 | 1.10 | 1.12 | 1.15 | 1.22 | 1.27 | 1.36 | 1.35 | 1.48 | medians of 15 runs on a GitHub-hosted runner |
| 1.3.0, 2026-11-07 | 1.00 | 1.12 | 1.15 | 1.17 | 1.27 | 1.29 | 1.38 | 1.43 | 1.51 | medians of 15 runs on a GitHub-hosted runner |
| 1.2.0, 2026-11-07 | 1.00 | 1.09 | 1.10 | 1.13 | 1.23 | 1.27 | 1.35 | 1.41 | 1.49 | medians of 15 runs on a GitHub-hosted runner |
| 1.1.0, 2026-11-06 | 1.00 | 1.10 | 1.10 | 1.14 | 1.24 | 1.27 | 1.35 | 1.45 | 1.49 | medians of 15 runs on a GitHub-hosted runner |
| 1.0.1, 2026-11-06 | 1.00 | 1.11 | 1.14 | 1.16 | 1.27 | 1.28 | 1.37 | 1.42 | 1.51 | medians of 15 runs on a GitHub-hosted runner |
| 1.0.0, 2026-11-05 | 1.00 | 1.13 | 1.15 | 1.17 | 1.27 | 1.26 | 1.37 | 1.43 | 1.46 | medians of 15 runs on a GitHub-hosted runner |
| 0.1.0-alpha.10, 2026-11-04 | 1.00 | 1.13 | 1.13 | 1.16 | 1.27 | 1.26 | 1.40 | 1.41 | 1.53 | medians of 15 runs on a GitHub-hosted runner |
| 0.1.0-alpha.9, 2026-11-03 | 1.00 | 1.10 | 1.13 | 1.14 | 1.24 | 1.30 | 1.36 | 1.41 | 1.46 | medians of 15 runs on a GitHub-hosted runner |
| 0.1.0-alpha.8, 2026-11-03 | 1.00 | 1.14 | 1.13 | 1.18 | 1.27 | 1.29 | 1.40 | 1.43 | 1.50 | medians of 15 runs on a GitHub-hosted runner |
| 0.1.0-alpha.8, 2026-11-02 | 1.00 | 1.07 | 1.08 | 1.10 | 1.18 | 1.19 | 1.27 | 1.29 | 1.40 | medians of 15 runs, held to one group of cores on an idle machine |
| 0.1.0-alpha.6, 2026-11-01 | 1.00 | 1.13 | 1.13 | 1.14 | 1.23 | 1.23 | 1.33 | 1.37 | 1.47 | means of 10 runs, the cores left to the system |
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
