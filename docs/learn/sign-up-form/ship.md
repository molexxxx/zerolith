---
title: Build and ship
description: Build the sign-up page for production, check it with its backend locally, and decide where the backend goes.
order: 8
---

# Build and ship

The page is done. Now turn it into files a website can serve, and give those files a server to talk to.

## Build

```sh
npm run build
```

`zerolith build` packs the app and the packages it uses into `dist/`. Your `server/` folder isn't part of it, because nothing in the page imports it. The page does import `src/schema.ts`, but only the rules come along, which is all the browser needs.

## Check it

```sh
npm run preview
```

`zerolith preview` serves `dist/` the way a website host would. It also reads the `proxy` setting from `zerolith.json`. So it starts your server with the same `run` command, or uses the one `npm run dev` already started, and sends `/api` to it.

Open the address it prints and sign up again. Then sign up a second time with the same address to see the server's message.

## Ship it

Any static host or web server can serve `dist/`. The one part that depends on your setup is `/api`.

The proxy in `zerolith.json` only works with `zerolith dev` and `zerolith preview`. A host doesn't know about it. The form sends to `/api/sign-ups` on the page's own address, so the server has to answer there. There are two common ways:

- A web server such as nginx serves `dist/` and forwards `/api` to your server.
- Your server serves `dist/` itself, along with the API.

[Building and serving](../../guide/deploying.md) has the setup for each, from nginx to Express and ASP.NET Core. It also covers caching, and the one setting every host needs.

`server/main.ts` stays behind. It keeps accounts in memory, and it's only there so the page has something to talk to while you build it. A real server answers the same contract from the [backend step](backend.md), in any language, and also does what a sign-up needs:

- keeps accounts in a database
- stores a slow hash of each password, never the password itself
- refuses common and leaked passwords
- limits how often one address or visitor can try
- sends an email to confirm the address

## Where to go next

You've built a form that checks what you type, sends without leaving the page, shows the server's messages next to the right fields, and works with the keyboard and with a screen reader. From here:

- The next tutorial, [a release notes reader](../release-notes/index.md), loads data, gives each release its own page, and keeps a search in the address.
- The [forms guide](../../guide/forms.md) covers the rest of `@zerolith/forms`, including forms that work before their script loads.
- The [accessibility guide](../../guide/accessibility.md) covers the rest of `@zerolith/a11y`, such as keeping the focus inside a dialog.
- The [fullstack example](https://github.com/molexxxx/zerolith/tree/main/examples/fullstack) puts a form like this one in a full app with sign-in and live updates. `npx @zerolith/cli new my-app --example fullstack` starts your own project from it.
- The [reference](https://zerolith.dev/reference/zerolith-forms/) lists everything `@zerolith/forms` exports.
