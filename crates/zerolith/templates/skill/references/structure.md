<!-- Generated from docs/guide/structure.md by npm run skills. Edit the guide, then regenerate. -->

# Application structure

Every zerolith application keeps the same files in the same places, whether it runs on the zerolith command line or on Vite, ships as one bundle or as modules behind an import map, or renders on the server. A reader, a tool, or an agent that knows one zerolith project knows them all.

## What `zerolith new` writes

`zerolith new my-app` with every default writes a TypeScript project with JSX that develops and builds on the zerolith command line, with three working pages:

```tree
my-app/
    index.html              the page: the stylesheet, the entry module, and #app
    package.json            scripts: dev, build, preview, check, typecheck, lint, test
    zerolith.json           the command line's settings: base path, proxy, dev, build, preview
    tsconfig.json           strict TypeScript, with JSX from zerolith
    vitest.config.ts        browser tests in Chromium, with the zerolith plugin
    .oxlintrc.json          lint rules
    .gitignore              dependencies, the build, and local .env files
    AGENTS.md               the map and the rules, for coding agents and new contributors
    README.md               developing, building, deploying, and environment variables
    .agents/skills/         the zerolith skill, for Codex, Cursor, GitHub Copilot, and most agents
    .claude/skills/         the same skill, for Claude Code
    public/                 files served as they are: favicon.svg and data/packages.json
    src/
        main.ts             waits for the router, renders the layout, mounts the inspector
        routes.ts           the route table, one entry per page
        router.ts           createRouter over the table, for typed links in components
        styles.css          design tokens, resets, and global rules
        env.d.ts            the types of import.meta.env and ?scoped stylesheets
        components/
            layout.tsx      the frame around every page: header, navigation, the page, footer
            home.tsx        the first page: what the project is and its commands
            counter.tsx     a page with state: a named signal and a value derived from it
            packages.tsx    a page with data: a resource, a search, and a keyed list
            not-found.tsx   the page for a path no route matches
    test/
        counter.browser.test.ts    a browser test with @zerolith/test
```

The other choices change a few files and keep the layout. `--template ts` and `--template js` write the components as `.ts` or `.js` files with `html` templates, and a JavaScript project types its sources with JSDoc, which `npm run typecheck` checks as well. `--vite` writes a `vite.config.ts` in place of `zerolith.json`. Installing the dependencies adds `node_modules/` and `package-lock.json`.

## As the application grows

Some files appear only when an application needs them, and they have places of their own too:

| File | Added when | Holds |
| --- | --- | --- |
| `src/store.ts` | Two components read the same state | Signals, resources, and the operations that change them |
| `src/schema.ts` | A form validates its input | The Standard Schemas a form checks, which the server imports too |
| `openapi.json`, `src/api.ts` | The app calls a backend that publishes an OpenAPI document | The contract, and the typed client `zerolith-client` generates from it |
| `messages/`, `src/messages/`, `src/locale.ts` | The app speaks more than one language | A catalog per locale, the modules `zerolith-i18n` compiles from them, and the locale signal with its loaders |
| `server/`, `shared/` | The backend is TypeScript in the same project | The backend, and the types, the API contract, and the schemas both sides import, as in the fullstack example |

## What each file owns

- `main.ts` does the things that happen once, in order: it waits for what the first paint needs, `router.ready` and, in an app with messages, the current locale's catalog; it renders the layout around `router.outlet()`; and it mounts development-only tools such as the inspector, which the production build replaces with a module that does nothing. Nothing else is global.
- `routes.ts` is the single list of pages. Each route names its view and can add a loader and head metadata; the router infers the parameters from each path, so a wrong `router.href` call fails `tsc`. The [routing guide](routing.md) builds a small application from these files.
- `router.ts` creates the router in a module of its own, so components can import it for typed links and `navigate`.
- `store.ts` is where state lives once more than one component reads it. State that only one component needs stays inside that component.
- `components/` holds functions that return views, one screen or widget per file, each with its styles next to the markup they style: a `css` literal in the file, or a stylesheet beside it imported with `?scoped`, as in `import card from "./card.css?scoped"`.
- `api.ts` and `src/messages/` are generated. They are checked in so the project builds without running the generators, and regenerated with `zerolith-client` and `zerolith-i18n` after their inputs change. `AGENTS.md` says so, so nobody edits them by hand.
- `schema.ts` holds the Standard Schemas a form validates with, so the server can import the same module and run the same checks.

> [!WARNING]
> The imports form a loop: `router.ts` imports the route table, the table imports the components, and a component imports `router`. ES modules allow it, because a component reads `router` when it runs, after every module has loaded. A component module that uses `router` at its top level runs before the router exists and fails with "Cannot access 'router' before initialization", so read it inside functions only.

## Conventions the tooling relies on

| Convention | Why |
| --- | --- |
| A component is a capitalized function that takes one props object, with children as the `children` prop | JSX treats a capitalized tag as a component and calls it with its attributes as the props, and the Vite plugin swaps capitalized exports in place when their module changes |
| State that must survive an edit is a named signal: `signal(0, { name: "count" })` | `zerolith dev` and the Vite plugin restore named signals after an edit; anonymous ones start over |
| Pages not needed on first paint use `lazy()`, and each locale's messages are a module of their own | The bundler splits them into chunks of their own without configuration |
| Relative imports carry the file extension | The same source runs unbundled, behind an import map |
| `.get()` is called only inside `computed`, `effect`, the params of a `resource`, and event handlers | A template binds the signal itself; a value read in a template is frozen |

## The AGENTS.md

An agent reads one file before touching a project. The scaffold writes this one for `zerolith new my-app`, and the point of its shape is that it fits in context next to the task:

```markdown AGENTS.md
# my-app: guide for coding agents

A zerolith application. The project develops and builds on the zerolith command line; packages load from `node_modules` with no import map, and there is no Vite config. This file holds what is specific to this project. zerolith's own rules and patterns are in the zerolith skill in `.agents/skills/zerolith/`, also at `.claude/skills/zerolith/` for Claude Code; `npx zerolith skill` brings it to the installed version after an upgrade. The guides at https://zerolith.dev/guide/ cover each concept in full.

## Commands

- `npm run dev` serves the app with live reload; `npm run build` writes `dist/`; `npm run preview` serves `dist/`.
- `npm run check` is the gate: typecheck, lint, browser tests, and the build.
- With `@zerolith/client` installed, `npx zerolith-client openapi.json --out src/api.ts` regenerates the typed client from the API contract, in TypeScript, which the build serves in a JavaScript project too; with `@zerolith/i18n` installed, `npx zerolith-i18n messages --out src/messages` regenerates the message modules.

## Rules

- Bind the signal, not its value: a live binding takes `count`, never `count.get()`, which freezes. Call `.get()` only inside `computed`, `effect`, `resource.params`, and event handlers.
- Components are capitalized functions written in JSX, one per file under `src/components/`, with their styles next to the markup, in a `css` literal or in a stylesheet beside the component imported with `?scoped`. JSX is a spelling of `html` templates: `class`, not `className`; `on:click` for events, `prop:value` for properties, `bool:disabled` for boolean attributes; lists and conditions are `each` and `when`.
- State that must survive an edit is a named signal: `signal(0, { name: "count" })`.
- `src/api.ts` and `src/messages/` are generated when they exist; change their inputs and regenerate, never edit them.
- A new page is a route in `src/routes.ts` and a component; shared state goes in `src/store.ts`, created with the first piece of it.
- Read `router` inside functions only: `src/router.ts` imports the route table, which imports the components, so a component module that uses `router` at its top level runs before the router exists.
- Files served as they are, such as data, icons, and `robots.txt`, go in `public/`.
- Only `.env` variables named `PUBLIC_*` reach the browser, as `import.meta.env.PUBLIC_*`.

## Where things go

| Change | Location |
| --- | --- |
| A page | `src/routes.ts` and `src/components/<page>.tsx` |
| Shared state or a request | `src/store.ts` |
| A message, once the project uses `@zerolith/i18n` | `messages/<locale>.json`, then regenerate |
| A style token | `src/styles.css`; component styles stay with the component |
| A static file | `public/` |
```

Other choices change the lines that name the language and the tools. The framework's rules live in the zerolith skill rather than in this file, so the file stays about the project; the [coding agents guide](agents.md) covers what an agent reads and when.

## Scaffolding

The command line comes from npm as `@zerolith/cli`, so `npx @zerolith/cli@alpha new my-app` needs nothing installed first; see [Command line](command-line.md).

| Command | Writes |
| --- | --- |
| `zerolith new my-app` | Asks each question, with TSX and the command line as the defaults |
| `zerolith new my-app --yes` | Takes every default without asking |
| `zerolith new my-app --template js` | JavaScript with `html` templates and JSDoc types |
| `zerolith new my-app --vite` | A project that develops and builds on Vite with `@zerolith/vite` |
| `zerolith new my-app --buildless` | A project that deploys its modules behind an import map instead of a bundle |
| `zerolith new my-app --example fullstack` | The fullstack example: Harbor, a team's projects and tasks under `/app/`, with its own Node backend |

Every starter pins the tool versions this repository tests with and installs its dependencies unless given `--no-install`. `cd my-app && npm run dev` starts it.
