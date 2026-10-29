import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { type OpenApiDocument, generateClient } from "@zerolith/client/generate";

const fixture = new URL("./fixtures/notes.openapi.json", import.meta.url);
const snapshot = new URL("./fixtures/notes.api.ts", import.meta.url);

function document(paths: NonNullable<OpenApiDocument["paths"]>, components?: NonNullable<OpenApiDocument["components"]>): OpenApiDocument
{
    return components === undefined ? { openapi: "3.2.0", paths } : { openapi: "3.2.0", paths, components };
}

const ok = { "200": { description: "ok", content: { "application/json": { schema: { type: "string" } } } } };

describe("generateClient", () =>
{
    it("matches the checked-in module for the notes document", async () =>
    {
        const notes = JSON.parse(await readFile(fixture, "utf8")) as OpenApiDocument;
        expect(generateClient(notes)).toBe((await readFile(snapshot, "utf8")).replace(/\r\n/g, "\n"));
    });

    it("accepts only OpenAPI 3.x documents", () =>
    {
        expect(() => generateClient({ openapi: "2.0" })).toThrow(/OpenAPI 3/);
        expect(() => generateClient({} as OpenApiDocument)).toThrow(/OpenAPI 3/);
    });

    it("names operations from the method and path when operationId is missing, and refuses collisions", () =>
    {
        const code = generateClient(document({ "/users/{userId}/posts": { get: { responses: ok } } }));
        expect(code).toContain("getUsersByUserIdPosts: {");
        expect(() => generateClient(document({ "/a": { get: { operationId: "same", responses: ok } }, "/b": { get: { operationId: "same", responses: ok } } }))).toThrow(/distinct operationId/);
    });

    it("lets operation parameters override path item parameters and marks the query required when one parameter is", () =>
    {
        const code = generateClient(document({
            "/items/{id}": {
                parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }, { name: "page", in: "query", schema: { type: "integer" } }],
                get: { operationId: "read", parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }, { name: "sort", in: "query", required: true, schema: { type: "string" } }], responses: ok }
            }
        }));
        expect(code).toContain("params: {\n            id: number;\n        };");
        expect(code).toContain("query: {\n            page?: number | undefined;\n            sort: string;\n        };");
    });

    it("unions every 2xx response and falls back to default", () =>
    {
        const code = generateClient(document({
            "/a": { get: { operationId: "a", responses: { "2XX": { description: "", content: { "application/json": { schema: { type: "number" } } } }, "200": { description: "", content: { "application/json": { schema: { type: "string" } } } }, "204": { description: "" } } } },
            "/b": { get: { operationId: "b", responses: { default: { description: "", content: { "application/json": { schema: { type: "boolean" } } } } } } },
            "/c": { get: { operationId: "c", responses: {} } }
        }));
        expect(code).toContain("a: {\n        method: \"get\";\n        path: \"/a\";\n        output: string | undefined | number;");
        expect(code).toContain("output: boolean;");
        expect(code).toContain("c: {\n        method: \"get\";\n        path: \"/c\";\n        output: unknown;");
    });

    it("renders schema keywords", () =>
    {
        const code = generateClient(document({}, {
            schemas: {
                Mixed: {
                    type: "object",
                    required: ["count"],
                    properties: {
                        count: { type: ["integer", "null"] },
                        level: { enum: [1, 2, 3] },
                        either: { anyOf: [{ type: "string" }, { type: "boolean" }] },
                        closed: { type: "object", additionalProperties: false },
                        open: { type: "object" },
                        "odd-name": { type: "string", description: "Ends with */ oddly" },
                        list: { type: "array", items: { oneOf: [{ type: "string" }, { type: "number" }] } }
                    }
                }
            }
        }));
        expect(code).toContain("count: number | null;");
        expect(code).toContain("level?: 1 | 2 | 3;");
        expect(code).toContain("either?: string | boolean;");
        expect(code).toContain("closed?: Record<string, never>;");
        expect(code).toContain("open?: Record<string, unknown>;");
        expect(code).toContain("/** Ends with * / oddly */\n    \"odd-name\"?: string;");
        expect(code).toContain("list?: (string | number)[];");
    });

    it("honors the specifier and interface name options", () =>
    {
        const code = generateClient(document({}), { clientSpecifier: "../client.ts", apiName: "Notes" });
        expect(code).toContain("import type { RouteTable } from \"../client.ts\";");
        expect(code).toContain("export interface Notes\n{");
        expect(code).toContain("satisfies RouteTable<Notes>;");
    });

    it("resolves local references and rejects the rest", () =>
    {
        expect(() => generateClient(document({ "/a": { get: { operationId: "a", parameters: [{ $ref: "#/components/parameters/Missing" }], responses: ok } } }))).toThrow(/does not exist/);
        expect(() => generateClient(document({}, { schemas: { A: { $ref: "https://example.com/schema.json" } } }))).toThrow(/local schema references/);
    });
});
