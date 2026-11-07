---
title: Build and ship
description: Build the sign-up page for production, check it with its backend locally, and decide where the backend goes.
order: 8
---

# Build and ship

The page is done. What is left is turning it into files a host can serve, and giving those files a backend to talk to.

## Build

```sh
npm run build
```

`zerolith build` bundles the application with the packages it imports and writes everything to `dist/`. Your `server/` folder is not part of it: nothing in the page imports `server/`, and the page's import of `src/schema.ts` carries only the rules, which is all the browser needs of them.

## Check it

```sh
npm run preview
```

`zerolith preview` serves `dist/` the way a static host does, including the fallback that sends a deep link such as `/sign-up` to `index.html`. It also reads the same `proxy` from `zerolith.json`, so it starts the backend with the same `run` command, or uses the one `npm run dev` already runs, and forwards `/api` to it. Open the address it prints and sign up once more, then sign up again with the same address to see the server's message.

## Ship it

`dist/` is static files, and any static host or web server can serve it. The one thing that depends on your setup is `/api`. The proxy in `zerolith.json` belongs to `zerolith dev` and `zerolith preview` alone, and a host knows nothing about it, while the form posts to `/api/sign-ups` on the page's own origin. So the backend has to answer on that origin:

- A web server in front of both, such as nginx, serves `dist/` and forwards `/api` to the backend.
- The backend serves `dist/` itself, from its own static file handler.

[Building and serving](../../guide/deploying.md) has the setup for each of these, from nginx to Express and ASP.NET Core, along with the caching rules and the fallback every host needs.

`server/main.ts` stays behind. It holds accounts in memory and is there to give the page something to talk to while you build it. What replaces it answers the contract from the [backend step](backend.md), whatever language it is written in, and does what a sign-up needs and this script does not: it keeps accounts in a database, stores a slow hash of each password, refuses passwords from a list of commonly used and leaked ones, limits how often one address or client can try, and sends a message that confirms the email address.

## Where to go next

You have built a form that checks what you type, sends with `fetch`, shows a server's messages next to its fields, and works from the keyboard and with a screen reader. From here:

- The [forms guide](../../guide/forms.md) covers the rest of `@zerolith/forms`: other encodings, redirects, and forms that work before their script loads.
- The [accessibility guide](../../guide/accessibility.md) covers the other primitives in `@zerolith/a11y`: focus traps, roving tabindex, and media query signals.
- The [fullstack example](https://github.com/molexxxx/zerolith/tree/main/examples/fullstack) puts a form like this one inside an application with sessions and live updates. `zerolith new my-app --example fullstack` starts a project of your own from it.
- The [reference](https://zerolith.dev/reference/zerolith-forms/) lists every export of `@zerolith/forms` with its documentation.
