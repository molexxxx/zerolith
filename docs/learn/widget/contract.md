---
title: The contract
description: "Write down the request the widget sends and every answer it can get, errors included, as an OpenAPI document, generate types from it, and run an example handler while you develop."
order: 3
---

# The contract

The widget will post to whatever address the host page gives it, and the server behind that address could be written in anything: Node, PHP, Go, C#, or a serverless function. The widget should not care which. What both sides need is a contract: the request the widget sends and every answer it can get back, errors included, written down so that anyone can implement it and check an implementation against it.

## The contract

Create `openapi.json` at the root of the project:

@include packages/zerolith/test/fixtures/widget/app/openapi.json

This is an [OpenAPI](https://spec.openapis.org/oas/v3.1.0) document, the JSON format most server frameworks and API tools read and write. It describes one operation, `sendFeedback`:

| Part | What the contract says |
| --- | --- |
| Request | `POST /feedback` under the address the page gives, with a JSON body: `helpful`, a boolean; `page`, the page the feedback is about, up to 2000 characters; and `comment`, optional, up to 1000 characters |
| Success | `201` with a receipt, `{ "id": "..." }` |
| Failure | `400` when the body is not valid feedback, `429` when one sender sends too much, and any other status for anything else, each with a problem details document |

A problem details document, defined by [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) and sent as `application/problem+json`, is the standard JSON shape for an HTTP error: `title` says what went wrong in a few words, `detail` explains this occurrence, `status` repeats the status code, and `fields`, an extension zerolith's packages read, lists messages for each member that was refused. The widget shows `detail`, or `title` when there is no detail, so a backend's own words reach the reader.

A backend ignores members it does not know, so a later version of the widget can send more without breaking a backend written for this one.

## Types from the contract

`@zerolith/client` turns the document into TypeScript. Install it:

```sh
npm install @zerolith/client
```

and generate the module:

```sh
npx zerolith-client openapi.json --out src/api.ts
```

It writes `src/api.ts`:

@include packages/zerolith/test/fixtures/widget/app/src/api.ts wide

`Feedback`, `Problem`, and `Receipt` are the schemas as types, `Api` lists the operation with its method, path, body, and output, and `routes` is the part the client needs while the page runs. Do not edit the file: change `openapi.json` and run the command again, and any code that no longer matches the contract fails `npx tsc`.

## An example handler

The widget needs something to post to while you develop. Create `server/feedback.ts`:

@include packages/zerolith/test/fixtures/widget/app/server/feedback.ts

The handler is a function from a `Request` to a `Response`, the Fetch API's own types, so it runs unchanged on Deno, Bun, a Cloudflare worker, or Node, and a test can call it directly. It checks each member against the contract and answers `400` with a message for each one that is wrong, or hands the feedback to `save`, keeping only the members the contract names, and answers `201` with a fresh id. Lengths are counted in characters, as JSON Schema counts them, so an emoji counts once.

Every answer carries `access-control-allow-origin: *`, and an `OPTIONS` request gets the three headers CORS asks for. A page on one origin, such as a blog on its own domain, can read an answer from another origin, such as your API's domain, only when the server allows it. Because the widget sends JSON, the browser first asks with that `OPTIONS` request, the preflight, and sends the post only when the answer allows it. `*` allows every page, which suits feedback, since the widget sends no cookies; a backend that takes feedback from its own sites alone names them instead.

> [!NOTE]
> The example keeps nothing; `save` decides where feedback goes. A backend in production also stores it, limits how much one sender can send, answering `429` as the contract says, and caps the size of the body it reads.

Node has no server that takes such a function as it is, so `server/main.ts` adapts Node's HTTP server to it. Create it:

@include packages/zerolith/test/fixtures/widget/app/server/main.ts

It turns each request Node receives into a `Request`, hands it to the handler, writes the `Response` back, and prints each piece of feedback the handler saves. Node 24 runs a TypeScript file as it is, removing the types, so `node server/main.ts` starts it with nothing to compile.

`npx tsc` checks `src`, `test`, and the Vitest config. To check the server as well, install the types of Node's own modules:

```sh
npm install --save-dev @types/node
```

and add `"server"` to `include` in `tsconfig.json`, so it reads `["src", "test", "server", "vitest.config.ts"]`.

## Run it with the dev server

`zerolith dev` can start the backend and forward requests to it, so the page calls it on its own origin while you develop. Replace `zerolith.json`:

@include packages/zerolith/test/fixtures/widget/app/zerolith.json

A request whose path starts with `/api` goes to the handler on port 3000 with `/api` removed, so `/api/feedback` reaches it as `/feedback`. `run` is the command that starts the handler: `npm run dev` now runs it too, shows its output in the same terminal, and stops it when you stop the server. Stop the dev server with Ctrl+C and start it again, and its banner lists the proxy and the backend, with the handler's own line after it.

## What you learned

- The contract is the request and every answer, errors included, written as an OpenAPI document any backend can implement.
- `zerolith-client` generates the types and the route table from it, so code that no longer matches the contract fails `tsc`.
- A handler written as a function from `Request` to `Response` runs on any runtime and in a test.
- A page on another origin needs CORS answers, including the preflight a JSON post sends first.
- The `proxy` in `zerolith.json` forwards a path to a backend, and `run` starts that backend with `zerolith dev`.
