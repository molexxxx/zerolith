import { describe, expect, it, vi } from "vitest";
import { signal } from "zerolith";
import { type Client, type Transport, ProblemError, createClient } from "@zerolith/client";
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
