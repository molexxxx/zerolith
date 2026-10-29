---
title: Typed client
description: Generate a route table and types from an OpenAPI document, call operations with checked inputs, and read failures as problems, against any backend.
order: 6
---

# Typed client

zerolith does not know your server. What it knows is the contract the server publishes: an OpenAPI 3.x document. `@zerolith/client` turns that document into one TypeScript module and gives you a client that checks every call against it, so renaming a field on the server fails `tsc` on the client, whatever language the server is written in.

## Generate the contract module

```
npx zerolith-client openapi.json --out src/api.ts
```

The command reads the document as JSON (convert YAML first) and writes three things: a type for every schema under `components.schemas`, an `Api` interface with one entry per operation, and a `routes` table with the method and path of each. Operations are named by their `operationId`, or by their method and path when there is none. One entry looks like this:

@include packages/client/test/examples/client.example.test.ts#generated

Path parameters become `params`, query parameters become `query` (optional unless one of them is required, and an optional parameter accepts `undefined`, which is not sent), a JSON request body becomes `body` (a `multipart/form-data` body is `FormData`), and the JSON content of the 2xx responses becomes `output`, with `undefined` for a response without content. Header and cookie parameters, security schemes, and references outside the document are left out; headers travel through the client's options instead. The generator is also a function, `generateClient` from `@zerolith/client/generate`, for build scripts.

## Call operations

@include packages/client/test/examples/client.example.test.ts#client

`call` resolves with the operation's output. Its second argument is the operation's `params`, `query`, and `body`, exactly as optional as the contract makes them, and it is omitted when the operation takes nothing. The request copies what the document says: the path with its parameters encoded, the query with arrays repeated and `undefined` skipped, a JSON body with its content type, and an `Accept` header asking for JSON or a problem.

## Read failures as problems

A response outside 2xx rejects with a `ProblemError`. Its `problem` is the RFC 9457 document the server sent, with the status filled in, or a problem built from the status line when the body was something else. The same `Problem` type is what forms show and what the core exports, so one error shape runs through the whole application.

@include packages/client/test/examples/client.example.test.ts#problem

## Query with signals

`query` wraps an operation in a resource. The function you pass is tracked: when a signal it reads changes, the operation is called again, the previous request is aborted, and stale results are ignored. Returning `undefined` keeps the resource idle.

@include packages/client/test/examples/client.example.test.ts#query

`results.get()` is the latest page, `results.pending` is true while a request is in flight, and `results.error` holds the `ProblemError` of a failed call.

## Options

- `baseUrl` is prepended to every path. It defaults to the empty string, which means the page's origin in a browser; pass an absolute URL anywhere else.
- `headers` are sent with every request, or computed per request when given as a function, which is where a bearer token goes.
- `transport` replaces `fetch`. A test can answer in process; an Electron renderer can forward requests over a message port and get the same typed client.
- Each call accepts `signal` and `headers` of its own, and `request` returns the `Request` a call would send without sending it.

## Over a message port

Where `fetch` cannot reach the server, the same client runs over a message port: an Electron renderer behind `contextBridge`, a worker, or a test. `servePort`, from `@zerolith/client/port`, answers requests where the handler lives; `portTransport` sends them from where the client lives. Requests and responses cross as plain messages with text bodies, so JSON and encoded forms travel and binary uploads do not.

@include packages/client/test/examples/port.example.test.ts#port

In Electron, the main process creates a `MessageChannelMain`, keeps one port for `servePort`, and posts the other to the renderer, whose preload script forwards it to the page with `window.postMessage`; Electron's `MessagePortMain` and the page's `MessagePort` are both accepted. Problems cross unchanged, and a handler that throws answers with a 500 problem, so the client's error handling is the same on every transport.
