# @zerolith/client/port

Every export of `@zerolith/client/port` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function portTransport(port: PortLike): Transport
function servePort(port: PortLike, handler: (request: Request) => Response | Promise<Response>): void

interface PortLike
{
    postMessage(message: unknown): void
    start?(): void
    addEventListener?(type: "message", listener: (event: { data: unknown }) => void): void
    on?(type: "message", listener: (event: { data: unknown }) => void): void
}

interface PortRequest
{
    kind: "zerolith:request"
    id: number
    url: string
    method: string
    headers: [string, string][]
    body: string | null
}

interface PortResponse
{
    kind: "zerolith:response"
    id: number
    status: number
    statusText: string
    headers: [string, string][]
    body: string | null
}
```
