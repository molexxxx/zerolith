---
title: Building and serving
description: "What zerolith build writes and how to serve it: a bundle or the modules behind an import map, static hosts, web servers, a backend's own static files, a path under a domain, caching, and a backend next to the dev server."
order: 13
group: Tooling
---

# Building and serving

`zerolith build` writes the application into `dist/` as static files, so it runs on any host and next to any backend. Serving it well comes down to two rules, one for routing and one for caching:

| Request | Answer |
| --- | --- |
| A file that exists in `dist/` | The file, with its media type |
| Any other path in the application, such as `/notes/7` | `index.html`, so the router renders the route |

| File | Cache |
| --- | --- |
| A file under `assets/` | Cached for a year: `Cache-Control: public, max-age=31536000, immutable` |
| `index.html` and the other files | `Cache-Control: no-cache`, so a new build is picked up at once |

Every file under `assets/` has a content hash in its name, so a changed file gets a new name and the old one can be cached forever. `index.html` keeps its name, so it has to be checked on every visit.

> [!WARNING]
> A missing script or stylesheet, such as `/assets/old.js`, should get a 404 rather than `index.html`, so a stale script fails clearly instead of being parsed as HTML. A page the browser loads should get `index.html` whatever its last segment holds, since a route such as `/releases/2.3.0` has a dot in it. `zerolith dev` and `zerolith preview` tell the two apart by the request's `Accept` header, which names HTML when the browser loads a page.

## What the build writes

| Path | What it is |
| --- | --- |
| `index.html` | The page, loading the hashed script and stylesheet and preloading the chunks they import |
| `assets/index-<hash>.js` | The application and its packages, minified, with a chunk of its own for each lazy route and compiled locale |
| `assets/index-<hash>.css` | Every stylesheet the page links and the modules import, combined and minified |
| `assets/<name>-<hash>.<ext>` | Images, fonts, and other files the code or the stylesheets reference |
| Everything from `public/` | Copied as it is, at the same paths |

A widget for other sites' pages is one script with a name that stays the same, which [`zerolith build --entry`](command-line.md#one-script) writes instead of all of this. An application can also ship with no bundle at all, as its own modules behind an import map, which [Unbundled output](#unbundled-output) covers next.

The [command line guide](command-line.md) describes the build's options; `zerolith preview` serves `dist/` as a host would, which is the quickest check before deploying.

## Unbundled output

`zerolith build --unbundled` writes the application without bundling it. Every module in the project becomes one JavaScript file that the browser loads as it is, the zerolith packages are copied in beside them, and each page gets an import map that tells the browser where everything lives. One command sets all of it up, with no map to write by hand and nothing to configure:

```sh
zerolith build --unbundled
zerolith preview
```

A project started with `zerolith new my-app --buildless` runs the first as `npm run build`. Any project on the zerolith command line can build either way from the same source: `zerolith dev` is the same for both, and only the production output differs.

There are three reasons to choose it. The browser runs the files you wrote, one for one, so what you read in its developer tools is your own module and not a chunk. A deployment makes the browser download only the modules that changed. And the output stays correct on a host whose cache time you cannot set.

### What an import map is

A browser can load `import { Layout } from "./components/layout.js"` on its own, because that name is an address. It cannot load `import { html } from "zerolith"`, because `zerolith` is the name of a package, and resolving such names is the first thing a bundler does. An import map does the same job in the browser: it is a block of JSON in the page that gives each name its address.

```html
<script type="importmap">
{
    "imports": {
        "zerolith": "/vendor/zerolith@1.10.0/dist/production/index.js"
    }
}
</script>
```

With that in the page, `import { html } from "zerolith"` loads the file the map names, and the source runs as written. Import maps work in every [browser zerolith supports](https://github.com/molexxxx/zerolith/blob/main/docs/policy/support.md). You do not write this map: the build writes it into every page.

### What it writes

This is the starter that `zerolith new my-app --buildless` writes, built:

```tree
dist/
    index.html                      the page, with the import map and preloads
    favicon.svg                     from public/
    data/packages.json              from public/
    src/
        main.js                     main.ts as JavaScript
        router.js
        routes.js
        styles.css
        components/
            counter.js              counter.tsx as JavaScript
            home.js
            layout.js
            not-found.js
            packages.js
    vendor/
        zerolith@1.10.0/            the core, each module minified on its own
        @zerolith/router@1.10.0/
        @zerolith/devtools@1.10.0/  the inspector's empty production entry
        importmap.json              the packages' entries of the import map
```

Each row below is something the build does so that the source needs no bundler:

| The build | So that |
| --- | --- |
| Turns each `.ts`, `.tsx`, `.jsx`, and `.mts` source into a `.js` file and points the imports and the page's script at it | TypeScript and JSX work unbundled, with one readable output file for each source file |
| Copies the zerolith packages the pages import into `vendor/`, each in a folder named for its version, minified one module at a time | The site serves its own copy of every package and depends on no CDN |
| Writes the import map into every page, nested ones such as `about/index.html` included | The browser finds every package and every module |
| Adds a `modulepreload` link for each module a page loads when it starts | The browser fetches them in parallel instead of finding them one import at a time |
| Prepares every `html` template, as the bundled build does | The browser binds templates without scanning them |
| Turns an import of a stylesheet, a JSON file, an image, or a file with `?scoped`, `?url`, or `?raw` into a small module beside the file | Those imports work as they do under `zerolith dev` |
| Replaces the `import.meta.env` values, and copies `public/` and the project's other files | The output is complete, and any static host serves it |

The package modules keep their source maps, except the few the template pass rewrites, so the browser's developer tools still show their source. The [command line guide](command-line.md#unbundled-output) lists every rule the build follows, such as the files it leaves out.

### The page it writes

The output's `index.html` is the project's page with an import map, preload links, and hashed addresses added. This is the starter's, shortened to a few entries and laid out for reading:

```html wide
<link rel="stylesheet" href="/src/styles.css?v=2d282cd7">
<script type="importmap">
{
    "imports": {
        "/src/main.js": "/src/main.js?v=53f57b50",
        "/src/router.js": "/src/router.js?v=bf67ff3b",
        "zerolith": "/vendor/zerolith@1.10.0/dist/production/index.js",
        "@zerolith/router": "/vendor/@zerolith/router@1.10.0/dist/production/index.js"
    },
    "integrity": {
        "/vendor/zerolith@1.10.0/dist/production/index.js": "sha256-IoFFNwGB7IgswZO1Md9q2lyir3nmFCIUv/VDYz3A7To="
    }
}
</script>
<link rel="modulepreload" href="/src/router.js?v=bf67ff3b" data-zerolith-preload>
<script type="module" src="/src/main.js?v=53f57b50"></script>
```

| Entry | What it does |
| --- | --- |
| `"zerolith"` | Gives a package name its address. The folder names the version, so a version's files never change |
| `"/src/router.js"` | Gives one of the project's own modules an address that carries a hash of its content. The modules still import each other as `./router.js`, and the map adds the hash when the browser resolves the import, so no file is rewritten |
| `"integrity"` | Holds the hash of each package module. The browser refuses to run a file that does not match, and each preload link of a package module carries the same hash |

`data-zerolith-preload` marks the links the command line wrote, so the next run replaces them and leaves the page's own links alone.

### Caching

Those addresses make the output safe to cache anywhere. A module that changes gets a new address, and a module that does not change keeps its address and stays in the browser's cache:

| File | Address | When it changes |
| --- | --- | --- |
| A package module | `/vendor/zerolith@1.10.0/...` | Never; a new version of the package gets a new folder |
| A module of the project, or a stylesheet the page links | `/src/main.js?v=53f57b50` | The hash changes, and the address with it |
| A file a module refers to, such as an image or a stylesheet it imports | `/src/logo.svg` | In place, at the same address; only the bundled build gives these a hash |
| `index.html` | `/` | With every build |

A browser therefore never runs an old copy of one module beside a new copy of another, and nothing has to be served with `no-cache` for the modules to stay current. That suits a host that sets its own cache time, such as GitHub Pages. On a server you control, `index.html` keeps the rule from the top of this page, `no-cache`, so a new build is picked up at once.

### Content-Security-Policy

The import map is an inline script, and a strict policy such as `default-src 'self'` blocks inline scripts. With the map blocked the browser cannot resolve `zerolith`, and the page loads no module. Allow the map by its hash, which the build prints:

```text wide
  Policy    'sha256-mzY++jR4h1KDxAS5CJLXwqe2kBDv3avFEn8t3IH0dRE=' in script-src allows the import map; it changes with the modules
```

The header that allows it:

```http wide
Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-mzY++jR4h1KDxAS5CJLXwqe2kBDv3avFEn8t3IH0dRE='
```

A site with several pages gets one line for each map that differs, with the pages it belongs to.

> [!IMPORTANT]
> The map names each module's address, so its text, and with it the hash, changes with most builds. A policy that names the hash has to take it from each build's output. A server that writes a nonce into the script element and into the policy can allow the map that way instead. The bundled build has no inline script, so its policy never changes.

### Other packages

The build vendors the zerolith packages and no others. A package from elsewhere needs two things: an install with npm, so `zerolith dev`, the editor, and the tests find it in `node_modules`, and an address in an import map of your own in the project's `index.html`, before the module script, so the browser finds it in production:

```html
<script type="importmap">
{
    "imports": {
        "nanoid": "/lib/nanoid.js"
    }
}
</script>
<script type="module" src="/src/main.ts"></script>
```

The address is a copy of the package's ES module kept in the project, as here, or a CDN address that names an exact version. Put the version in a copy's name, as the build does under `vendor/`, so an upgrade gets a new address. The build keeps your entries and adds its own, and it warns of an import that no entry covers:

```text wide
  warning   src/main.ts imports nanoid, which no import map entry covers, so the browser cannot load it: install it if it is a zerolith package, or map it in the page's <script type="importmap">
```

> [!IMPORTANT]
> `zerolith dev` loads the package from `node_modules` and never reads your entry, so the address in the map is first used by a build. Keep the copy at the version `package.json` installs, and run `zerolith build --unbundled`, then `zerolith preview`, before you deploy: the preview loads the page through the entry itself, where a wrong address shows.

`@zerolith/otel` needs the same, since it imports `@opentelemetry/api`: map both. An application with many such packages is simpler bundled, where `zerolith build` resolves all of them from `node_modules`.

### A page with no build command

Some pages have no build to run: a page that a backend's template or a static site generator writes, or a folder of plain JavaScript deployed as it is. `zerolith importmap` does the import map part on its own, in place:

```sh
zerolith importmap --html index.html
```

It copies the zerolith packages the page imports into `vendor/` beside the page and writes the import map and the preload links into the page, so any static server runs the folder with nothing else done to it. Commit `vendor/` with the page, and run the command again after upgrading a package. `zerolith doctor` reports a vendored package that is behind the installed one and a file that no longer matches its hash.

The page's modules have to be ones a browser runs as written: JavaScript with `html` templates and relative imports that name their files. What the build would have handled is out: TypeScript, JSX, `import.meta.env`, and imports of stylesheets or JSON. The [command line guide](command-line.md#importmap) covers the command.

### Choosing between the two

Both outputs come from the same source, so the choice is one word in the project's `build` script and can change at any time.

| | `zerolith build` | `zerolith build --unbundled` |
| --- | --- | --- |
| What the browser loads | A few minified files; the starter's first load is 4 requests | One file for each module, fetched in parallel; the starter's first load is 30 requests |
| The project's own code | Minified, tree-shaken, and merged into chunks | Readable, one file for each source file |
| After a deployment | The browser downloads the chunks that changed | The browser downloads the modules that changed |
| Caching | By file name: `assets/` for a year, `index.html` checked on every visit | By address: correct under whatever cache time the host sets |
| Other packages | Resolved from `node_modules` | Each needs an entry in the page's import map |
| A path under the domain | `base` in `zerolith.json` | The output is served from the root; an application under a path needs the bundled build |
| Content-Security-Policy | `default-src 'self'`, the same for every build | The import map's hash or a nonce in `script-src`, new with most builds |

Serve the unbundled output over HTTP/2 or HTTP/3, as static hosts and CDNs do. Its many small requests share one connection there, while over HTTP/1.1 a browser opens only a few connections to a server and the modules wait their turn. The routing rule at the top of this page applies to both outputs.

## A path under the domain

An application served under a path, such as `https://example.com/app/`, names the path once, in `zerolith.json` next to `index.html`:

```json
{
    "base": "/app/"
}
```

`zerolith build` then writes every URL under `/app/`, such as `/app/assets/index-<hash>.js`, and `zerolith dev` and `zerolith preview` serve the application there too, redirecting the site root to it. The router follows the same base when it is given `import.meta.env.BASE_URL`, as every starter does, so its links and its matching agree with the build:

```ts
export const router = createRouter(() => routes, {
    base: import.meta.env.BASE_URL
});
```

`--base /app/` sets the base for one command instead. `--base ./` makes the build's URLs relative to the page, for a page opened from disk or embedded at a path that is not known in advance. The router cannot know that path, so such a page should not rely on client-side routes.

## A backend next to the dev server

While developing, the application and its backend usually run as two servers, such as `zerolith dev` on port 8080 and an API on port 3000. The proxy in `zerolith.json` forwards the backend's paths to it, so the page calls the API on its own origin, with no CORS to configure, and cookies behave as they will in production:

```json
{
    "proxy": {
        "/api": { "target": "http://127.0.0.1:3000", "run": "npm run api" },
        "/auth": { "target": "http://127.0.0.1:4000", "stripPrefix": true }
    }
}
```

A request whose path starts with a prefix goes to that backend with its path and query, the longest prefix first; `stripPrefix` removes the prefix, so `/auth/login` reaches the second backend as `/login`. Request and response bodies stream through, server-sent events included, and WebSocket connections are joined end to end. The backend receives its own address as `Host`, with the original request in `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Forwarded-For`, and a redirect it sends to its own address comes back as a path on the dev server. When the backend is down, the request answers 502 and the terminal says why. `zerolith preview` forwards the same paths, and `--proxy /api=http://127.0.0.1:3000` adds a path for one run. The proxy forwards to `http://` addresses only for now.

`run` names the command that starts a backend, `npm run api` here: `zerolith dev` runs it in the project folder through the shell when it starts, shows its output in the same terminal, and stops it with every process it started when the server stops, so one command runs an app and its backend; `serve` and `preview` do the same. The same command under several prefixes starts once, and `--no-backends` leaves every backend to you, as when one runs under a debugger. Until the backend listens, a request to its path gets a 502 that says it is out of reach, and a backend that ends on its own is reported under the banner. On Unix a terminal that closes stops the server and its backends as Ctrl+C does.

The [fullstack example](https://github.com/molexxxx/zerolith/tree/main/examples/fullstack) runs this setup end to end: Harbor, an application under `/app/` with a Node backend that answers its API under `/api`, with a session cookie and a live stream of server-sent events, both through the proxy. `zerolith new my-app --example fullstack` starts a project of your own from it.

## Served by a backend

A backend that already runs in production can serve the build from its static file handler, which keeps the application and its API on one origin. Build into the backend's folder with `"build": { "out": "../server/public" }` in `zerolith.json`, or copy `dist/` there as a deploy step, and apply the same rules. With the application under `/app/`, as a function from `Request` to `Response` that Node, Deno, Bun, or a worker can run:

@include examples/fullstack/server/static.ts#static

The same rules in Express 5, where a wildcard needs a name:

```js
import { extname, sep } from "node:path";
import express from "express";

const forever = "public, max-age=31536000, immutable";
const app = express();
app.use("/app", express.static("dist", {
    setHeaders(response, path)
    {
        const hashed = path.includes(`${sep}assets${sep}`);
        response.setHeader("cache-control", hashed ? forever : "no-cache");
    }
}));
app.get("/app/{*route}", (request, response, next) =>
{
    if (extname(request.path) !== "")
    {
        next();
        return;
    }
    response.set("cache-control", "no-cache");
    response.sendFile("index.html", { root: "dist" });
});
```

And in ASP.NET Core, with the build in `wwwroot/app/`. `MapFallbackToFile` matches only paths that name no file, so a missing asset still answers 404:

```csharp
const string Forever = "public, max-age=31536000, immutable";

var files = new StaticFileOptions
{
    OnPrepareResponse = context =>
    {
        var http = context.Context;
        var hashed = http.Request.Path.StartsWithSegments("/app/assets");
        http.Response.Headers.CacheControl = hashed ? Forever : "no-cache";
    }
};
app.UseStaticFiles(files);
app.MapFallbackToFile("/app/{*path:nonfile}", "app/index.html", files);
```

Any other backend applies the same rules with its own static file handler and a catch-all route for the application's paths.

## Web servers

nginx, with the build in `/srv/my-app/dist`:

```
server {
    listen 80;
    root /srv/my-app/dist;

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    location / {
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /index.html;
    }
}
```

An API behind the same server is one more block, such as `location /api/ { proxy_pass http://127.0.0.1:3000; }`.

IIS, with the URL Rewrite module installed and this `web.config` in `public/`, so the build copies it next to `index.html`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <staticContent>
      <clientCache cacheControlMode="DisableCache" />
    </staticContent>
    <rewrite>
      <rules>
        <rule name="Application routes" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory"
              negate="true" />
            <add input="{URL}" pattern="^/assets/" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
  <location path="assets">
    <system.webServer>
      <staticContent>
        <clientCache cacheControlMode="UseMaxAge"
          cacheControlMaxAge="365.00:00:00" cacheControlCustom="immutable" />
      </staticContent>
    </system.webServer>
  </location>
</configuration>
```

## Static hosts

A static host serves the files and needs one setting for the routes. A file the host reads from the deployed site, such as `_redirects`, goes in `public/`, so the build copies it to the root of `dist/`.

| Host | Routes |
| --- | --- |
| Netlify | `public/_redirects` with the line `/*  /index.html  200`; a file that exists is still served as it is |
| Vercel | `vercel.json` at the project root, not in `public/`, with `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`; files take precedence over rewrites |
| Cloudflare Pages | Nothing: without a `404.html`, Pages serves the root for any path that names no file. Headers go in `public/_headers` |
| GitHub Pages | Copy `index.html` to `404.html` after the build, since Pages shows `404.html` for any page that does not exist. A project site lives under `/<repository>/`, which is its base |
| A storage bucket behind a CDN | `index.html` as both the index document and the error document |

## Compression and security headers

Hosts and CDNs compress text on the fly; a server of your own should enable gzip or Brotli for scripts, stylesheets, HTML, JSON, and SVG. The build prints each file's gzip size, which is close to what is sent.

zerolith needs neither `unsafe-eval` nor inline scripts, so a strict policy such as `Content-Security-Policy: default-src 'self'` works with a built application; add the origins of any API on another domain to `connect-src`. Components' scoped styles are constructed stylesheets, which the policy's `style-src` does not restrict, while an inline `<style>` element is blocked.

> [!NOTE]
> A server-rendered page that writes `renderStyles()` into its head adds `<style>` elements, which need a nonce or `'unsafe-inline'` in `style-src`.

The unbundled output adds one inline script, its import map, which the policy has to allow by a hash or a nonce, as [Content-Security-Policy](#content-security-policy) above describes.

## First paint

A page that renders its application in the browser paints its static shell first, then the application replaces it, which moves the layout, and a page that does this on every load scores a layout shift every time. `blocking="render"` on the entry module script, which must be in the document's head to block anything, holds the first paint until the module ran, so the page paints once, with the application in it:

```html
<script type="module" src="/src/main.js" blocking="render"></script>
```

Chrome and Edge from 105 and Safari from 18.2 honor the attribute; Firefox did not at the time of writing, and a browser that does not know it ignores it and paints the shell as before, so nothing breaks. The wait is the time the module and its imports take to load and run, which the preload links that `zerolith build`, its `--unbundled` output, and `zerolith importmap --html` write keep to one round trip. A page the server renders needs none of this, since its first paint already holds the application.
