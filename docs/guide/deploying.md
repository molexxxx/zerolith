---
title: Building and serving
description: "What zerolith build writes and how to serve it: static hosts, web servers, a backend's own static files, a path under a domain, caching, and a backend next to the dev server."
order: 13
group: Tooling
---

# Building and serving

`zerolith build` writes the application into `dist/` as static files, so it runs on any host and next to any backend. Serving it well comes down to three rules:

| Request | Answer |
| --- | --- |
| A file that exists in `dist/` | The file, with its media type |
| Any other path in the application, such as `/notes/7` | `index.html`, so the router renders the route |
| A file under `assets/` | Cached for a year: `Cache-Control: public, max-age=31536000, immutable` |
| `index.html` and the other files | `Cache-Control: no-cache`, so a new build is picked up at once |

Every file under `assets/` has a content hash in its name, so a changed file gets a new name and the old one can be cached forever. `index.html` keeps its name, so it has to be checked on every visit. A missing file with an extension, such as `/assets/old.js`, should get a 404 rather than `index.html`, so a stale script fails clearly instead of being parsed as HTML.

## What the build writes

| Path | What it is |
| --- | --- |
| `index.html` | The page, loading the hashed script and stylesheet and preloading the chunks they import |
| `assets/index-<hash>.js` | The application and its packages, minified, with a chunk of its own for each lazy route and compiled locale |
| `assets/index-<hash>.css` | Every stylesheet the page links and the modules import, combined and minified |
| `assets/<name>-<hash>.<ext>` | Images, fonts, and other files the code or the stylesheets reference |
| Everything from `public/` | Copied as it is, at the same paths |

The [command line guide](/guide/command-line/) describes the build's options; `zerolith preview` serves `dist/` as a host would, which is the quickest check before deploying.

## A path under the domain

An application served under a path, such as `https://example.com/app/`, names the path once, in `zerolith.json` next to `index.html`:

```json
{
    "base": "/app/"
}
```

`zerolith build` then writes every URL under `/app/`, such as `/app/assets/index-<hash>.js`, and `zerolith dev` and `zerolith preview` serve the application there too, redirecting the site root to it. The router follows the same base when it is given `import.meta.env.BASE_URL`, as every starter does, so its links and its matching agree with the build:

```ts
export const router = createRouter(routes, { base: import.meta.env.BASE_URL });
```

`--base /app/` sets the base for one command instead. `--base ./` makes the build's URLs relative to the page, for a page opened from disk or embedded at a path that is not known in advance. The router cannot know that path, so such a page should not rely on client-side routes.

## A backend next to the dev server

While developing, the application and its backend usually run as two servers, such as `zerolith dev` on port 8080 and an API on port 3000. The proxy in `zerolith.json` forwards the backend's paths to it, so the page calls the API on its own origin, with no CORS to configure, and cookies behave as they will in production:

```json
{
    "proxy": {
        "/api": "http://127.0.0.1:3000",
        "/auth": { "target": "http://127.0.0.1:4000", "stripPrefix": true }
    }
}
```

A request whose path starts with a prefix goes to that backend with its path and query, the longest prefix first; `stripPrefix` removes the prefix, so `/auth/login` reaches the second backend as `/login`. Request and response bodies stream through, server-sent events included, and WebSocket connections are joined end to end. The backend receives its own address as `Host`, with the original request in `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Forwarded-For`, and a redirect it sends to its own address comes back as a path on the dev server. When the backend is down, the request answers 502 and the terminal says why. `zerolith preview` forwards the same paths, and `--proxy /api=http://127.0.0.1:3000` adds a path for one run. The proxy forwards to `http://` addresses only for now.

The [fullstack example](https://github.com/molexxxx/zerolith/tree/main/examples/fullstack) runs this setup end to end: a Node backend with an API under `/api`, and the application under `/app/`.

## Served by a backend

A backend that already runs in production can serve the build from its static file handler, which keeps the application and its API on one origin. Build into the backend's folder with `"build": { "out": "../server/public" }` in `zerolith.json`, or copy `dist/` there as a deploy step, and apply the three rules. In plain Node, with the application under `/app/`:

@include examples/fullstack/server.ts#static

The same rules in Express 5, where a wildcard needs a name:

```js
import { extname, sep } from "node:path";
import express from "express";

const app = express();
app.use("/app", express.static("dist", {
    setHeaders(response, path)
    {
        response.setHeader("cache-control", path.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache");
    }
}));
app.get("/app/{*route}", (request, response, next) =>
{
    if (extname(request.path) !== "")
    {
        next();
        return;
    }
    response.set("cache-control", "no-cache").sendFile("index.html", { root: "dist" });
});
```

And in ASP.NET Core, with the build in `wwwroot/app/`. `MapFallbackToFile` matches only paths that name no file, so a missing asset still answers 404:

```csharp
var files = new StaticFileOptions
{
    OnPrepareResponse = context =>
    {
        var immutable = context.Context.Request.Path.StartsWithSegments("/app/assets");
        context.Context.Response.Headers.CacheControl = immutable ? "public, max-age=31536000, immutable" : "no-cache";
    }
};
app.UseStaticFiles(files);
app.MapFallbackToFile("/app/{*path:nonfile}", "app/index.html", files);
```

Any other backend applies the same three rules with its own static file handler and a catch-all route for the application's paths.

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
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
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
        <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAge="365.00:00:00" cacheControlCustom="immutable" />
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

zerolith needs neither `unsafe-eval` nor inline scripts, so a strict policy such as `Content-Security-Policy: default-src 'self'` works with a built application; add the origins of any API on another domain to `connect-src`. Components' scoped styles are constructed stylesheets, which the policy's `style-src` does not restrict, while an inline `<style>` element is blocked. A server-rendered page that writes `renderStyles()` into its head adds `<style>` elements, which need a nonce or `'unsafe-inline'` in `style-src`.

## Unbundled output

`zerolith build --unbundled` writes the modules as they are, with the packages in `vendor/` behind an import map with integrity hashes. The same routing rule applies, but no file has a content hash in its name, so every file should be served with `no-cache`, and the integrity hashes catch a stale file that slips through. The unbundled output is served from the root; a base path needs the bundled build.
