//! The README and AGENTS.md the new project gets, worded for the tools it
//! was written with.

use super::{Choice, Tool};

/// What each script does, as the home page says it.
pub(super) fn steps(tool: Tool) -> (&'static str, &'static str, &'static str) {
    match tool {
        Tool::CommandLine => (
            "Serves the app while you work, with packages loaded straight from node_modules.",
            "Bundles and minifies it into dist/, ready for any host.",
            "Serves dist/ the way a host will, to check the build.",
        ),
        Tool::Unbundled => (
            "Serves the app while you work, with packages loaded straight from node_modules.",
            "Writes the modules to dist/ as they are, the packages behind an import map.",
            "Serves dist/ the way a host will, to check the build.",
        ),
        Tool::Vite => (
            "Starts Vite, which swaps an edited component in place.",
            "Bundles and minifies the app into dist/ through Vite.",
            "Serves dist/ the way a host will, to check the build.",
        ),
    }
}

/// Where the project's AGENTS.md sends an agent for zerolith's own rules: the skill in the project, or the command that adds it.
pub(super) fn skill_pointer(choice: Choice) -> String {
    if choice.skill {
        "zerolith's own rules and patterns are in the zerolith skill in `.agents/skills/zerolith/`, also at `.claude/skills/zerolith/` for Claude Code; `npx zerolith skill` brings it to the installed version after an upgrade. The guides at https://zerolith.dev/guide/ cover each concept in full.".to_string()
    } else {
        "zerolith's own rules and patterns are in the zerolith skill, which `npx zerolith skill` adds to the project. The guides at https://zerolith.dev/guide/ cover each concept in full.".to_string()
    }
}

pub(super) fn agents_md(name: &str, choice: Choice) -> String {
    let ext = choice.ext();
    let messages = if choice.typescript { "" } else { " --js" };
    let component = choice.component_ext();
    let tool = match choice.tool {
        Tool::Vite => "The project develops and builds on Vite with `@zerolith/vite`.",
        Tool::Unbundled => {
            "The project develops on the zerolith command line, with packages loaded from `node_modules`, and `npm run build` writes the modules as they are, with the packages vendored behind an import map, instead of a bundle; there is no Vite config."
        }
        Tool::CommandLine => {
            "The project develops and builds on the zerolith command line; packages load from `node_modules` with no import map, and there is no Vite config."
        }
    };
    let skill = skill_pointer(choice);
    let syntax = if choice.jsx {
        "Components are capitalized functions written in JSX, one per file under `src/components/`, with their styles next to the markup, in a `css` literal or in a stylesheet beside the component imported with `?scoped`. JSX is a spelling of `html` templates: `class`, not `className`; `on:click` for events, `prop:value` for properties, `bool:disabled` for boolean attributes; lists and conditions are `each` and `when`."
    } else {
        "Components are capitalized functions returning `html` templates, one per file under `src/components/`, with their styles next to the markup, in a `css` literal or in a stylesheet beside the component imported with `?scoped`."
    };
    format!(
        "# {name}: guide for coding agents\n\nA zerolith application. {tool} This file holds what is specific to this project. {skill}\n\n## Commands\n\n- `npm run dev` serves the app with live reload; `npm run build` writes `dist/`; `npm run preview` serves `dist/`.\n- `npm run check` is the gate: typecheck, lint (oxlint, then `zerolith lint` over the templates), browser tests, and the build.\n- With `@zerolith/client` installed, `npx zerolith-client openapi.json --out src/api.ts` regenerates the typed client from the API contract, in TypeScript, which the build serves in a JavaScript project too; with `@zerolith/i18n` installed, `npx zerolith-i18n messages --out src/messages{messages}` regenerates the message modules.\n\n## Rules\n\n- Bind the signal, not its value: a live binding takes `count`, never `count.get()`, which freezes. Call `.get()` only inside `computed`, `effect`, `resource.params`, and event handlers.\n- {syntax}\n- State that must survive an edit is a named signal: `signal(0, {{ name: \"count\" }})`.\n- `src/api.ts` and `src/messages/` are generated when they exist; change their inputs and regenerate, never edit them.\n- A new page is a route in `src/routes.{ext}` and a component; shared state goes in `src/store.{ext}`, created with the first piece of it.\n- Read `router` inside functions only: `src/router.{ext}` imports the route table, which imports the components, so a component module that uses `router` at its top level runs before the router exists.\n- Files served as they are, such as data, icons, and `robots.txt`, go in `public/`.\n- Only `.env` variables named `PUBLIC_*` reach the browser, as `import.meta.env.PUBLIC_*`.\n\n## Where things go\n\n| Change | Location |\n| --- | --- |\n| A page | `src/routes.{ext}` and `src/components/<page>.{component}` |\n| Shared state or a request | `src/store.{ext}` |\n| A message, once the project uses `@zerolith/i18n` | `messages/<locale>.json`, then regenerate |\n| A style token | `src/styles.css`; component styles stay with the component |\n| A static file | `public/` |\n"
    )
}

/// The commands the starter's home page and README show for each step.
pub(super) fn commands(tool: Tool) -> (&'static str, &'static str, &'static str) {
    match tool {
        Tool::CommandLine => ("zerolith dev", "zerolith build", "zerolith preview"),
        Tool::Unbundled => (
            "zerolith dev",
            "zerolith build --unbundled",
            "zerolith preview",
        ),
        Tool::Vite => ("npm run dev", "npm run build", "npm run preview"),
    }
}

pub(super) fn readme(name: &str, choice: Choice) -> String {
    let ext = choice.ext();
    let component = choice.component_ext();
    let (run_dev, run_build, run_preview) = commands(choice.tool);
    let intro = match choice.tool {
        Tool::Vite => {
            "A zerolith application on Vite. The commands below are the project's npm scripts, which run Vite with `@zerolith/vite`."
        }
        _ => {
            "A zerolith application. The commands below are the zerolith command line. Install it once with `npm install --global @zerolith/cli`, or run the project's own copy, which `npm install` put in `node_modules`, as `npx zerolith dev` or through the `dev`, `build`, and `preview` npm scripts, which is what CI should do."
        }
    };
    let (develop, build) = match choice.tool {
        Tool::CommandLine => (
            "serves the app at http://127.0.0.1:8080/ with live reload. Packages load straight from `node_modules`, so `index.html` names one module and a new file needs nothing but an import where it is used. An edit reloads the page and keeps the value of every named signal; a stylesheet edit applies without a reload.",
            "bundles and minifies the app into `dist/`: one script and one stylesheet with content hashes in their names, a chunk of its own for each lazy route, the files in `public/`, and an `index.html` that loads them. Templates are prepared at build time, and the inspector stays out.",
        ),
        Tool::Unbundled => (
            "serves the app at http://127.0.0.1:8080/ with live reload. Packages load straight from `node_modules`, so `index.html` names one module and a new file needs nothing but an import where it is used. An edit reloads the page and keeps the value of every named signal; a stylesheet edit applies without a reload.",
            "writes the app into `dist/` without bundling it: every module transformed to JavaScript and served as it is, the files in `public/`, and the packages copied into `dist/vendor/` behind an import map with integrity hashes. `zerolith build` bundles it instead, whenever one minified file suits the host better.",
        ),
        Tool::Vite => (
            "starts Vite with `@zerolith/vite`, which applies an edited component in place and keeps the value of every named signal.",
            "runs `vite build`, which bundles and minifies the app into `dist/`: hashed scripts and a stylesheet, the files in `public/`, and an `index.html` that loads them. `npx zerolith build` writes an equivalent bundle without Vite.",
        ),
    };
    let preview = if choice.tool == Tool::Vite {
        "runs `vite preview`, which serves `dist/` at http://localhost:4173/"
    } else {
        "serves `dist/` at http://127.0.0.1:4173/"
    };
    let base = match choice.tool {
        Tool::CommandLine => {
            "set `\"base\": \"/app/\"` in `zerolith.json`: `zerolith dev`, `build`, and `preview` then serve and write the app under that path, and the router follows it"
        }
        Tool::Unbundled => {
            "set `\"base\": \"/app/\"` in `zerolith.json` and bundle it with `zerolith build`, which applies it; the unbundled output is served from the root"
        }
        Tool::Vite => {
            "build it with `npm run build -- --base /app/`; the router follows the base Vite builds with"
        }
    };
    let backend = match choice.tool {
        Tool::Vite => {
            "To reach an API while developing, add `server.proxy` to `vite.config.ts`, such as `{ \"/api\": \"http://127.0.0.1:3000\" }`, so the page calls `fetch(\"/api/notes\")` on its own origin."
        }
        _ => {
            "To reach an API while developing, add it to the proxy in `zerolith.json`: `\"proxy\": { \"/api\": \"http://127.0.0.1:3000\" }` forwards every request under `/api` to the backend on port 3000, so the page calls `fetch(\"/api/notes\")` on its own origin with no CORS to set up, and cookies work as they will in production. `zerolith preview` forwards the same paths, and `--proxy /api=http://127.0.0.1:3000` does it for one run."
        }
    };
    let config = if choice.tool == Tool::Vite {
        "vite.config.ts           Vite, with the zerolith plugin\n"
    } else {
        "zerolith.json            the settings dev, build, and preview share\n"
    };
    let inspector = if choice.devtools {
        " Press Alt+Shift+Z, or the launcher button in the corner, to open the inspector: every signal with its value, the mounted roots, and the diagnostics."
    } else {
        ""
    };
    let lowering = if choice.tool == Tool::Vite {
        "`@zerolith/vite` lowers"
    } else {
        "`zerolith dev` and `zerolith build` lower"
    };
    let syntax = if choice.jsx {
        format!(
            "\n\nComponents are written in JSX, which {lowering} to `html` templates before the browser sees them: write `class` rather than `className`, `on:click` for events, `prop:value` for properties, and `bool:disabled` for boolean attributes. Lists and conditions are `each` and `when`. The [templates guide](https://zerolith.dev/guide/templates/) has the whole mapping."
        )
    } else {
        String::new()
    };
    let vite = match choice.tool {
        Tool::Vite => {
            "This project develops on Vite, for in-place component replacement and Vite plugins. The zerolith command line runs the same app without it: `npx zerolith dev`, `npx zerolith build`, and `npx zerolith preview`."
        }
        _ => {
            "The app needs no Vite: the zerolith command line serves, bundles, and previews it on its own. `vite` and `@zerolith/vite` are installed for the tests alone, since Vitest is built on Vite. To develop on Vite instead, for one of its plugins or an edited component applied in place instead of a reload, write a `vite.config.ts` that adds `zerolith()` from `@zerolith/vite` to its plugins, and point the scripts at `vite`, `vite build`, and `vite preview`. `zerolith new --vite` starts a project that way."
        }
    };
    format!(
        "# {name}\n\n{intro}{syntax}\n\n## Develop\n\n```\n{run_dev}\n```\n\n`{run_dev}` {develop}{inspector}\n\n## Build\n\n```\n{run_build}\n```\n\n`{run_build}` {build}\n\n## Preview\n\n```\n{run_preview}\n```\n\n`{run_preview}` {preview} as a host would, to check the build before deploying it.\n\n## Deploy\n\n`dist/` is static files. Upload it to any static host, such as GitHub Pages, Netlify, Cloudflare Pages, or a storage bucket, or serve it from the static file handler of any backend. Answer every path that names no file with `index.html`, so routes such as `/counter` load directly. To serve the app under a path such as `/app/`, {base}.\n\n## Backend\n\n{backend}\n\n## Environment variables\n\nVariables in `.env` whose names start with `PUBLIC_` reach the code as `import.meta.env.PUBLIC_NAME`; any other variable stays out of the browser. `.env.local` overrides `.env` and stays out of git.\n\n## Tests and checks\n\n`npm test` runs the browser tests in `test/` in headless Chromium; run `npx playwright install chromium` once first. Vitest reads the components itself, through the zerolith plugin that `vitest.config.ts` adds, so JSX and stylesheets imported with `?scoped` work in a test as they do in the app. `npm run check` runs the type check, the linters, oxlint and `zerolith lint`, which checks the templates, the tests, and the build.\n\n## Vite\n\n{vite}\n\n## Layout\n\n```\nindex.html               the page: the stylesheet and the entry module\npublic/                  files served and copied as they are\nsrc/main.{ext}             the entry\nsrc/routes.{ext}           the route table\nsrc/router.{ext}           the router the components share\nsrc/components/*.{component}   one component per file, its styles next to its markup\nsrc/styles.css           the design tokens and global styles\nsrc/env.d.ts             the types of import.meta.env and ?scoped stylesheets\ntest/                    browser tests\nvitest.config.ts         the test runner, with the zerolith plugin\n{config}```\n\n`AGENTS.md` is the same map for coding agents.\n"
    )
}

pub(super) const FULLSTACK_README: &str = r##"# __NAME__

A zerolith application with its own backend, written from the fullstack example: Harbor, where a small team keeps its projects and tasks. A member signs in, sees the day's numbers and the team's activity live on the dashboard, starts projects, and moves tasks across a project's board. The app is served under `/app/` and talks to a JSON API under `/api`; the backend, in `server/`, is plain Node with no dependencies, which Node 22.18 or newer runs as TypeScript with no build step.

The commands below are the project's npm scripts: `dev` and `build` run the zerolith command line that `npm install` put in `node_modules`, and `api` and `start` run the backend.

## What it shows

| Part | Where | What to look at |
| --- | --- | --- |
| Shared types and validation | `shared/` | One `Api` contract that the backend answers and the typed client calls, and Standard Schemas that the forms run in the browser and the API runs again |
| Sessions | `server/api.ts`, `src/store.ts`, `src/main.ts` | An HttpOnly cookie on the app's own origin, changes from other sites refused through `Sec-Fetch-Site`, and the sign-in page shown until the backend knows the member |
| Forms | `src/components/sign-in.ts`, `projects.ts`, `project.ts` | Native forms sent with `@zerolith/forms`, with field errors from the shared schema or from the backend |
| Live updates | `server/events.ts`, `src/components/dashboard.ts` | Server-sent events, closed with the page through `onDispose`, and announced to screen readers |
| Routing | `src/routes.ts` | A loader, a title from the loaded data, and a page whose code loads on its first visit |
| Formatting | `src/locale.ts` | Relative times and numbers in the reader's format, through `Intl`, with nothing shipped |
| Tests | `test/` | The backend called as a function in Node, and the pages in Chromium |

## Develop

```
npm run dev
```

`zerolith dev` starts the backend with the app, since `zerolith.json` names `npm run api` beside the `/api` proxy: the backend answers the API at http://127.0.0.1:3001/api/ in watch mode, restarting when a file under `server/` or `shared/` changes, with its data, which lives in memory, starting over, and the app is served at http://127.0.0.1:8080/app/ with live reload, or on the next free port when 8080 is taken, as the banner says, with the site root redirecting to `/app/`. Both write to the one terminal, and Ctrl+C stops both. If the app comes up before the backend, the page says the backend is out of reach and asks again every two seconds, so it opens as soon as the API answers. Every request under `/api` is forwarded to the backend, so the app calls the API on its own origin, with no CORS to configure, and the session cookie works as it will in production:

```json
{
    "$schema": "./node_modules/@zerolith/cli/zerolith.schema.json",
    "base": "/app/",
    "proxy": {
        "/api": { "target": "http://127.0.0.1:3001", "run": "npm run api" }
    }
}
```

To run the backend on its own, as under a debugger, `npm run api` starts it and `npx zerolith dev --no-backends` serves the app without starting it. To run it on another port, set `PORT`, as in `PORT=4000 npm run api`, and point the proxy at it.

Sign in as `ada@harbor.test` with the password `analytical`. In a second window, sign in as `grace@harbor.test` with `compiler`, and what one member does appears on the other's dashboard as it happens.

## Build

```
npm run build
```

`zerolith build` bundles and minifies the app into `dist/` for the base in `zerolith.json`, so every URL in `dist/index.html` starts with `/app/`. The project board, which the router loads with `lazy()`, is a chunk of its own, fetched the first time a member opens a project.

## Run the build

```
npm start
```

`npm start` runs `node server/main.ts --production`: one server answers the API and serves `dist/` under `/app/`, at http://127.0.0.1:3001/app/. The hashed files under `assets/` are cached for a year, and every other path under `/app/` gets `index.html`, uncached, so a route such as `/app/projects/1` loads directly and a new build is picked up at once.

To check the build without the backend serving it, `npx zerolith preview` serves `dist/` under the same base and forwards `/api` the same way, starting the backend as `dev` does.

## Deploy

The project deploys as one Node application on Node 22.18 or newer: install the dependencies, run `npm run build`, and start it with `npm start`, with `PORT` set to the port it should listen on. The server listens on 127.0.0.1, so put a reverse proxy such as Caddy or nginx in front of it to serve HTTPS. When the proxy sends `X-Forwarded-Proto: https`, as Caddy does and nginx does with `proxy_set_header X-Forwarded-Proto $scheme;`, the session cookie is marked `Secure`.

The data lives in memory and starts over when the server restarts, and the members and their passwords are written in `server/data.ts`; move both to a database, with password hashes, before relying on it.

To serve `dist/` from a static host or another web server instead, give it the same rules: `index.html` for every path under `/app/` that names no file, a year of caching for `assets/`, and `/api` forwarded to the backend. The [building and serving guide](https://zerolith.dev/guide/deploying/) has the setup for static hosts, nginx, IIS, Express, and ASP.NET Core.

## Environment variables

Variables in `.env` whose names start with `PUBLIC_` reach the app's code as `import.meta.env.PUBLIC_NAME`; any other variable stays out of the browser. `.env.local` overrides `.env` and stays out of git. The backend reads the environment it runs in through `process.env`, as it reads `PORT`.

## Tests and checks

`npm test` runs the tests in `test/`: `server.test.ts` calls the backend as the function it is, with no port, and checks sessions, validation, the live stream, and how it serves a build, in Node; `app.browser.test.ts` renders the pages against an API kept in memory, in headless Chromium; run `npx playwright install chromium` once first. The browser tests read the pages through the zerolith plugin that `vitest.config.ts` adds, which gives them the board's `?scoped` stylesheet as the app gets it; the app itself needs no Vite. `npm run check` runs the type check, the linter, the tests, and the build.

## Layout

```
server/               the backend, plain Node: no dependencies, no build step
    main.ts           starts it: the API, and the built app with --production
    app.ts            one function from Request to Response: /api, then the app
    api.ts            the API's routes, with sessions and validation
    data.ts           the data, in memory, and the numbers derived from it
    events.ts         the live activity stream, as server-sent events
    static.ts         serves dist/ under /app/ with the right caching
    node.ts           runs the function on Node's HTTP server
shared/               imported by the app and the backend alike
    model.ts          the types both sides exchange
    api.ts            the API contract the typed client follows
    schema.ts         the validation the forms and the API share
src/                  the app
    main.ts           the entry: the sign-in page or the app
    routes.ts         the route table
    router.ts         the router, under the base /app/
    store.ts          the typed client, the session, and shared data
    locale.ts         dates and numbers in the reader's format
    styles.css        the tokens and global styles
    components/       one file per page, project.css for the board, and ui.ts
                      for shared pieces
test/                 the backend's tests in Node, the pages' in Chromium
zerolith.json         the base, /app/, and the proxy from /api to the backend
index.html            the page: the stylesheet and the entry module
```

`AGENTS.md` is the same map for coding agents, and it points them at the zerolith skill.
"##;

pub(super) const FULLSTACK_AGENTS: &str = r##"# __NAME__: guide for coding agents

A zerolith application with its own backend, written from the fullstack example: Harbor, a team's projects and tasks. The app is served under `/app/` and calls a JSON API under `/api`; `server/` is the backend, plain Node with no dependencies, which also serves the build in production, and `shared/` holds what both sides import. The app develops and builds on the zerolith command line; packages load from `node_modules` with no import map, and there is no Vite config. This file holds what is specific to this project. __SKILL__

## Commands

- `npm run dev` runs both: it starts the backend, `npm run api`, which answers on port 3001 and restarts when `server/` or `shared/` changes, and serves the app under `/app/` with live reload, forwarding `/api` to the backend as `zerolith.json` says; `npx zerolith dev --no-backends` serves the app alone when the backend runs elsewhere. While the backend is down, the page says so and asks again every two seconds.
- `npm run build` writes `dist/` for the base `/app/`; `npm start` serves the API and `dist/` from the backend.
- `npm run check` is the gate: typecheck, lint (oxlint, then `zerolith lint` over the templates), the backend's tests in Node and the pages' in Chromium, and the build.
- Sign in as `ada@harbor.test` with the password `analytical`.

## Rules

- Bind the signal, not its value: a live binding takes `count`, never `count.get()`, which freezes. Call `.get()` only inside `computed`, `effect`, `resource.params`, and event handlers.
- Components are capitalized functions returning `html` templates, one file per page under `src/components/`, with their styles next to the markup: a `css` literal, or for a stylesheet as large as the board's, `project.css` beside the component, imported with `?scoped`. Pieces several pages share go in `src/components/ui.ts`.
- What both sides need goes in `shared/`: the types in `model.ts`, the API contract in `api.ts`, and the validation in `schema.ts`. Change a route in `shared/api.ts` and `server/api.ts` together.
- The app calls the API through the typed client in `src/store.ts`, or through a form whose `action` is the API's path, never by host and port: the proxy forwards the request while developing, and the backend answers it in production.
- Every API route but signing in needs the session cookie. A failure answers with a problem document, and a form shows its `fields` next to the inputs.
- A page that starts something, such as a timer or a stream, stops it with `onDispose`; a test mounts it as `mount(() => Page())`, so it runs inside an owner.
- Read `router` inside functions only: `src/router.ts` imports the route table, which imports the components, so a component module that uses `router` at its top level runs before the router exists.
- The base `/app/` is set in `zerolith.json` and served by `server/app.ts`; change the two together. Links come from `router.href`, never a written-out `/app/` path.
- The backend runs on Node with its types stripped, so `server/` and `shared/` use erasable TypeScript only: no `enum`, `namespace`, or parameter properties.
- Only `.env` variables named `PUBLIC_*` reach the browser, as `import.meta.env.PUBLIC_*`.

## Where things go

| Change | Location |
| --- | --- |
| An API route | Its contract in `shared/api.ts`, its handler in `server/api.ts`, and a test in `test/server.test.ts` |
| A type both sides use | `shared/model.ts` |
| Validation | `shared/schema.ts`, run by the form and by the API |
| A page | A route in `src/routes.ts` and a component in `src/components/` |
| State more than one page reads | `src/store.ts` |
| A style token or a global style | `src/styles.css`; component styles stay with the component |
| The base path or the backend's port | `zerolith.json` and `server/`, together |
| A test | `test/*.test.ts` runs in Node, `test/*.browser.test.ts` in Chromium |
| A static file | `public/`, which the build copies into `dist/` |
"##;
