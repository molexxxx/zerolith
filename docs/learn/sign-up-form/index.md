---
title: Sign-up form
description: "A zerolith tutorial: build a sign-up page from a native form, with rules shared with the server, field errors from RFC 9457 problem details, pending state, focus, and announcements."
order: 2
---

# Build a sign-up form

You'll build the sign-up page for a small notes service. It has a name, an email address, a password, a plan, and a box to accept the terms. The page:

- checks what you type and shows a message next to each field
- sends the form without leaving the page
- shows the server's errors next to the right field

## What you need

- Node 22.18 or newer.
- The [packing list](../packing-list/index.md) tutorial, or the same ideas: signals, `computed`, `html` templates, events, and components.

You don't need a backend. The tutorial gives you a small Node server and a written description of what it accepts and answers, so you could swap in a server written in any language.

## Start a project

```sh
npx @zerolith/cli new sign-up --template ts --yes
cd sign-up
npm run dev
```

If `npx` asks to download the command line, answer `y`. Leave the server running. The packing list explains [what the starter wrote](../packing-list/index.md#what-the-starter-wrote).

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
> Every zerolith error links to a page with the fix. The [forms guide](../../guide/forms.md) covers `@zerolith/forms` in full.
