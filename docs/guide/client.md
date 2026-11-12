---
title: Typed client
description: Generate a route table and types from an OpenAPI document, call operations with checked inputs, and read failures as problems, against any backend.
order: 7
group: Building apps
---

# Typed client

zerolith does not know your server. What it knows is the contract the server publishes, an OpenAPI 3.x document, and `@zerolith/client` builds on that alone:

1. The server publishes its contract, such as `openapi.json`.
2. `zerolith-client` turns the contract into one TypeScript module, `src/api.ts`, with the types and a route table.
3. `createClient` over that module checks every call against the contract: the operation's name, its parameters, its body, and what it returns.

Renaming a field on the server then fails `tsc` on the client, whatever language the server is written in.

## Generate the contract module

```sh
npx zerolith-client openapi.json --out src/api.ts
```

The command writes three things: a type for every schema under `components.schemas`, an `Api` interface with one entry per operation, and a `routes` table with the method and path of each. Without `--out` it prints the module, and `--name` gives the interface another name. A schema whose type name would clash is written under the next free name with a number added, as `Record2`, with a comment that says why, and every reference to it follows: one that another schema takes first, as `note-item` and `note_item` both give `NoteItem`, one named like the interface or `RouteTable`, and one named like a built-in type the module writes, such as `Record` for an object of free keys or `Blob` for a binary response. A schema named like a built-in the module does not write keeps its name. One entry looks like this:

@include packages/client/test/examples/client.example.test.ts#generated excerpt

An operation is named by its `operationId` in camel case, or by its method and path when it has none, so `GET /notes/{id}/tags` becomes `getNotesByIdTags`. Two operations that resolve to the same name fail the generator, which asks for distinct `operationId` values.

> [!NOTE]
> The command reads the document as JSON; convert a YAML document first. The generator is also a function, `generateClient` from `@zerolith/client/generate`, for build scripts.

### How the document maps to types

| In the document | In the generated entry |
| --- | --- |
| Path parameters | `params`, one member per name |
| Query parameters | `query`, optional unless one of them is required; an optional parameter also accepts `undefined`, which is not sent |
| A JSON request body, `application/json` or any `+json` type | `body`, typed by its schema, optional unless the body is required |
| A `multipart/form-data`, URL-encoded, or `text/*` request body | `body` as `FormData`, `URLSearchParams`, or `string` |
| The 2xx responses | `output`: the union of their JSON types, `string` for text, `Blob` for any other type, such as `application/octet-stream`, and `undefined` for a response without content; a HEAD operation gives `undefined` for a JSON or text response too, since a HEAD response carries no content |
| No 2xx response | `output` from the `default` response, or `unknown` |
| `summary`, `description`, and `deprecated` | The entry's doc comment, with `@deprecated` when it applies |
| `allOf`, `oneOf`, `anyOf`, and `$ref` in a schema | An intersection, a union, or the referenced type; keywords beside them that shape a type, such as `properties`, intersect with them |
| `additionalOperations`, OpenAPI 3.2's methods beyond the standard ones | An entry per method, whose `method` is the name in lowercase, such as `copy`; a name that is not an HTTP method name fails the generator, since it would be written into the module |
| Header and cookie parameters, security schemes, and references outside the document | Left out; headers travel through the client's options |
| A `trace` operation, or a `CONNECT`, `TRACE`, or `TRACK` entry under `additionalOperations` | Left out, since `fetch` refuses to send those methods |

> [!IMPORTANT]
> `src/api.ts` is generated. Check it in, so the project builds without running the generator, and regenerate it whenever the contract changes instead of editing it.

## Call operations

@include packages/client/test/examples/client.example.test.ts#client

`call` resolves with the operation's output. Its second argument holds the operation's `params`, `query`, and `body`, exactly as optional as the contract makes them, and it is omitted when the operation takes nothing. The request is built this way:

- The path, with each parameter read from the params object or a prototype it inherits from, never from `Object.prototype`, and encoded; a missing one, or one that is `null` or a function, throws a `TypeError` that names it, and so does a parameter of `.` or `..`, which the URL would otherwise read as a step to another path.
- The query, with an array repeating its key, an object sent as JSON, and `undefined` and `null` left out, inside an array too, whatever `style` and `explode` the document declares for the parameter, which the client does not read yet. A whole query that is iterable, such as a `URLSearchParams`, `FormData`, `Map`, or array, or that is a `Date` or a non-empty string, throws a `TypeError`, since its values would be lost.
- The body as JSON with its content type, unless it is already a `FormData`, `URLSearchParams`, `Blob`, `ArrayBuffer` or typed array, string, or stream, which goes as it is. A `FormData` body leaves out any `content-type` header, so the platform writes its multipart boundary, and a stream body throws a `TypeError` on a platform that would send it as text, such as Firefox and Chrome before 105. So does a body `JSON.stringify` turns into nothing, such as a function.
- An `Accept` header asking for JSON or a problem, unless a header sets one.

A successful response resolves to its JSON, its text, or a `Blob` for any other type, empty when the body is, and to `undefined` for a 204 or a 205, for an empty text body, and for a JSON body that is empty or holds only spaces, tabs, and line breaks. A HEAD response is read without a body on every transport, as `fetch` gives it: `undefined` for JSON or text, and an empty `Blob` otherwise. A failed HEAD call rejects with the problem its status line gives.

## Read failures as problems

A response outside 2xx rejects with a `ProblemError`, so one `catch` handles every failure the server reports:

@include packages/client/test/examples/client.example.test.ts#problem

| Member | Holds |
| --- | --- |
| `problem` | The RFC 9457 document the server sent, with the response's status filled in when it left it out, a standard member of the wrong type left out, and `fields` read as lists of messages, as forms read them; or a problem built from the status line when the body was something else |
| `response` | The `Response` itself |
| `message` | The problem's title, or `HTTP` and the status |

The same `Problem` type is what forms show and what the core exports, so one error shape runs through the whole application.

## Query with signals

`query` wraps an operation in a resource. The function you pass is tracked: when a signal it reads changes, the operation is called again, the previous request is aborted, and a stale result is dropped. Returning `undefined` keeps the resource idle.

@include packages/client/test/examples/client.example.test.ts#query

`results` is a resource like any other, as the [signals guide](signals.md#async-values) describes: `results.get()` is the latest output, kept while the next request runs, `results.pending` is true while a request is in flight, and `results.error` holds the `ProblemError` of a failed call.

## Options

| Option | What it does |
| --- | --- |
| `baseUrl` | Prepended to every path. It defaults to the empty string, the page's origin in a browser; pass an absolute URL anywhere else |
| `headers` | Sent with every request, or computed per request when given as a function, which is where a bearer token goes; a `content-type` among them is left out for a `FormData` body |
| `transport` | Replaces `fetch`: a function from a `Request` to a promise of a `Response`. A test can answer in process, and an Electron renderer can forward requests over a message port |

Each call also takes options of its own as its last argument, a `signal` and `headers` that override the client's. `request` takes the same arguments as `call` and returns the `Request` a call would send, without sending it.

## Over a message port

Where `fetch` cannot reach the server, the same client runs over a message port: an Electron renderer behind `contextBridge`, a worker, or a test. `servePort`, from `@zerolith/client/port`, answers requests where the handler lives; `portTransport` sends them from where the client lives.

@include packages/client/test/examples/port.example.test.ts#port

In Electron, the main process creates a `MessageChannelMain`, keeps one port for `servePort`, and posts the other to the renderer, whose preload script forwards it to the page with `window.postMessage`; Electron's `MessagePortMain` and the page's `MessagePort` are both accepted. Problems cross unchanged, except a failed HEAD call's, since the answer to a HEAD request carries no body, a handler that throws answers with a 500 problem, and aborting a call rejects it at once, so the client's error handling is the same on every transport.

> [!WARNING]
> Requests and responses cross as plain messages with text bodies. JSON and encoded forms travel; binary uploads do not.
