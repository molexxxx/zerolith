# Fullstack example

A zerolith app with its own backend: a notes page under `/app/` that lists and adds notes through a JSON API under `/api`. It shows the two setups most projects with a backend use.

- **While developing**, the backend serves the API and `zerolith dev` serves the app, forwarding `/api` to the backend. The page calls `fetch("/api/notes")` on its own origin, so there is no CORS to configure.
- **In production**, the backend serves both: the API and the files `zerolith build` wrote, under `/app/`.

The backend is [server.ts](server.ts), plain Node with no dependencies. Any backend works the same way, and the [building and serving guide](../../docs/guide/deploying.md) has the setup for others, from Express and ASP.NET Core to nginx.

## Files

```
server.ts         the backend: the API, and the built app in production
zerolith.json     base /app/ and the proxy from /api to the backend
index.html        the page: the stylesheet and the entry module
src/main.ts       the entry: navigation and the current page
src/router.ts     the routes, under the base from zerolith.json
src/notes.ts      the notes page, which calls the API
test/             the setups below, driven in a browser
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

The first runs `node examples/fullstack/server.ts`, which serves the API at http://127.0.0.1:3001/api/notes. The second runs `zerolith dev examples/fullstack`:

```
 zerolith  dev server  v0.1.0-alpha.4, ready in 2 ms

  Local     http://127.0.0.1:8080/app/
  Root      C:\Users\you\zerolith\examples\fullstack
  Proxy     /api to http://127.0.0.1:3001
  Reload    on: edits reload the page, stylesheets update in place

  Press Ctrl+C to stop.
```

Open http://127.0.0.1:8080/, which redirects to `/app/`. The list comes from the backend through the proxy, and a note added in the form goes the same way. The router follows the base through `import.meta.env.BASE_URL`, so its links are `/app/` and `/app/about`, as they will be in production.

## Build

```
npm run fullstack:build
```

This runs `zerolith build examples/fullstack`, which takes the base from `zerolith.json`:

```
 zerolith  build  production, minified, base /app/

  examples/fullstack/dist/assets/index-CZU6WD9n.js   26.76 kB  gzip 9.43 kB
  examples/fullstack/dist/assets/index-bbdb118e.css   0.29 kB  gzip 0.19 kB
  examples/fullstack/dist/index.html                  0.35 kB  gzip 0.25 kB

  built fullstack into examples/fullstack/dist in 76 ms
```

Every URL in `dist/index.html` starts with `/app/`, such as `/app/assets/index-CZU6WD9n.js`.

## Serve

```
npm run fullstack:serve
```

This runs `node examples/fullstack/server.ts --production`, which serves the API and `dist/` from one server at http://127.0.0.1:3001/app/. The hashed files under `assets/` are cached for a year, and every other path under `/app/` gets `index.html`, uncached, so a route such as `/app/about` loads directly and a new build is picked up at once.

To check the build without the backend serving it, `zerolith preview examples/fullstack` serves `dist/` under the same base and forwards `/api` the same way, with the backend from `npm run fullstack:api` running.
