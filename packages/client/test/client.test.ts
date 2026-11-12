import { getEventListeners } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { signal } from "zerolith";
import { type Client, type RouteTable, type Transport, ProblemError, createClient } from "@zerolith/client";
import { type Api, type NotePage, routes } from "./fixtures/notes.api.ts";

function recorder(respond: (request: Request) => Response | Promise<Response>): { transport: Transport; requests: Request[] }
{
    const requests: Request[] = [];
    return {
        requests,
        transport: async (request) =>
        {
            requests.push(request);
            return respond(request);
        }
    };
}

const problem = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/problem+json" } });

describe("createClient", () =>
{
    it("builds the request from the route, the path parameters, and the query", async () =>
    {
        const { transport, requests } = recorder(() => Response.json({ items: [] }));
        const api = createClient<Api>(routes, { baseUrl: "https://api.test/v1/", transport });
        const page = await api.call("listNotes", { query: { q: "a b", tag: ["x", "y"], limit: undefined } });
        expect(page).toEqual({ items: [] });
        expect(requests[0]?.url).toBe("https://api.test/v1/notes?q=a+b&tag=x&tag=y");
        expect(requests[0]?.method).toBe("GET");
        expect(requests[0]?.headers.get("accept")).toBe("application/json, application/problem+json");
        expect(api.request("getNote", { params: { id: "a/b" } }).url).toBe("https://api.test/v1/notes/a%2Fb");
        expect(api.request("listNotes").url).toBe("https://api.test/v1/notes");
    });

    it("sends JSON bodies and passes raw bodies through", async () =>
    {
        const { transport, requests } = recorder(() => Response.json({ id: "1", title: "x", tags: [], visibility: "private" }, { status: 201 }));
        const api = createClient<Api>(routes, { baseUrl: "https://api.test", transport });
        await api.call("createNote", { body: { title: "x" } });
        expect(requests[0]?.headers.get("content-type")).toBe("application/json");
        await expect(requests[0]?.json()).resolves.toEqual({ title: "x" });

        const data = new FormData();
        data.append("file", new Blob(["hi"]), "hi.txt");
        await api.call("attach", { params: { id: "1" }, body: data });
        expect(requests[1]?.headers.get("content-type")).toContain("multipart/form-data");
    });

    it("resolves undefined for empty responses and text for text responses", async () =>
    {
        const { transport } = recorder((request) => request.url.endsWith("/search?q=x") ? new Response("hits", { headers: { "content-type": "text/plain" } }) : new Response(null, { status: 204 }));
        const api = createClient<Api>(routes, { baseUrl: "https://api.test", transport });
        await expect(api.call("deleteNote", { params: { id: "1" } })).resolves.toBeUndefined();
        await expect(api.call("search", { query: { q: "x" } })).resolves.toBe("hits");
    });

    it("rejects with the server's problem, or one built from the status line", async () =>
    {
        const { transport } = recorder((request) => request.url.endsWith("/notes/missing") ? problem(404, { title: "No such note", detail: "missing" }) : new Response("boom", { status: 500, statusText: "Internal Server Error" }));
        const api = createClient<Api>(routes, { baseUrl: "https://api.test", transport });
        const notFound = await api.call("getNote", { params: { id: "missing" } }).catch((error: unknown) => error);
        expect(notFound).toBeInstanceOf(ProblemError);
        expect((notFound as ProblemError).problem).toEqual({ status: 404, title: "No such note", detail: "missing" });
        expect((notFound as ProblemError).message).toBe("No such note");
        const failed = await api.call("getNote", { params: { id: "1" } }).catch((error: unknown) => error);
        expect((failed as ProblemError).problem).toEqual({ status: 500, title: "Internal Server Error" });
        expect((failed as ProblemError).response.status).toBe(500);
    });

    it("fills the path of a route with a long run of opening braces in linear time", async () =>
    {
        interface Braces
        {
            braces: { method: "get"; path: string; output: undefined };
        }
        const { transport, requests } = recorder(() => new Response(null, { status: 204 }));
        const braces = "{".repeat(200000);
        const api = createClient<Braces>({ braces: { method: "get", path: `/${braces}` } }, { baseUrl: "https://api.test", transport });
        const start = performance.now();
        await api.call("braces", {});
        expect(performance.now() - start).toBeLessThan(1000);
        expect(decodeURIComponent(new URL(requests[0]?.url ?? "").pathname)).toBe(`/${braces}`);
    });

    it("merges client headers, including a function, with per-call headers", () =>
    {
        let token = "a";
        const api = createClient<Api>(routes, { baseUrl: "https://api.test", headers: () => ({ authorization: `Bearer ${token}`, accept: "application/json" }) });
        expect(api.request("listNotes").headers.get("authorization")).toBe("Bearer a");
        token = "b";
        const request = api.request("listNotes", {}, { headers: { "x-trace": "1" } });
        expect(request.headers.get("authorization")).toBe("Bearer b");
        expect(request.headers.get("x-trace")).toBe("1");
        expect(request.headers.get("accept")).toBe("application/json");
    });

    it("refuses a missing path parameter and an unknown operation", () =>
    {
        const api = createClient<Api>(routes, { baseUrl: "https://api.test" });
        expect(() => api.request("getNote", { params: {} as { id: string } })).toThrow(/path parameter "id"/);
        expect(() => api.request("getNote", { params: { id: ".." } })).toThrow(/would move the request to another path/);
        expect(() => api.request("getNote", { params: { id: "." } })).toThrow(/would move the request to another path/);
        expect(api.request("getNote", { params: { id: "..a" } }).url).toBe("https://api.test/notes/..a");
        expect(() => (api as Client<Record<string, Api["getNote"]>>).request("nope", { params: { id: "1" } })).toThrow(/unknown operation/);
    });

    it("query calls again when the signals it reads change and idles on undefined", async () =>
    {
        const { transport, requests } = recorder((request) => Response.json({ id: request.url.split("/").at(-1), title: "t", tags: [], visibility: "public" }));
        const api = createClient<Api>(routes, { baseUrl: "https://api.test", transport });
        const id = signal<string | undefined>(undefined);
        const note = api.query("getNote", () =>
        {
            const current = id.get();
            return current === undefined ? undefined : { params: { id: current } };
        });
        expect(note.status.get()).toBe("idle");
        id.set("1");
        await vi.waitFor(() => expect(note.get()?.id).toBe("1"));
        id.set("2");
        await vi.waitFor(() => expect(note.get()?.id).toBe("2"));
        expect(requests).toHaveLength(2);
        id.set(undefined);
        await vi.waitFor(() => expect(note.status.get()).toBe("idle"));
    });

    it("is typed by the generated contract", () =>
    {
        const api = createClient<Api>(routes, { baseUrl: "https://api.test" });
        const checks = (): void =>
        {
            const page: Promise<NotePage> = api.call("listNotes");
            // @ts-expect-error getNote needs its path parameter
            void api.call("getNote");
            // @ts-expect-error there is no such operation
            void api.call("nope");
            // @ts-expect-error search requires q
            void api.call("search", { query: {} });
            // @ts-expect-error createNote needs a body
            void api.call("createNote");
            void page;
        };
        expect(typeof checks).toBe("function");
    });
});

/** A contract with an operation beyond the nine methods OpenAPI names, as an OpenAPI 3.2 `additionalOperations` entry gives. */
interface Copying
{
    copyNote: { method: "copy"; path: "/notes/{id}"; params: { id: number }; output: string };
}

describe("an operation with another method", () =>
{
    it("type-checks and sends the method as it is named, uppercased", async () =>
    {
        const copying = { copyNote: { method: "copy", path: "/notes/{id}" } } as const satisfies RouteTable<Copying>;
        const methods: string[] = [];
        const api = createClient<Copying>(copying, {
            baseUrl: "https://api.test",
            transport: (request) =>
            {
                methods.push(`${request.method} ${new URL(request.url).pathname}`);
                return Promise.resolve(Response.json("copied"));
            }
        });
        expect(await api.call("copyNote", { params: { id: 7 } })).toBe("copied");
        expect(methods).toEqual(["COPY /notes/7"]);
    });
});

/** A contract with a binary download and a streamed upload. */
interface Files
{
    download: { method: "get"; path: "/files/{id}"; params: { id: string }; output: Blob };
    upload: { method: "post"; path: "/files"; body: ReadableStream<Uint8Array>; output: undefined };
}

describe("bodies beyond JSON and text", () =>
{
    it("resolves another media type to a Blob and sends a stream body", async () =>
    {
        const files = { download: { method: "get", path: "/files/{id}" }, upload: { method: "post", path: "/files" } } as const satisfies RouteTable<Files>;
        const sent: string[] = [];
        const api = createClient<Files>(files, {
            baseUrl: "https://api.test",
            transport: async (request) =>
            {
                if (request.method === "POST")
                {
                    sent.push(await request.text());
                    return new Response(null, { status: 204 });
                }
                return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "application/octet-stream" } });
            }
        });
        const blob = await api.call("download", { params: { id: "a" } });
        expect(blob).toBeInstanceOf(Blob);
        expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
        const body = new ReadableStream<Uint8Array>({
            start(controller)
            {
                controller.enqueue(new TextEncoder().encode("streamed"));
                controller.close();
            }
        });
        await api.call("upload", { body });
        expect(sent).toEqual(["streamed"]);
    });

    it("aborts a query's request when the caller's signal aborts", async () =>
    {
        const files = { download: { method: "get", path: "/files/{id}" }, upload: { method: "post", path: "/files" } } as const satisfies RouteTable<Files>;
        const signals: AbortSignal[] = [];
        const api = createClient<Files>(files, {
            baseUrl: "https://api.test",
            transport: (request) =>
            {
                signals.push(request.signal);
                return new Promise<Response>(() => undefined);
            }
        });
        const caller = new AbortController();
        api.query("download", () => ({ params: { id: "a" } }), { signal: caller.signal });
        await vi.waitFor(() => expect(signals).toHaveLength(1));
        expect(signals[0]?.aborted).toBe(false);
        caller.abort();
        expect(signals[0]?.aborted).toBe(true);
    });
});

/** The method and headers of a request's init, leaving out its body and its duplex setting, for a stand-in Request that gives the body itself. */
function basics(init: RequestInit): RequestInit
{
    const copy: RequestInit = {};
    if (init.method !== undefined)
    {
        copy.method = init.method;
    }
    if (init.headers !== undefined)
    {
        copy.headers = init.headers;
    }
    return copy;
}

describe("requests and responses at the edges", () =>
{
    it("sends the query string where URLSearchParams has no size, and none for an empty query", async () =>
    {
        const { transport, requests } = recorder(() => Response.json({ items: [] }));
        const api = createClient<Api>(routes, { baseUrl: "https://api.test", transport });
        const size = Object.getOwnPropertyDescriptor(URLSearchParams.prototype, "size");
        Reflect.deleteProperty(URLSearchParams.prototype, "size");
        try
        {
            await api.call("listNotes", { query: { q: "a" } });
            await api.call("listNotes", { query: {} });
        }
        finally
        {
            if (size !== undefined)
            {
                Object.defineProperty(URLSearchParams.prototype, "size", size);
            }
        }
        expect(requests.map((request) => request.url)).toEqual(["https://api.test/notes?q=a", "https://api.test/notes"]);
    });

    it("keeps the multipart boundary of a FormData body under a content type from the client or the call", async () =>
    {
        interface Forms
        {
            send: { method: "post"; path: "/forms"; body: FormData; output: undefined };
        }
        const forms = { send: { method: "post", path: "/forms" } } as const satisfies RouteTable<Forms>;
        const { transport, requests } = recorder(() => new Response(null, { status: 204 }));
        const typed = createClient<Forms>(forms, { baseUrl: "https://api.test", headers: { "content-type": "application/json" }, transport });
        const plain = createClient<Forms>(forms, { baseUrl: "https://api.test", transport });
        const body = new FormData();
        body.append("title", "x");
        await typed.call("send", { body });
        await plain.call("send", { body }, { headers: { "content-type": "application/json" } });
        expect(requests).toHaveLength(2);
        for (const request of requests)
        {
            expect(request.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
            expect(await request.text()).toContain('name="title"');
        }
    });

    it("refuses a stream body only where the platform would not keep it as a stream", () =>
    {
        const Original = globalThis.Request;
        /** A Request that turns a stream body into its text, as Firefox and Chrome before 105 do. */
        class Stringifying extends Original
        {
            constructor(input: RequestInfo | URL, init: RequestInit = {})
            {
                super(input, { ...basics(init), body: init.body instanceof ReadableStream ? String(init.body) : (init.body ?? null) });
            }
        }
        /** A Request that keeps a stream body without a content type and without reading duplex, as Safari and Deno do. */
        class Keeping extends Original
        {
            constructor(input: RequestInfo | URL, init: RequestInit = {})
            {
                super(input, init.body instanceof ReadableStream ? { ...basics(init), body: new Blob(["kept"]) } : init);
            }
        }
        /** A Request that refuses a stream body outright. */
        class Refusing extends Original
        {
            constructor(input: RequestInfo | URL, init: RequestInit = {})
            {
                if (init.body instanceof ReadableStream)
                {
                    throw new TypeError("no stream bodies here");
                }
                super(input, init);
            }
        }
        const files = { download: { method: "get", path: "/files/{id}" }, upload: { method: "post", path: "/files" } } as const satisfies RouteTable<Files>;
        const api = createClient<Files>(files, { baseUrl: "https://api.test", transport: () => Promise.resolve(new Response(null, { status: 204 })) });
        try
        {
            vi.stubGlobal("Request", Stringifying);
            expect(() => api.request("upload", { body: new ReadableStream<Uint8Array>() })).toThrow("cannot send as a stream");
            vi.stubGlobal("Request", Refusing);
            expect(() => api.request("upload", { body: new ReadableStream<Uint8Array>() })).toThrow("cannot send as a stream");
            vi.stubGlobal("Request", Keeping);
            expect(api.request("upload", { body: new ReadableStream<Uint8Array>() }).headers.has("content-type")).toBe(false);
        }
        finally
        {
            vi.unstubAllGlobals();
        }
    });

    it("resolves undefined for a JSON body that is empty or holds only JSON whitespace, rejects any other blank, and keeps a binary HEAD response's Blob", async () =>
    {
        interface Bodies
        {
            empty: { method: "get"; path: "/empty"; output: undefined };
            blank: { method: "get"; path: "/blank"; output: undefined };
            nbsp: { method: "get"; path: "/nbsp"; output: undefined };
            check: { method: "head"; path: "/check"; output: undefined };
            file: { method: "head"; path: "/file"; output: Blob };
        }
        const bodies = {
            empty: { method: "get", path: "/empty" },
            blank: { method: "get", path: "/blank" },
            nbsp: { method: "get", path: "/nbsp" },
            check: { method: "head", path: "/check" },
            file: { method: "head", path: "/file" }
        } as const satisfies RouteTable<Bodies>;
        const api = createClient<Bodies>(bodies, {
            baseUrl: "https://api.test",
            transport: async (request) =>
            {
                const path = new URL(request.url).pathname;
                return new Response(path === "/blank" ? "\n\t \r\n" : path === "/nbsp" ? "\u00a0" : null, { headers: { "content-type": path === "/file" ? "image/png" : "application/json" } });
            }
        });
        await expect(api.call("empty")).resolves.toBeUndefined();
        await expect(api.call("blank")).resolves.toBeUndefined();
        await expect(api.call("nbsp")).rejects.toThrow(SyntaxError);
        await expect(api.call("check")).resolves.toBeUndefined();
        const file = await api.call("file");
        expect(file).toBeInstanceOf(Blob);
        expect([file.size, file.type]).toEqual([0, "image/png"]);
    });

    it("reads a HEAD response without its body on every transport, a failed one included", async () =>
    {
        interface Checks
        {
            json: { method: "head"; path: "/json"; output: undefined };
            text: { method: "head"; path: "/text"; output: undefined };
            file: { method: "head"; path: "/file"; output: Blob };
            download: { method: "get"; path: "/file"; output: Blob };
            blank: { method: "get"; path: "/blank"; output: Blob };
            gone: { method: "head"; path: "/gone"; output: undefined };
        }
        const checks = { json: { method: "head", path: "/json" }, text: { method: "head", path: "/text" }, file: { method: "head", path: "/file" }, download: { method: "get", path: "/file" }, blank: { method: "get", path: "/blank" }, gone: { method: "head", path: "/gone" } } as const satisfies RouteTable<Checks>;
        const api = createClient<Checks>(checks, {
            baseUrl: "https://api.test",
            transport: async (request) =>
            {
                const path = new URL(request.url).pathname;
                if (path === "/gone")
                {
                    return new Response(JSON.stringify({ title: "No such note", detail: "from the body" }), { status: 404, statusText: "Not Found", headers: { "content-type": "application/problem+json" } });
                }
                if (path === "/json")
                {
                    return Response.json({ title: "a note" });
                }
                return new Response(path === "/text" ? "hello" : path === "/file" ? "png bytes" : null, { headers: { "content-type": path === "/text" ? "text/plain" : "image/png" } });
            }
        });
        await expect(api.call("json")).resolves.toBeUndefined();
        await expect(api.call("text")).resolves.toBeUndefined();
        const blobs = await Promise.all([api.call("file"), api.call("download"), api.call("blank")]);
        expect(blobs.map((blob) => [blob instanceof Blob, blob.size, blob.type])).toEqual([[true, 0, "image/png"], [true, 9, "image/png"], [true, 0, "image/png"]]);
        const failure = await api.call("gone").catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(ProblemError);
        expect((failure as ProblemError).problem).toEqual({ status: 404, title: "Not Found" });
    });

    it("reads a problem as RFC 9457 says, leaving out members of the wrong type and keeping extension members", async () =>
    {
        const credit = { type: "https://example.com/probs/out-of-credit", title: "You do not have enough credit.", detail: "Your current balance is 30, but that costs 50.", instance: "/account/12345/msgs/abc", balance: 30, accounts: ["/account/12345", "/account/67890"] };
        const validation = { type: "https://example.net/validation-error", title: "Your request is not valid.", errors: [{ detail: "must be a positive integer", pointer: "#/age" }, { detail: "must be 'green', 'red' or 'blue'", pointer: "#/profile/color" }] };
        const answers: Response[] = [
            problem(403, credit),
            problem(422, validation),
            problem(404, { type: 1, title: 5, status: "500", detail: "Gone", instance: [], extra: "kept" }),
            problem(400, { title: "Conflict", status: 409 }),
            problem(422, { title: "Invalid", fields: { email: "required", age: 5, tags: ["taken", 1], none: [2] } }),
            problem(422, { title: "Invalid", fields: "email" }),
            problem(422, { title: "Invalid", fields: ["email"] }),
            problem(422, { title: "Invalid", fields: null }),
            problem(422, { title: "Invalid", fields: JSON.parse('{"__proto__":"taken","email":"required"}') as unknown })
        ];
        const count = answers.length;
        const api = createClient<Api>(routes, { baseUrl: "https://api.test", transport: async () => answers.shift() ?? Response.json({}) });
        const failures: unknown[] = [];
        for (let index = 0; index < count; index += 1)
        {
            failures.push(await api.call("getNote", { params: { id: "a" } }).catch((error: unknown) => error));
        }
        expect(failures.every((failure) => failure instanceof ProblemError)).toBe(true);
        expect(failures.slice(0, 8).map((failure) => (failure as ProblemError).problem)).toEqual([
            { ...credit, status: 403 },
            { ...validation, status: 422 },
            { detail: "Gone", extra: "kept", status: 404 },
            { title: "Conflict", status: 409 },
            { title: "Invalid", status: 422, fields: { email: ["required"], tags: ["taken"] } },
            { title: "Invalid", status: 422 },
            { title: "Invalid", status: 422 },
            { title: "Invalid", status: 422 }
        ]);
        expect(failures.map((failure) => (failure as ProblemError).message)).toEqual(["You do not have enough credit.", "Your request is not valid.", "HTTP 404", "Conflict", "Invalid", "Invalid", "Invalid", "Invalid", "Invalid"]);
        const fields = (failures[4] as ProblemError).problem.fields;
        const named = (failures[8] as ProblemError).problem.fields;
        expect(Object.getPrototypeOf(fields)).toBe(Object.prototype);
        expect(Object.getPrototypeOf(named)).toBe(Object.prototype);
        expect(Object.entries(named ?? {})).toEqual([["__proto__", ["taken"]], ["email", ["required"]]]);
    });

    it("reads operations and path parameters through their objects and prototypes but never Object.prototype or a function, and null as missing", () =>
    {
        interface Named
        {
            named: { method: "get"; path: "/x/{toString}"; params: { toString: string }; output: unknown };
            ctor: { method: "get"; path: "/y/{constructor}"; params: { constructor: string }; output: unknown };
        }
        /** A path parameter served by a getter, as a class or a reactive model holds it. */
        class NoteRef
        {
            readonly #id: string;

            constructor(id: string)
            {
                this.#id = id;
            }

            get id(): string
            {
                return this.#id;
            }
        }
        const api = createClient<Api>(routes, { baseUrl: "https://api.test", transport: async () => Response.json({}) });
        const loose = api as unknown as { request(name: string): Request };
        for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"])
        {
            expect(() => loose.request(name)).toThrow(`unknown operation "${name}"`);
        }
        const inherited = createClient<Api>(Object.create(routes) as typeof routes, { baseUrl: "https://api.test" });
        expect(inherited.request("getNote", { params: { id: "a" } }).url).toBe("https://api.test/notes/a");
        expect(api.request("getNote", { params: new NoteRef("b") }).url).toBe("https://api.test/notes/b");
        const named = createClient<Named>({ named: { method: "get", path: "/x/{toString}" }, ctor: { method: "get", path: "/y/{constructor}" } }, { baseUrl: "https://api.test" });
        expect(() => named.request("named", { params: {} as { toString: string } })).toThrow('needs the path parameter "toString"');
        expect(() => named.request("ctor", { params: new NoteRef("b") as unknown as { constructor: string } })).toThrow('needs the path parameter "constructor"');
        expect(() => api.request("getNote", { params: { id: (() => "a") as unknown as string } })).toThrow('needs the path parameter "id"');
        const read = new Proxy(new URLSearchParams("id=7"), { get: (search, key) => typeof key === "string" ? search.get(key) : undefined });
        expect(api.request("getNote", { params: read as unknown as { id: string } }).url).toBe("https://api.test/notes/7");
        expect(named.request("named", { params: Object.create({ toString: "x" }) as { toString: string } }).url).toBe("https://api.test/x/x");
        expect(() => api.request("getNote", { params: { id: null as unknown as string } })).toThrow('needs the path parameter "id"');
        expect(() => api.request("getNote", { params: null as never })).toThrow('needs the path parameter "id"');
    });

    it("refuses a body JSON.stringify turns into nothing", () =>
    {
        const api = createClient<Api>(routes, { baseUrl: "https://api.test", transport: async () => Response.json({}) });
        for (const body of [() => 1, Symbol("draft"), { toJSON: () => undefined }])
        {
            expect(() => api.request("createNote", { body: body as never })).toThrow("does not serialize as JSON");
        }
    });

    it("refuses a whole query that is iterable, a Date, or a non-empty string, and reads any other value by its own keys", () =>
    {
        const api = createClient<Api>(routes, { baseUrl: "https://api.test", transport: async () => Response.json({ items: [] }) });
        for (const query of [new URLSearchParams("q=a"), new FormData(), new Map([["q", "a"]]), new Set(["q"]), new Headers({ q: "a" }), new Uint8Array([1, 2]), new Date(0), ["q"], "q=a"])
        {
            expect(() => api.request("listNotes", { query: query as never })).toThrow("takes its query as an object of names and values");
        }
        expect(() => api.request("listNotes", { query: new Map() as never })).toThrow(new TypeError("zerolith/client: GET /notes takes its query as an object of names and values, not Map"));
        expect(() => api.request("listNotes", { query: "q=a" as never })).toThrow(new TypeError("zerolith/client: GET /notes takes its query as an object of names and values, not String"));
        /** Query values in own fields, as a class instance holds them. */
        class Filters
        {
            readonly q = "a";
        }
        const tagged = { q: "b", [Symbol.toStringTag]: "DOMStringMap" };
        expect(api.request("listNotes", { query: new Filters() as never }).url).toBe("https://api.test/notes?q=a");
        expect(api.request("listNotes", { query: tagged as never }).url).toBe("https://api.test/notes?q=b");
        expect(api.request("listNotes", { query: null as never }).url).toBe("https://api.test/notes");
        for (const query of [false, 0, ""])
        {
            expect(api.request("listNotes", { query: query as never }).url).toBe("https://api.test/notes");
        }
        expect(api.request("listNotes", { query: Object.assign(() => undefined, { q: "c" }) as never }).url).toBe("https://api.test/notes?q=c");
        expect(api.request("listNotes", { query: { q: "d", [Symbol.iterator]: undefined } as never }).url).toBe("https://api.test/notes?q=d");
    });

    it("leaves undefined and null items of a query array out", () =>
    {
        const api = createClient<Api>(routes, { baseUrl: "https://api.test", transport: async () => Response.json({ items: [] }) });
        expect(api.request("listNotes", { query: { tag: ["a", null, undefined, "b"] as never } }).url).toBe("https://api.test/notes?tag=a&tag=b");
    });

    it("passes each signal's abort reason to a query's request, before or during the run, and lets go of the caller's signal after", async () =>
    {
        const files = { download: { method: "get", path: "/files/{id}" }, upload: { method: "post", path: "/files" } } as const satisfies RouteTable<Files>;
        const signals: AbortSignal[] = [];
        const api = createClient<Files>(files, {
            baseUrl: "https://api.test",
            transport: (request) =>
            {
                signals.push(request.signal);
                if (request.signal.aborted)
                {
                    return Promise.reject(request.signal.reason);
                }
                return new Promise<Response>((_resolve, reject) => request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true }));
            }
        });
        const before = new AbortController();
        const early = new Error("gone before it started");
        before.abort(early);
        api.query("download", () => ({ params: { id: "a" } }), { signal: before.signal });
        const during = new AbortController();
        api.query("download", () => ({ params: { id: "b" } }), { signal: during.signal });
        const id = signal("c");
        const changing = new AbortController();
        api.query("download", () => ({ params: { id: id.get() } }), { signal: changing.signal });
        await vi.waitFor(() => expect(signals).toHaveLength(3));
        const late = new Error("left the page");
        during.abort(late);
        id.set("d");
        await vi.waitFor(() => expect(signals).toHaveLength(4));
        expect([signals[0]?.reason, signals[1]?.reason]).toEqual([early, late]);
        expect(signals[2]?.aborted).toBe(true);
        const changed: unknown = signals[2]?.reason;
        expect(changed).toBeInstanceOf(DOMException);
        expect((changed as DOMException).name).toBe("AbortError");
        await vi.waitFor(() => expect([before.signal, during.signal].map((caller) => getEventListeners(caller, "abort").length)).toEqual([0, 0]));
        expect(getEventListeners(changing.signal, "abort")).toHaveLength(1);
    });

    it("reads JSON from a stand-in for a Response that has json() and no text(), as a stubbed transport returns", async () =>
    {
        const api = createClient<Api>(routes, {
            baseUrl: "https://api.test",
            transport: async () => ({ ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ items: [], next: null }) }) as unknown as Response
        });
        await expect(api.call("listNotes", {})).resolves.toEqual({ items: [], next: null });
    });

    it("refuses an empty path parameter, which would send the request to the collection", () =>
    {
        const api = createClient<Api>(routes, { baseUrl: "https://api.test" });
        expect(() => api.request("getNote", { params: { id: "" } })).toThrow(TypeError);
        expect(api.request("getNote", { params: { id: "0" } }).url).toBe("https://api.test/notes/0");
    });

    it("resolves undefined for a HEAD answer with no content type, gives a binary one's Blob the type a GET's has, and cancels its body", async () =>
    {
        interface Heads
        {
            bare: { method: "head"; path: "/bare"; output: undefined };
            image: { method: "head"; path: "/image"; output: Blob };
            download: { method: "get"; path: "/image"; output: Blob };
            gone: { method: "head"; path: "/gone"; output: undefined };
        }
        const heads = { bare: { method: "head", path: "/bare" }, image: { method: "head", path: "/image" }, download: { method: "get", path: "/image" }, gone: { method: "head", path: "/gone" } } as const satisfies RouteTable<Heads>;
        const canceled: string[] = [];
        const streamed = (path: string): ReadableStream<Uint8Array> => new ReadableStream({
            cancel()
            {
                canceled.push(path);
            }
        });
        const api = createClient<Heads>(heads, {
            baseUrl: "https://api.test",
            transport: async (request) =>
            {
                const path = new URL(request.url).pathname;
                if (path === "/bare")
                {
                    return new Response(request.method === "HEAD" ? streamed(path) : null);
                }
                if (path === "/gone")
                {
                    return new Response(streamed(path), { status: 404, headers: { "content-type": "application/problem+json" } });
                }
                return new Response(request.method === "HEAD" ? streamed(path) : "png", { headers: { "content-type": "image/png; charset=utf-8" } });
            }
        });
        await expect(api.call("bare")).resolves.toBeUndefined();
        const [image, download] = await Promise.all([api.call("image"), api.call("download")]);
        expect([image.type, image.size]).toEqual([download.type, 0]);
        await expect(api.call("gone")).rejects.toBeInstanceOf(ProblemError);
        await vi.waitFor(() => expect(canceled.toSorted()).toEqual(["/bare", "/gone", "/image"]));
    });

    it("keeps the content type the caller set on a string, a Blob, or a URLSearchParams body", async () =>
    {
        const files = { download: { method: "get", path: "/files/{id}" }, upload: { method: "post", path: "/files" } } as const satisfies RouteTable<Files>;
        const { transport, requests } = recorder(() => new Response(null, { status: 204 }));
        const api = createClient<Files>(files, { baseUrl: "https://api.test", transport });
        await api.call("upload", { body: "a,b\n1,2" as unknown as ReadableStream<Uint8Array> }, { headers: { "content-type": "text/csv" } });
        await api.call("upload", { body: new Blob(["{}"]) as unknown as ReadableStream<Uint8Array> }, { headers: { "content-type": "application/vnd.notes+json" } });
        await api.call("upload", { body: new URLSearchParams("a=1") as unknown as ReadableStream<Uint8Array> }, { headers: { "content-type": "application/x-www-form-urlencoded; charset=latin1" } });
        expect(requests.map((request) => request.headers.get("content-type"))).toEqual(["text/csv", "application/vnd.notes+json", "application/x-www-form-urlencoded; charset=latin1"]);
    });

    it("keeps the parsed body beside the problem, so members the problem leaves out stay reachable", async () =>
    {
        const sent = { title: "Invalid", fields: [{ name: "email", reason: "taken" }], errors: [{ pointer: "#/email" }] };
        const answers = [problem(422, sent), new Response("not json", { status: 500, headers: { "content-type": "application/json" } }), new Response("plain", { status: 503 })];
        const api = createClient<Api>(routes, { baseUrl: "https://api.test", transport: async () => answers.shift() ?? Response.json({}) });
        const failures: unknown[] = [];
        for (const _ of [1, 2, 3])
        {
            failures.push(await api.call("getNote", { params: { id: "a" } }).catch((error: unknown) => error));
        }
        const [kept, broken, plain] = failures as ProblemError[];
        expect(kept?.problem).toEqual({ title: "Invalid", errors: sent.errors, status: 422 });
        expect(kept?.body).toEqual(sent);
        expect([broken?.body, plain?.body]).toEqual([undefined, undefined]);
        expect(new ProblemError({ status: 400 }, new Response(null, { status: 400 })).body).toBeUndefined();
    });

    it("leaves out a problem's detail of the wrong type", async () =>
    {
        const api = createClient<Api>(routes, { baseUrl: "https://api.test", transport: async () => problem(409, { title: "Conflict", detail: 5 }) });
        const failure = await api.call("getNote", { params: { id: "a" } }).catch((error: unknown) => error);
        expect((failure as ProblemError).problem).toEqual({ title: "Conflict", status: 409 });
    });

    it("keeps a finished query's request signal live until the request ends, with or without a caller's signal", async () =>
    {
        const files = { download: { method: "get", path: "/files/{id}" }, upload: { method: "post", path: "/files" } } as const satisfies RouteTable<Files>;
        const { transport, requests } = recorder(() => new Response("bytes", { headers: { "content-type": "application/octet-stream" } }));
        const api = createClient<Files>(files, { baseUrl: "https://api.test", transport });
        const id = signal("a");
        const caller = new AbortController();
        const withCaller = api.query("download", () => ({ params: { id: id.get() } }), { signal: caller.signal });
        const without = api.query("download", () => ({ params: { id: id.get() } }));
        await vi.waitFor(() => expect([withCaller.status.get(), without.status.get()]).toEqual(["resolved", "resolved"]));
        expect(requests.map((request) => request.signal.aborted)).toEqual([false, false]);
        id.set("b");
        expect(requests.slice(0, 2).map((request) => request.signal.aborted)).toEqual([true, true]);
    });

    it("reads a problem whatever the casing of its media type", async () =>
    {
        const api = createClient<Api>(routes, { baseUrl: "https://api.test", transport: async () => new Response(JSON.stringify({ title: "No such note" }), { status: 404, headers: { "content-type": "Application/Problem+JSON" } }) });
        const failure = await api.call("getNote", { params: { id: "a" } }).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(ProblemError);
        expect((failure as ProblemError).problem).toEqual({ status: 404, title: "No such note" });
    });
});
