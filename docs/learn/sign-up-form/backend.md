---
title: A backend to send to
description: Write down the request and the responses as a contract any server can follow, run a small Node script that follows it, and forward /api to it from the dev server.
order: 4
---

# A backend to send to

The form needs a server to send to. It doesn't matter what language the server is written in. The page talks plain HTTP, so any server that answers one request the way this page describes will work.

You'll write that description first. Then a small Node server follows it, so you can keep going. Later, a server in any other language can take its place without changing the page.

## The contract

A **contract** is a written description of a request and every answer it can get. The form sends what a browser sends for any HTML form, plus one header that asks for JSON back:

```http wide
POST /api/sign-ups HTTP/1.1
Content-Type: application/x-www-form-urlencoded
Accept: application/json, application/problem+json

name=Grace+Hopper&email=grace%40example.com&password=compilers-in-1952&plan=team&terms=accepted
```

| Field | Holds |
| --- | --- |
| `name` | Text that isn't blank |
| `email` | An address shaped like `name@example.com` |
| `password` | At least 15 characters, without the email address in it |
| `plan` | `free`, `plus`, or `team` |
| `terms` | `accepted`, or missing when the box isn't checked |

There are three possible answers.

**The account was created.** The status is `201 Created`, and the body is the new account as JSON, without the password:

```json
{
    "id": 2,
    "name": "Grace Hopper",
    "email": "grace@example.com",
    "plan": "team"
}
```

**A field breaks a rule.** The status is `400 Bad Request`. The body is a **problem details** document, a standard JSON format for errors from [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457). zerolith adds one thing to it, `fields`: each field's name with its messages. The form shows each message next to its field:

```json
{
    "type": "about:blank",
    "title": "The submission has invalid fields",
    "status": 400,
    "fields": {
        "email": ["Enter an email address like name@example.com."],
        "password": ["Use at least 15 characters."]
    }
}
```

**The email address already has an account.** The status is `409 Conflict`, in the same format. This is the one rule the page can't check by itself. The page doesn't need anything else to show the message next to Email:

```json
{
    "type": "about:blank",
    "title": "Conflict",
    "status": 409,
    "fields": { "email": ["This email address already has an account."] }
}
```

That's the whole contract. A server in another language reads the form, checks the same rules, and writes this JSON. It doesn't need anything from zerolith. The rules would then be written twice, once for the page and once for the server, but the page always shows whatever messages the server sends.

> [!NOTE]
> A `409` tells anyone who tries an address that it has an account. A service that must keep that private answers every sign-up the same way and sends an email to the address instead.

## The server

Node 24 can run TypeScript files directly, with no build step. Install Node's types, so your editor and the type checker know about `node:http`:

```sh
npm install --save-dev @types/node
```

Then add `server` to the `include` list in `tsconfig.json`, so `npm run typecheck` checks the server too:

```json
"include": ["src", "test", "server", "vitest.config.ts"]
```

The sign-up endpoint is one function that takes a `Request` and returns a `Response`. Deno, Bun, and edge workers can run a function like that directly. Create `server/sign-ups.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/app/server/sign-ups.ts

This server is TypeScript too, so it imports the page's `src/schema.ts` and checks the exact same rules.

- `validateForm` checks the form data and returns either the clean values or a problem.
- `problemResponse` turns a problem into a response with the right status.

The accounts are kept in memory and disappear when the server restarts. It starts with one account, for `ada@example.com`, so you can see the `409` without signing up twice. It compares email addresses in lowercase, and it never keeps the password. A real server would store a slow hash of the password, made with Argon2 or scrypt, and never the password itself.

Node's own HTTP server doesn't use `Request` and `Response`, so a second file converts between them. Create `server/main.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/app/server/main.ts

- It listens on port 3000, unless `PORT` says otherwise.
- It listens on `127.0.0.1`, so only your own computer can reach it.
- If something goes wrong, such as a request it can't read or an error in the endpoint, it prints the error, answers `500`, and keeps running.

## Run it with the dev server

Add a script to `package.json`, next to the others:

```json
"api": "node --watch server/main.ts",
```

`--watch` restarts the server whenever you save one of its files. The dev server reloads the page too, as it does for any file you save.

Then replace `zerolith.json`:

@include packages/zerolith/test/fixtures/sign-up-form/app/zerolith.json

Now any request whose path starts with `/api` goes to your server. The page calls its own address, so there's no cross-site setup to do. `run` is the command that starts the server: `npm run dev` starts it for you, shows its output in the same terminal, and stops it when you stop the dev server.

The dev server reads `zerolith.json` when it starts. Stop it with Ctrl+C and run `npm run dev` again. The terminal now shows the line your server prints when it starts. The [building and serving guide](../../guide/deploying.md#a-backend-next-to-the-dev-server) covers more about the proxy.

## Try it

1. Fill in the form with `ada@example.com` and press **Create account**. The server's message appears under Email. You didn't change the page for this: `signUp.field("email")` shows a message whichever side found the problem.
2. Change one letter of the email. The message goes away, because the server said nothing about the new address. Change it back, and the message returns.
3. Sign up with any other address. The Network panel shows a `201` with the new account. The page doesn't do anything with it yet. That's the next step.

## What you learned

- The contract is plain HTTP: a form goes in, and JSON or a problem details document comes out.
- `fields` in a problem details document puts each message next to its field, whatever language the server is written in.
- `validateForm` and `problemResponse` check the same rules on a server that can import them.
- `proxy` sends a path to a backend, and `run` starts that backend with the dev server.
