---
title: Sign-up form
description: "A zerolith tutorial: build a sign-up page from a native form, with rules shared with the server, field errors from RFC 9457 problem details, pending state, focus, and announcements."
order: 2
---

# Build a sign-up form

You build the sign-up page of a small notes service: name, email, password, plan, and a terms checkbox. It checks what you type, sends the form without leaving the page, and shows the server's errors next to each field.

## What you need

- Node 24 or newer.
- The ideas from the [packing list](../packing-list/index.md): signals, `computed`, `html` templates, events, and components.

You do not need a backend. The tutorial gives you a small Node script and its contract, so a server in any language can replace it.

## Start a project

```sh
npx @zerolith/cli new sign-up --template ts --yes
cd sign-up
npm run dev
```

Answer `y` if `npx` asks to download the command line, and leave the server running. The packing list describes [what the starter wrote](../packing-list/index.md#what-the-starter-wrote).

## The steps

1. [The form](form.md): a native form with a label for every field, and a route of its own.
2. [Rules on submit](rules.md): the rules in one module, and a message next to each field.
3. [Checking as you type](typing.md): a checklist for the password, and messages that follow your changes.
4. [A backend to send to](backend.md): the contract in plain HTTP, and a small server that follows it.
5. [Send the form](sending.md): the pending state, the success view, and a failure no field can show.
6. [Focus and messages](focus.md): where focus goes after each outcome, and what is read aloud.
7. [Testing](testing.md): a test that fills in the form and answers it with the server's own code.
8. [Build and ship](ship.md): the production build, and where the backend goes.

> [!TIP]
> Every error zerolith reports links to a page with the fix, and the [forms guide](../../guide/forms.md) covers `@zerolith/forms` in full.
