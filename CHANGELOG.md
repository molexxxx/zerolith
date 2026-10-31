# Changelog

Every package in this repository is released together and carries the same version. Entries name the packages they touch; breaking changes before 1.0.0 are called out as such.

## Unreleased

### Breaking

- `zerolith`: the hooks build tools and the dev tools use moved from `zerolith` to a new `zerolith/internal` entry, which the API freeze will not cover: `prepared`, `scan`, `Scanned`, `PartSpec`, `PreparedPart`, `SCOPE_MARKER`, `devtoolsInternal`, `devtoolsSaveRestore`, `DevtoolsHook`, `DevtoolsEvent`, `NodeSnapshot`, and `RootSnapshot`. `@zerolith/vite`, the command line, and `@zerolith/devtools` import them from there; applications never needed them.

### Added

- `@zerolith/cli` and the `zerolith` crate: `zerolith dev`, `serve`, and `preview` forward requests under a path to a backend, with `--proxy /api=http://127.0.0.1:3000` or a `proxy` entry in `zerolith.json`, so a page reaches its API on its own origin with no CORS to configure. Bodies stream both ways, server-sent events included; WebSocket connections are joined end to end; the backend receives its own `Host` with `X-Forwarded-Host`, `-Proto`, and `-For`; a redirect to the backend's own address comes back as a path; `stripPrefix` removes the matched prefix; and an unreachable backend answers 502 with the reason in the terminal. Only `http://` backends are supported for now.
- `@zerolith/cli` and the `zerolith` crate: `--base` serves the application under a path in `dev`, `serve`, and `preview`, as `build` already wrote it: the site root redirects there, routes under it fall back to `index.html`, and `import.meta.env.BASE_URL` carries it.
- `@zerolith/cli` and the `zerolith` crate: `zerolith.json` next to `index.html` holds what the commands share, `base`, `proxy`, `dev.port`, `preview.port`, and `build.out`, with flags over it, and `@zerolith/cli` ships its JSON schema as `zerolith.schema.json`. Starters on the command line include one.
- `@zerolith/router`: `base`, such as `import.meta.env.BASE_URL`, serves the application under a path. Route paths stay relative to it, `href()` includes it, `navigate()` and `matches()` take a path with or without it, and links outside it are left to the browser.
- Starters follow the base path: the router passes `import.meta.env.BASE_URL`, the packages page fetches its data under the base, and the not-found page links home through it. The README explains reaching a backend through the proxy.
- The fullstack example: an app under `/app/` with a dependency-free Node backend, reached through the proxy while developing, with the backend serving the build in production.
- Docs: a guide to building and serving, with the routing and caching rules and the setup for Netlify, Vercel, Cloudflare Pages, GitHub Pages, nginx, IIS, Node, Express, and ASP.NET Core.
- Nightly canaries of every npm package under the `canary` dist-tag, published by the release workflow when the code changed since the last canary.
- Docs: a home page that runs a counter on the page and measures what each update changes in the DOM, with the packages, characteristics computed when the site is built, and the revision history; a ten-step tutorial that builds a packing list, every file it shows run as a test; a playground that runs zerolith in a sandboxed frame as you type and shares code through a link; the guides grouped, with previous and next links; a guide for coding agents; canonical links, social cards, a sitemap, and an integrity hash on every script and module the pages load.
- The zerolith Agent Skill in `skills/zerolith`: the rules, one pattern per concept, the commands, and a checklist for finishing a change, with every guide and every diagnostic code as a reference. `npx skills add molexxxx/zerolith` installs it; `npm run skills` regenerates the references from the guides, and a test fails while they are stale.
- Brand code tokens for the live parts of a template and for tags, attributes, and literals, and a highlighter on the docs site and in the playground that reads `html` and `css` templates and JSX as what they are.
- Starters: the stylesheet styles every form control, selects, text areas, checkboxes, radios, and fieldsets included, with hover, focus, invalid, disabled, checked, and pressed states. The playground's preview uses the same stylesheet.

### Changed

- `@zerolith/cli` and the `zerolith` crate: when the default port of `dev`, `serve`, or `preview` is taken or reserved, as 8080 often is on Windows, the next free port is used and the banner says so; a port given explicitly fails with a message that says why.
- Docs: the introduction moved from the site root to `/guide/`; the root is the home page.
- `zerolith`: keyed lists insert new rows once per run of new rows, clear a list that owns its parent in one step, keep rows that match at both ends without diffing them, and render a row whose view is a template without marker comments, and every binding allocates less. Measured side by side in one browser, script time to create, replace, or clear 1,000 rows fell by a quarter to a third.

### Fixed

- `zerolith`: a keyed list and a condition no longer keep the owners of removed rows and branches alive in the owner around them, so a list that lives on while its rows come and go, or a condition that toggles, no longer grows the heap. A browser test measures the heap across churn.
- `@zerolith/cli` and the `zerolith` crate: `zerolith build` keeps a stylesheet link to a file that is not in the project, such as one the host serves next to the app, with a warning, instead of failing.
- `zerolith` and `@zerolith/devtools`: the inspector reads a computed value's last result instead of running it, so opening it never re-enters a computation in progress.
- `zerolith`: a template that starts or ends with a binding, such as `` html`${name}<hr>` ``, takes that binding's content with it when it is replaced, hidden, moved, or removed. Before, the content stayed behind in a condition that switched branches, a value that switched templates, and a keyed row that moved or left the list.
- `@zerolith/router`: each page renders inside an owner of its own, so the effects and `onDispose` cleanups a view registers end when the route changes. Before, a page reached by client-side navigation ran without an owner, and its effects outlived it.

## 0.1.0-alpha.4 (2026-10-30)

Live reload works on Windows, and the command line's output follows the brand, with a dev server banner, a line per change, and a build table with gzip sizes. The docs site wears the brand too, and every example in the guides now reads as application code. This is the first release published to npm through trusted publishing alone.

### Changed

- `@zerolith/cli` and the `zerolith` crate: the command line's output follows the brand. Every command opens with the `zerolith` badge, and colors mark addresses and finished steps in green, errors in red, warnings in yellow, and labels and details dimmed. `zerolith dev` prints the address, the folder, and the reload behavior, then a line for each change it announces. `zerolith build` prints a table of the files it wrote with their gzip sizes. Colors are dropped under `NO_COLOR` and when the output goes to a file or another program.
- `@zerolith/cli` and the `zerolith` crate: `zerolith dev` ignores changes inside `dist`, `coverage`, and `test-results`, so a build or a test run next to it does not reload the page.
- `@zerolith/cli` and the `zerolith` crate: `zerolith doctor` checks a page's import map only when the page has one; a page without one is complete, since `zerolith dev` resolves the packages and `zerolith build` bundles them, so a new starter no longer fails with `importmap_missing`.
- Docs site: the site wears the brand, with the lockup, the three typefaces served from the site itself, the basalt palette in a dark and a light theme with a toggle, code colored by keyword, string, and comment with a copy button, a table of contents per page, and a menu on narrow screens.
- Docs site: every example in the guides reads as application code. It shows the imports it uses, renders into the page or prints what it would show, and leaves the checks that keep it honest to the test around it; the docs build refuses an example that shows one.

### Fixed

- `@zerolith/cli` and the `zerolith` crate: live reload works on Windows. The watcher compared each changed file with a project folder carrying the `\\?\` prefix of a Windows canonical path, which no change matched, so `zerolith dev` never told the page to reload.
- `@zerolith/cli` and the `zerolith` crate: a port already in use is reported as such, with the `--port` option to pick another.
- Docs site: an element name in a diagnostic's cause, such as `<iframe>`, is shown as code instead of being rendered as an element.

## 0.1.0-alpha.3 (2026-10-30)

The command line now does the whole job on its own: `zerolith new` writes a starter in TSX, `zerolith dev` serves it with packages resolved from `node_modules` and no import map, `zerolith build` bundles and minifies it with Rolldown and lightningcss compiled into the binary, and `zerolith preview` serves the result. Vite stays an option through `@zerolith/vite`, and the inspector no longer freezes the page when it opens.

### Breaking changes

- `@zerolith/vite`: a client build fails with `lazy_module_not_split` when a view loaded with the router's `lazy()`, or a locale module of a message index compiled by `zerolith-i18n`, is also imported statically, which would put it in the importing chunk instead of a chunk of its own. Server builds are not checked.
- `@zerolith/cli` and the `zerolith` crate: `zerolith new` writes a starter on the command line by default, in TSX: its `dev`, `build`, and `preview` scripts run `zerolith dev`, `zerolith build`, and `zerolith preview`, and the command installs the dependencies. `--vite` writes a project on Vite, as the default did before, `--template tsx|ts|jsx|js` replaces `--js`, and `--buildless` writes no import map or vendor script any more, since `zerolith dev` resolves the packages and `zerolith build --unbundled` writes the map.
- `@zerolith/cli` and the `zerolith` crate: `zerolith build` bundles the application instead of writing it file by file. The previous output, sources transformed one by one and served with the packages vendored behind an import map, is `zerolith build --unbundled`, which `zerolith new --buildless` now writes into the project's build script.

### Added

- `@zerolith/cli` and the `zerolith` crate: `zerolith build` bundles with Rolldown and lightningcss compiled into the binary, with no Node tooling. The modules `index.html` loads become minified, tree-shaken chunks with content hashes in their names; lazy route views and compiled locales get chunks of their own, under the same `lazy_module_not_split` check as the Vite plugin; JSX is lowered and every template prepared as in `vite build`; the stylesheets the page links and the modules import become one file, with local `@import`s inlined under their conditions and the result lowered for the supported browsers; imported and referenced files are copied under hashed names, `?url` and `?raw` imports included; `public/` is copied as it is; and the page is rewritten to load the output, with its static imports preloaded. `--base`, `--mode`, `--sourcemap`, `--no-minify`, and `--empty-out-dir` configure it, and `import.meta.env` carries the mode and the base.
- `@zerolith/cli` and the `zerolith` crate: `zerolith dev` resolves package imports from `node_modules` with the resolver and conditions `zerolith build` uses, so a page needs one module script and no import map, and serves packages that live outside the project folder, such as workspace packages, under `/@fs/`. Stylesheets, JSON, and other files imported from code become modules as in the build, a CommonJS package is reported by name, and `public/` is served at the root.
- `@zerolith/cli` and the `zerolith` crate: `zerolith preview` serves a build's output folder as a static host would.
- `@zerolith/cli` and the `zerolith` crate: `import.meta.env` carries the mode, the base, and every variable named with the `PUBLIC_` prefix from `.env` files and the environment, in `zerolith dev` and `zerolith build` alike; other variables never reach the browser.
- `@zerolith/cli` and the `zerolith` crate: the starter `zerolith new` writes has three pages in the brand style, a browser test, `src/env.d.ts` typing `import.meta.env`, an `AGENTS.md`, and a README on developing, building, previewing, and deploying. On a terminal the command asks for the folder, the language, the dev server and build, the inspector, and the install, each with a default, and `--yes`, `--no-devtools`, and `--no-install` answer without asking.
- `@zerolith/cli` and the `zerolith` crate: `zerolith build --unbundled` copies `public/` to the root of the output, replaces `import.meta.env` as the bundled build does, and vendors the packages from the nearest `node_modules` above the project, as in a workspace.
- `@zerolith/cli` and the `zerolith` crate: `zerolith doctor` runs the template lint of the Vite plugin over the project's sources and reports the same warnings, with the file, line, and column; a shared fixture holds both implementations to the same findings.

### Changed

- `@zerolith/vite`, `@zerolith/cli`, and the `zerolith` crate: the prepare pass creates a template with no bindings once, at module scope, and every render reuses that view instead of allocating a new one.

### Fixed

- `zerolith` and `@zerolith/devtools`: opening the inspector from its launcher or with Alt+Shift+Z froze the page. Nodes the inspector created after it mounted counted as the application's, so every refresh listed them and created more. What the inspector's effects and owners create is now internal however late it is created, and internal nodes, roots, and effect runs are not announced to subscribers.

## 0.1.0-alpha.2 (2026-10-30)

Templates are prepared at build time by the Vite plugin and the command line, views mount by CSS selector, and every diagnostic links to a page that exists: the docs site is published to GitHub Pages with each release.

### Breaking changes

- `zerolith`: `DIAGNOSTIC_URL`, and with it the link in every diagnostic, moves from `https://zerolith.dev/e/` to `https://molexxxx.github.io/zerolith/e/`, where the pages are published. The old address never resolved; the links move once more when the project registers its own domain.
- `@zerolith/vite`: `vite build` runs the template prepare pass by default, and a module that uses `html` from zerolith other than as a template tag, or re-exports it, fails the build at its line. `prepare: false` keeps the previous behavior.
- `@zerolith/cli` and the `zerolith` crate: `zerolith build` runs the same pass with the same refusals. `--no-prepare` keeps the previous behavior.

### Added

- `zerolith`: `render` and `hydrate` take a CSS selector for the container as well as an element, the root exposes the element it mounted into as `container`, and a selector that matches nothing reports `mount_target_missing`. The `@zerolith/vite` runtime and `tracedHydrate` in `@zerolith/otel` take the same targets.
- `zerolith`: `prepared` registers a template's scan made ahead of time, `scan` is exported for build tools, and `template_not_prepared` reports a template that a bundle without the scanner was never given.
- `@zerolith/vite`: the template prepare pass scans every `html` literal at build time, so the browser binds templates without scanning them and the scanner leaves the bundle.
- `@zerolith/cli` and the `zerolith` crate: `build` runs the prepare pass over the project's modules and the vendored packages and puts the scanner's stand-in in its place, held to the Vite plugin's output by a shared fixture.

### Fixed

- `@zerolith/cli` and the `zerolith` crate: `importmap` and `build` write each module's integrity hash on its preload link. Without it the browser could not use the preloads, because the import map gives the module requests that hash, and downloaded every vendored module twice. `doctor` warns about a page whose preload links lack it, under `preload_integrity_mismatch`.
- `@zerolith/cli` and the `zerolith` crate: `zerolith new` lists `@zerolith/test` and `@zerolith/vite` as development dependencies.
- `@zerolith/cli` and the `zerolith` crate: the usage text names the command `zerolith` on every platform instead of the executable file name.
- Every package: the `latest` dist-tag follows the newest pre-release until a stable version exists, so `npm install zerolith` no longer stays on `0.1.0-alpha.1`.

## 0.1.0-alpha.1 (2026-10-29)

The first published alpha. The API is not frozen: minor versions may change it until 1.0.0, and the `alpha` dist-tag marks that.

- `zerolith`: signals, `html` and `css` templates, fine-grained rendering, hydration, server rendering (`zerolith/ssr`), coded diagnostics with a catalog, custom elements (`zerolith/element`), the JSX types (`zerolith/jsx-runtime`), and the dev tools hook.
- `@zerolith/router`: the typed route table, loaders, head metadata, scroll restoration, the server entry (`@zerolith/router/server`) with embedded route data, and the `observe` hook.
- `@zerolith/forms`: native forms enhanced with `fetch`, RFC 9457 problem details with a `fields` map, and Standard Schema validation shared with the server.
- `@zerolith/client`: a typed client over a generated OpenAPI contract (`zerolith-client`), with a message port transport.
- `@zerolith/test`: mount with cleanup, settle, hydration mismatches, and accessibility issues.
- `@zerolith/a11y`: focus trap, roving tabindex, live announcer, focus origin, visually hidden styles, and media query signals.
- `@zerolith/i18n`: locale negotiation and state on `Intl`, formatters, and the MessageFormat 2 compiler (`zerolith-i18n`).
- `@zerolith/otel`: navigation, hydration, and request spans through `@opentelemetry/api`.
- `@zerolith/devtools`: the in-page inspector.
- `@zerolith/vite`: JSX lowering, hot replacement with named-signal restore, the production build check, and development warnings.
- `@zerolith/cli` and the `zerolith` crate: `dev` serving TypeScript and JSX through oxc, `build`, `importmap`, `doctor`, and `new`; npm installs a prebuilt binary through one optional platform package per target (Linux, macOS, and Windows on x64 and arm64).
