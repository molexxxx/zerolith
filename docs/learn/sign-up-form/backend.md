---
title: A backend to send to
description: Write down the request and the responses as a contract any server can follow, run a small Node script that follows it, and forward /api to it from the dev server.
order: 4
---

# A backend to send to

The form needs a server to send to, and it does not care what that server is written in. It speaks plain HTTP, so all it needs is something that answers one request the way this page writes down. Start with that contract; then a small Node script follows it, so you can carry on. A server in any other language can replace the script later without a change to the page.

## The contract

The form sends what the browser would send for a native form, with one header added to ask for JSON:

```http wide
POST /api/sign-ups HTTP/1.1
Content-Type: application/x-www-form-urlencoded
Accept: application/json, application/problem+json

name=Grace+Hopper&email=grace%40example.com&password=compilers-in-1952&plan=team&terms=accepted
```

| Field | Holds |
| --- | --- |
| `name` | Text that is not blank |
| `email` | An address shaped like `name@example.com` |
| `password` | At least 15 characters, not containing the email address |
| `plan` | `free`, `plus`, or `team` |
| `terms` | `accepted`, and missing when the box is not checked |

There are three answers.

**The account was created.** The status is `201 Created`, the media type `application/json`, and the body the new account, without the password:

```json
{
    "id": 2,
    "name": "Grace Hopper",
    "email": "grace@example.com",
    "plan": "team"
}
```

**A field breaks a rule.** The status is `400 Bad Request`, the media type `application/problem+json`, and the body a problem details document, the format [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) defines. `fields` is the extension zerolith adds to it: a map from field name to that field's messages. The form shows each message next to the field it names:

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

**The email address has an account.** The status is `409 Conflict`, with the same media type and the same shape. This is the one rule the page cannot check for itself, and the page needs nothing more than this document to show it next to Email:

```json
{
    "type": "about:blank",
    "title": "Conflict",
    "status": 409,
    "fields": { "email": ["This email address already has an account."] }
}
```

That is the whole contract. A server in another language reads a URL-encoded body, applies the same rules, and writes this JSON, with nothing from zerolith installed. The rules then exist twice, once for the page and once for the server, but the page shows whatever messages the server sends.

> [!NOTE]
> A `409` tells anyone who tries an address that it has an account. A service that must not reveal that answers every sign-up the same way and sends an email to the address instead.

## The script

Node 24 runs TypeScript files directly, with no build step. Install Node's types, so your editor and the type checker understand `node:http`:

```sh
npm install --save-dev @types/node
```

Then add `server` to the `include` list in `tsconfig.json`, so `npm run typecheck` checks the backend too: `"include": ["src", "test", "server", "vitest.config.ts"]`.

The endpoint itself is a function from a `Request` to a `Response`, the shape Deno, Bun, and workers run directly. Create `server/sign-ups.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/app/server/sign-ups.ts

This backend is TypeScript too, so it imports the page's `src/schema.ts` and applies the very same rules. `validateForm` runs the schema on the form data and returns the value or a problem, and `problemResponse` writes a problem with the right status and media type.

The accounts live in memory and disappear when the script restarts. It starts with one, for `ada@example.com`, so you can see the `409` without signing up twice, and it compares addresses in lowercase. It never keeps the password. A real backend keeps a slow hash of it, such as Argon2 or scrypt, and never the password itself.

Node's own HTTP server has objects of its own rather than `Request` and `Response`, so a second file converts between them. Create `server/main.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/app/server/main.ts

It listens on port 3000 unless `PORT` says otherwise, on `127.0.0.1`, so only your own machine can reach it. A request the `Request` class cannot represent, such as one with the `TRACE` method, or an error the endpoint throws, is written to the terminal and answered with `500`, and the process keeps running.

## Run it with the dev server

Add a script to `package.json`, next to the others: `"api": "node --watch server/main.ts",`. `--watch` restarts the backend whenever you save one of its files, and the dev server reloads the page, as it does for any file you save.

Then replace `zerolith.json`:

@include packages/zerolith/test/fixtures/sign-up-form/app/zerolith.json

A request whose path starts with `/api` now goes to the backend, with its path and query, so the page calls its own origin and there is no cross-origin setup to do. `run` names the command that starts the backend: `zerolith dev` runs it, shows its output in the same terminal, and stops it when it stops itself.

The dev server reads `zerolith.json` when it starts, so stop it with Ctrl+C and run `npm run dev` again. The terminal now shows the line `server/main.ts` prints. The [building and serving guide](../../guide/deploying.md#a-backend-next-to-the-dev-server) covers the rest of the proxy.

## Try it

Fill in the form with `ada@example.com` and press Create account. The server's message appears under Email, with no change to the page: `signUp.field("email")` follows the problem whichever side found it. Change one letter of the address and the message goes, because the server said nothing about the new address; change it back and the message returns.

Sign up with any other address, and the Network panel shows a `201` with the new account as its body. The page does nothing with it yet, which is the next step.

## What you learned

- The contract is plain HTTP: a URL-encoded form in, and JSON or a problem details document out.
- `fields` in a problem details document puts each message next to its field, whichever server sends it.
- `validateForm` and `problemResponse` run the same schema on a server that can import it.
- `proxy` forwards a path to a backend, and `run` starts that backend with the dev server.
