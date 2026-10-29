# @zerolith/client

A typed HTTP client over a neutral contract. `zerolith-client` reads an OpenAPI 3.x document and writes one TypeScript module: a type per component schema, an `Api` interface with one entry per operation, and the `routes` table the client runs on. `createClient` takes that table and checks every call against it: the operation name, its path and query parameters, its body, and what it resolves to.

```
npx zerolith-client openapi.json --out src/api.ts
```

```ts
import { createClient } from "@zerolith/client";
import { type Api, routes } from "./api.ts";

const api = createClient<Api>(routes, { baseUrl: "/api" });
const note = await api.call("getNote", { params: { id } });
const notes = api.query("listNotes", () => ({ query: { q: search.get() } }));
```

A response outside 2xx rejects with a `ProblemError` carrying the RFC 9457 problem the server sent, or one built from the status line. `query` wraps an operation in a resource that calls again when the signals it reads change. A custom `transport` answers requests in process, for tests or an Electron bridge, and the client never assumes which server produced the document.

The guide is `docs/guide/client.md` in the repository.

Status: pre-alpha, nothing published.

## License

Apache-2.0. See `LICENSE`.
