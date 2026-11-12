---
title: The contract
description: "Write down the request the widget sends and every answer it can get, errors included, as an OpenAPI document, generate types from it, and run an example handler while you develop."
order: 3
---

# The contract

The widget sends its answer to whatever address the site gives it. The server behind that address could be written in anything: Node, PHP, Go, C#, or a serverless function. The widget shouldn't care which.

Both sides need to agree on a **contract**: the request the widget sends, and every answer it can get back, errors included. Written down, anyone can build a server that follows it, and check that a server does.

## The contract

Create `openapi.json` in the project's root folder:

@include packages/zerolith/test/fixtures/widget/app/openapi.json

This is an [OpenAPI](https://spec.openapis.org/oas/v3.1.0) document, a JSON format that most server frameworks and API tools can read and write. It describes one operation, `sendFeedback`:

| Part | What the contract says |
| --- | --- |
| Request | `POST /feedback` under the address the site gives, with a JSON body |
| Success | `201`, with a receipt: `{ "id": "..." }` |
| Failure | `400` when the body isn't valid feedback, `429` when one sender sends too much, or any other status for anything else |

The request body has three parts:

- `helpful`: `true` or `false`.
- `page`: which page the feedback is about, up to 2000 characters.
- `comment`: optional, up to 1000 characters.

Every failure comes with a **problem details** document, a standard JSON format for errors from [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html):

- `title` says what went wrong in a few words.
- `detail` explains this case.
- `status` repeats the status code.
- `fields` lists messages for each part of the body that was refused. zerolith's packages read it.

The widget shows `detail`, or `title` if there's no detail, so the server's own words reach the reader.

A server ignores parts of the body it doesn't know. So a later version of the widget can send more without breaking a server built for this one.

## Types from the contract

`@zerolith/client` turns the contract into TypeScript. Install it:

```sh
npm install @zerolith/client
```

Then generate the file:

```sh
npx zerolith-client openapi.json --out src/api.ts
```

It writes `src/api.ts`:

@include packages/zerolith/test/fixtures/widget/app/src/api.ts wide

- `Feedback`, `Problem`, and `Receipt` are the contract's shapes as TypeScript types.
- `Api` lists the operation with its method, path, body, and answer.
- `routes` is what the client needs while the page runs.

Don't edit this file. Change `openapi.json` and run the command again. Any code that no longer matches the contract then fails the type check, `npx tsc`.

## An example server

The widget needs something to send to while you develop. Create `server/feedback.ts`:

@include packages/zerolith/test/fixtures/widget/app/server/feedback.ts

The handler is a function that takes a `Request` and returns a `Response`. Those are the browser's own types, so the same function runs on Deno, Bun, a Cloudflare worker, or Node, and a test can call it directly.

It checks each part of the body against the contract:

- If anything is wrong, it answers `400` with a message for each problem.
- Otherwise, it passes the feedback to `save`, keeping only the parts the contract names, and answers `201` with a new id.

Lengths are counted in characters, the way JSON Schema counts them, so an emoji such as 👍 counts as one, not two.

Every answer includes `access-control-allow-origin: *`, and an `OPTIONS` request gets the three headers CORS asks for. **CORS** is the browser's rule about requests between sites: a page on one site, such as a blog, can only read an answer from another site, such as your API, if that server allows it. Because the widget sends JSON, the browser first asks permission with an `OPTIONS` request, and only sends the real request if the answer allows it. `*` allows every site, which is fine for feedback, since the widget sends no cookies. A server that only takes feedback from its own sites would name them instead.

> [!NOTE]
> The example doesn't keep anything. `save` decides where feedback goes. A real server would also store it, limit how much one sender can send, answering `429` as the contract says, and cap the size of the body it reads.

Node's own HTTP server doesn't take a function like this directly, so `server/main.ts` connects the two. Create it:

@include packages/zerolith/test/fixtures/widget/app/server/main.ts

It turns each request Node receives into a `Request`, passes it to the handler, sends the `Response` back, and prints each piece of feedback it saves. Node 24 runs TypeScript files directly, so `node server/main.ts` starts it with no build step.

`npx tsc` checks `src`, `test`, and the Vitest config. To check the server too, install the types for Node's own modules:

```sh
npm install --save-dev @types/node
```

Then add `"server"` to `include` in `tsconfig.json`:

```json
"include": ["src", "test", "server", "vitest.config.ts"]
```

## Run it with the dev server

`npm run dev` can start the server and pass requests to it, so the page talks to it from its own address while you develop. Replace `zerolith.json`:

@include packages/zerolith/test/fixtures/widget/app/zerolith.json

A request whose path starts with `/api` goes to the server on port 3000, with `/api` taken off the front. So `/api/feedback` reaches it as `/feedback`. `run` is the command that starts the server: `npm run dev` now starts it too, shows its output in the same terminal, and stops it when you stop the dev server.

Stop the dev server with Ctrl+C and start it again. Its startup message now lists the proxy and the server, followed by the server's own line.

## What you learned

- The contract is the request and every answer, errors included, written as an OpenAPI document any server can follow.
- `zerolith-client` makes TypeScript types from it, so code that no longer matches the contract fails the type check.
- A handler written as a function from `Request` to `Response` runs anywhere, and in a test.
- A page on another site needs CORS answers, including the `OPTIONS` request a JSON post sends first.
- `proxy` in `zerolith.json` sends a path to a server, and `run` starts that server with the dev server.
