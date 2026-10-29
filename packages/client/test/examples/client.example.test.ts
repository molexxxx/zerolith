// Executed examples for the client guide.
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Problem, signal } from "zerolith";
import { ProblemError, createClient } from "@zerolith/client";
import { type OpenApiDocument, generateClient } from "@zerolith/client/generate";
import { type Api, type Note, routes } from "../fixtures/notes.api.ts";

const notes: Note[] = [
    { id: "1", title: "Routing", tags: ["guide"], visibility: "public" },
    { id: "2", title: "Forms", tags: ["guide"], visibility: "public" }
];

function server(request: Request): Response
{
    const url = new URL(request.url);
    if (url.pathname === "/notes")
    {
        const q = url.searchParams.get("q") ?? "";
        return Response.json({ items: notes.filter((note) => note.title.toLowerCase().includes(q.toLowerCase())) });
    }
    const note = notes.find((candidate) => url.pathname === `/notes/${candidate.id}`);
    if (note === undefined)
    {
        const problem: Problem = { title: "No such note", status: 404 };
        return new Response(JSON.stringify(problem), { status: 404, headers: { "content-type": "application/problem+json" } });
    }
    return Response.json(note);
}

afterEach(() =>
{
    vi.unstubAllGlobals();
});

describe("client guide", () =>
{
    it("shows what the generator writes for one operation", async () =>
    {
        const document = JSON.parse(await readFile(new URL("../fixtures/notes.openapi.json", import.meta.url), "utf8")) as OpenApiDocument;
        const generated = generateClient(document);
        const excerpt = `
// #region generated
    getNote: {
        method: "get";
        path: "/notes/{id}";
        params: {
            id: string;
        };
        output: Note;
    };
// #endregion generated
`;
        const lines = excerpt.split("\n");
        expect(generated).toContain(lines.slice(lines.indexOf("// #region generated") + 1, lines.indexOf("// #endregion generated")).join("\n"));
        expect(generated).toContain("getNote: { method: \"get\", path: \"/notes/{id}\" }");
    });

    it("calls operations, reads problems, and queries through signals", async () =>
    {
        vi.stubGlobal("fetch", (request: Request) => Promise.resolve(server(request)));
        // #region client
        const api = createClient<Api>(routes, { baseUrl: "https://notes.example" });

        const note = await api.call("getNote", { params: { id: "1" } });
        const page = await api.call("listNotes", { query: { q: "rout", limit: 10 } });
        // #endregion client
        expect(note.title).toBe("Routing");
        expect(page.items).toHaveLength(1);

        let seen: Problem | undefined;
        // #region problem
        try
        {
            await api.call("getNote", { params: { id: "missing" } });
        }
        catch (error)
        {
            if (error instanceof ProblemError)
            {
                seen = error.problem;
            }
        }
        // #endregion problem
        expect(seen).toEqual({ status: 404, title: "No such note" });

        // #region query
        const search = signal("rout");
        const results = api.query("listNotes", () => ({ query: { q: search.get() } }));
        // #endregion query
        await vi.waitFor(() => expect(results.get()?.items.map((item) => item.title)).toEqual(["Routing"]));
        search.set("form");
        await vi.waitFor(() => expect(results.get()?.items.map((item) => item.title)).toEqual(["Forms"]));
    });
});
