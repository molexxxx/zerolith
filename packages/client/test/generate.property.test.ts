import * as fc from "fast-check";
import { parseAst } from "rolldown/parseAst";
import { describe, expect, it } from "vitest";
import { type OpenApiDocument, generateClient } from "@zerolith/client/generate";
import { escaped, escapes } from "../../../scripts/test/generated-code.ts";

/**
 * Randomized documents through the generator. Whatever a document names its
 * title, version, paths, operations, parameters, schemas, and properties,
 * and whatever its summaries and descriptions say, the module the
 * generator writes parses as TypeScript and holds none of the code the
 * payloads carry, which a name could only put there by escaping a string, a
 * comment, or a template. A document the generator refuses fails with one
 * of its own errors, never another exception.
 */

/** Names a generator might mishandle: empty, reserved, numeric, punctuation, path syntax, and characters outside ASCII. */
const awkward = fc.constantFrom("", "a", "x y", "constructor", "__proto__", "default", "class", "1abc", "-", ".", "{id}", "}", "{", "~1", "%20", String.fromCodePoint(0x1f600));

const names = fc.array(fc.oneof(escapes, awkward, fc.string({ maxLength: 6 })), { minLength: 1, maxLength: 3 }).map((parts) => parts.join(""));

const methods = ["get", "post", "put", "patch", "delete"] as const;

/** A JSON pointer token for a `$ref`. */
function pointer(name: string): string
{
    return encodeURIComponent(name.replaceAll("~", "~0").replaceAll("/", "~1"));
}

const documents = fc.record({
    title: names,
    version: names,
    operations: fc.array(fc.record({ path: names, method: fc.constantFrom(...methods), operationId: names, summary: names, description: names, parameter: names, query: names, schema: names, property: names }), { minLength: 1, maxLength: 3 })
}).map(({ title, version, operations }) =>
{
    const paths: Record<string, Record<string, unknown>> = {};
    const schemas: Record<string, unknown> = {};
    for (const operation of operations)
    {
        const path = `/${operation.path}/{${operation.parameter}}`;
        paths[path] = {
            ...paths[path],
            [operation.method]: {
                operationId: operation.operationId,
                summary: operation.summary,
                description: operation.description,
                parameters: [
                    { name: operation.parameter, in: "path", required: true, description: operation.description, schema: { type: "string" } },
                    { name: operation.query, in: "query", description: operation.summary, schema: { type: "integer" } }
                ],
                responses: { "200": { description: "ok", content: { "application/json": { schema: { $ref: `#/components/schemas/${pointer(operation.schema)}` } } } } }
            }
        };
        schemas[operation.schema] = { type: "object", description: operation.description, properties: { [operation.property]: { type: "string", description: operation.summary } }, required: [operation.property] };
    }
    return { openapi: "3.1.0", info: { title, version }, paths, components: { schemas } } as unknown as OpenApiDocument;
});


describe("generateClient under randomized documents", () =>
{
    it("writes a module that parses and runs nothing a name holds", () =>
    {
        fc.assert(fc.property(documents, (document) =>
        {
            let code: string;
            try
            {
                code = generateClient(document);
            }
            catch (error)
            {
                return error instanceof Error && error.message.startsWith("zerolith/client: ");
            }
            const program = parseAst(code, { lang: "ts", sourceType: "module" });
            expect(escaped(program), code).toBe(false);
            return true;
        }), { numRuns: 400 });
    });
});
