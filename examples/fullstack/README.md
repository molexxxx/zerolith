# Fullstack example

Harbor, where a small team keeps its projects and tasks: a zerolith app under `/app/` with its own backend, a JSON API under `/api`. A member signs in, sees the day's numbers and the team's activity live on the dashboard, starts projects, and moves tasks across a project's board. It is the example to read for how a larger zerolith application is put together, from the files it keeps to the way the app and the backend share their types.

The backend is plain Node with no dependencies, in [server/](server/), which Node 24 or newer runs as TypeScript with no build step. Any backend works the same way, and the [building and serving guide](../../docs/guide/deploying.md) has the setup for others, from Express and ASP.NET Core to nginx.

To start a project of your own from this example, without a clone of the repository, run `zerolith new my-app --example fullstack`. It writes these files with a `package.json`, a README, and an `AGENTS.md` of their own, and its `npm run api`, `npm run dev`, `npm run build`, and `npm start` do what the `fullstack` scripts below do here.

## What it shows

| Part | Where | What to look at |
| --- | --- | --- |
| Shared types and validation | `shared/` | One `Api` contract that the backend answers and the typed client calls, and Standard Schemas that the forms run in the browser and the API runs again |
| Sessions | `server/api.ts`, `src/store.ts`, `src/main.ts` | An HttpOnly cookie on the app's own origin, and the sign-in page shown until the backend knows the member |
| Forms | `src/components/sign-in.ts`, `projects.ts`, `project.ts` | Native forms sent with `@zerolith/forms`, with field errors from the shared schema or from the backend |
| Live updates | `server/events.ts`, `src/components/dashboard.ts` | Server-sent events, closed with the page through `onDispose`, and announced to screen readers |
| Routing | `src/routes.ts` | A loader, a title from the loaded data, and a page whose code loads on its first visit |
| Formatting | `src/locale.ts` | Relative times and numbers in the reader's format, through `Intl`, with nothing shipped |
| Tests | `test/` | The backend called as a function in Node, and the pages in Chromium |

## Files

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
test/                 the backend's tests, the pages', and the setups below in a browser
zerolith.json         the base, /app/, and the proxy from /api to the backend
index.html            the page: the stylesheet and the entry module
```

`zerolith.json` holds what `zerolith dev`, `build`, and `preview` share:

```json
{
    "base": "/app/",
    "proxy": {
        "/api": "http://127.0.0.1:3001"
    }
}
```

## Develop

From a clone of the repository, after `npm ci` and `npm run build`, start the backend in one terminal and the app in another:

```
npm run fullstack:api
npm run fullstack
```

The first runs the backend in watch mode, at http://127.0.0.1:3001/api/, and restarts it when a file under `server/` or `shared/` changes; its data lives in memory, so a restart starts it over. The second runs `zerolith dev examples/fullstack`, which serves the app at http://127.0.0.1:8080/app/ and forwards `/api` to the backend, so the page calls the API on its own origin, with no CORS to configure, and the session cookie works as it will in production.

Open http://127.0.0.1:8080/, which redirects to `/app/`, and sign in as `ada@harbor.test` with the password `analytical`. Open a second window as `grace@harbor.test`, password `compiler`, and what one member does appears on the other's dashboard as it happens.

## Build

```
npm run fullstack:build
```

This runs `zerolith build examples/fullstack`, which takes the base from `zerolith.json`:

```
 zerolith  build  production, minified, base /app/

  examples/fullstack/dist/assets/index-07c77de5.css    3.12 kB  gzip  1.17 kB
  examples/fullstack/dist/assets/index-Bn27o6Ds.js     6.32 kB  gzip  1.99 kB
  examples/fullstack/dist/assets/project-C8Q5WYwn.js   9.42 kB  gzip  3.00 kB
  examples/fullstack/dist/assets/router-B-pipaHX.js   53.28 kB  gzip 17.84 kB
  examples/fullstack/dist/index.html                   0.54 kB  gzip  0.34 kB

  built fullstack into examples/fullstack/dist in 35 ms
```

The project board is a chunk of its own, loaded the first time a member opens a project, with the rules of `project.css` inside it rather than in the page's stylesheet, and every URL in `dist/index.html` starts with `/app/`.

## Serve

```
npm run fullstack:serve
```

This runs `node examples/fullstack/server/main.ts --production`, which serves the API and `dist/` from one server at http://127.0.0.1:3001/app/. The hashed files under `assets/` are cached for a year, and every other path under `/app/` gets `index.html`, uncached, so a route such as `/app/projects/1` loads directly and a new build is picked up at once.

To check the build without the backend serving it, `zerolith preview examples/fullstack` serves `dist/` under the same base and forwards `/api` the same way, with the backend from `npm run fullstack:api` running.
