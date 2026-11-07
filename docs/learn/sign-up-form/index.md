---
title: Build a sign-up form
description: "A zerolith tutorial: build a sign-up page from a native form, with rules shared with the server, field errors from RFC 9457 problem details, pending state, focus, and announcements."
order: 2
---

# Build a sign-up form

In this tutorial you build the sign-up page of a small fictional notes service: a name, an email address, a password with rules, a choice of plan, and a terms checkbox. The page checks what you type, sends the form to a server without leaving the page, shows each of the server's complaints next to the field it is about, and tells someone using a screen reader what happened. It is small enough to finish in an afternoon.

Each step adds one idea and explains why it works the way it does before showing the code. Every file a step shows is run by zerolith's own test suite, so what you type is what was tested.

## What you need

- Node 24 or newer. Check with `node --version`.
- A terminal and an editor. Any editor works; one that understands TypeScript helps.
- The ideas from [Build a packing list](../packing-list/index.md): signals, `computed`, `html` templates, `@` bindings, and components. This tutorial uses them without explaining them again.

You do not need a backend of your own. The tutorial gives you a small Node script and writes down exactly what it answers, so a server in any other language can take its place.

## Start a project

```sh
npx @zerolith/cli new sign-up --template ts --yes
cd sign-up
npm run dev
```

The first time, `npx` asks before it downloads the command line; answer `y`. Open the address `npm run dev` prints, http://127.0.0.1:8080/ unless that port is taken, and you see the starter's home page. Leave the server running; it reloads the page every time you save a file. The packing list's introduction describes [what the starter wrote](../packing-list/index.md#what-the-starter-wrote).

## The steps

1. [The form](form.md): a native form with a label for every field, and a route of its own.
2. [Rules on submit](rules.md): the rules in one module, and a message next to each field.
3. [Checking as you type](typing.md): a checklist for the password, and messages that follow your changes.
4. [A backend to send to](backend.md): the contract in plain HTTP, and a small server that follows it.
5. [Sending and the welcome](sending.md): the pending state, the success view, and a failure no field can show.
6. [Focus and announcements](focus.md): where focus goes after each outcome, and what is read aloud.
7. [Testing](testing.md): a test that fills in the form and answers it with the server's own code.
8. [Build and ship](ship.md): the production build, and where the backend goes.

> [!TIP]
> If you get stuck, every error zerolith reports carries a code and a link to a page that explains the cause and the fix, and the [forms guide](../../guide/forms.md) covers `@zerolith/forms` in full.
