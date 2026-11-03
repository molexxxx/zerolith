# js-framework-benchmark entry

The keyed zerolith implementation for [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark). The files here mirror `frameworks/keyed/zerolith/` in a checkout of that repository. `src/main.js` renders the page with signals, `each` keyed by row id, and a `Row` component that reads the id once and keeps the label and the class live through computed values. `package.json` pins `zerolith` and `@zerolith/cli` to exact versions and builds with `zerolith build`. The selection is one signal holding an id, each listener is bound in its template, and the code never touches the DOM itself, which keeps the entry clear of the notes the benchmark attaches to shortcuts (#772, #796, #800, #801).

`npm run build-prod` writes `dist` with the base path the benchmark server serves it under, `/frameworks/keyed/zerolith/dist/`, and the `customURL` of `/dist` in `package.json` points the benchmark there. Both name the folder, so renaming it means changing both. After a release, the benchmarks workflow sets both versions in `package.json` to it, in the commit that adds the release's run; by hand, `npm run bench:report -- --pin <version>` in the repository's root sets them. The two exact pins decide every package the entry installs, so this folder keeps no `package-lock.json`: the benchmark's `npm run rebuild` writes one when it installs the entry, and the lockfile the benchmark's repository keeps for each entry is written that way.

## Running it

From a checkout of js-framework-benchmark, with Node 24 or newer and Chrome installed:

1. Copy this folder, without this README, to `frameworks/keyed/zerolith`.
2. In the checkout's root, run `npm ci`, then `npm run install-local` to install the server, the benchmark driver, and the results table.
3. Start the server with `npm start` and leave it running. It listens on port 8080; where that port is reserved, as it can be on Windows, set `PORT` to a free port for the server and for every command below.
4. Run `npm run rebuild keyed/zerolith` in the root. It installs the entry from its pins with `npm install --ignore-scripts`, which writes its `package-lock.json`, runs `npm run build-prod`, then runs the benchmark's smoke test, keyed check, and Content Security Policy check, and prints "All checks are fine!" when the entry passes them. Once the lockfile is there, `npm run rebuild-ci keyed/zerolith` installs from it with `npm ci --ignore-scripts` instead, as the benchmark builds the other entries.
5. Open http://localhost:8080/frameworks/keyed/zerolith/dist/index.html to see the page.
6. Run `npm run bench -- --framework keyed/zerolith keyed/vanillajs` in the root to measure the entry next to the baseline, then `npm run results` to build the table at http://localhost:8080/webdriver-ts-results/dist/index.html.

In `webdriver-ts`, `npm run isKeyed -- --headless true keyed/zerolith` runs the keyed check alone. `--count 5` lowers the iterations of a run, and `--benchmark 01_ 02_` limits it to the listed operations.

When the root `npm ci` stops on a peer dependency conflict among the checkout's own development tools, `npm ci --legacy-peer-deps` installs them. When the server's framework list fails because `frameworks/non-keyed` does not exist, create that folder empty.

## Status

The entry pins 0.1.0-alpha.8, whose `zerolith build` keeps the page's link to `/css/currentStyle.css`, the shared stylesheet the benchmark server serves from outside the entry, as written, with a warning, so `npm run build-prod` succeeds. [The benchmarks README](../README.md) has the results of every release's run next to the popular frameworks.
