import { describe, expect, it } from "vitest";
import { type StandardSchema, formValues, isProblem, problemFromIssues, problemResponse, validateForm } from "@zerolith/forms";

describe("formValues", () =>
{
    it("keeps single values flat and collects repeated names into arrays in order", () =>
    {
        const data = new FormData();
        data.append("title", "One");
        data.append("tag", "a");
        data.append("tag", "b");
        data.append("tag", "c");
        expect(formValues(data)).toEqual({ title: "One", tag: ["a", "b", "c"] });
    });
});

describe("validateForm", () =>
{
    const schema: StandardSchema<unknown, { title: string }> = {
        "~standard": {
            version: 1,
            vendor: "test",
            validate(value)
            {
                const record = value as { title?: unknown; items?: unknown };
                const issues = [];
                if (typeof record.title !== "string" || record.title.length < 2)
                {
                    issues.push({ message: "Title needs two characters", path: [{ key: "title" }] });
                }
                if (record.items !== undefined)
                {
                    issues.push({ message: "Name is required", path: ["items", 0, "name"] });
                    issues.push({ message: "Too many items" });
                }
                return issues.length > 0 ? { issues } : { value: { title: record.title as string } };
            }
        }
    };

    it("resolves the parsed value for valid form data", async () =>
    {
        const data = new FormData();
        data.append("title", "Hello");
        await expect(validateForm(schema, data)).resolves.toEqual({ value: { title: "Hello" } });
    });

    it("groups issues by path into fields and the rest into detail", async () =>
    {
        const outcome = await validateForm(schema, { title: "", items: [{}] });
        expect(outcome.value).toBeUndefined();
        expect(outcome.problem).toEqual({
            type: "about:blank",
            title: "The submission has invalid fields",
            status: 400,
            detail: "Too many items",
            fields: { title: ["Title needs two characters"], "items.0.name": ["Name is required"] }
        });
    });

    it("accepts async schemas", async () =>
    {
        const async: StandardSchema<unknown, number> = {
            "~standard": { version: 1, vendor: "test", validate: () => Promise.resolve({ value: 42 }) }
        };
        await expect(validateForm(async, {})).resolves.toEqual({ value: 42 });
    });

    it("leaves detail out when every issue has a path", () =>
    {
        expect(problemFromIssues([{ message: "x", path: ["a"] }])).not.toHaveProperty("detail");
    });
});

describe("problemResponse", () =>
{
    it("writes the problem with its media type and status", async () =>
    {
        const response = problemResponse({ title: "Invalid", fields: { title: ["Too short"] } });
        expect(response.status).toBe(400);
        expect(response.headers.get("content-type")).toBe("application/problem+json; charset=utf-8");
        await expect(response.json()).resolves.toEqual({ title: "Invalid", status: 400, fields: { title: ["Too short"] } });
    });

    it("lets init override the status", () =>
    {
        expect(problemResponse({ title: "Conflict", status: 409 }, { status: 422 }).status).toBe(422);
        expect(problemResponse({ title: "Conflict", status: 409 }).status).toBe(409);
    });
});

describe("isProblem", () =>
{
    it("recognizes documents with a typed member and rejects the rest", () =>
    {
        expect(isProblem({ title: "x" })).toBe(true);
        expect(isProblem({ status: 404 })).toBe(true);
        expect(isProblem({ fields: {} })).toBe(true);
        expect(isProblem({ title: 1 })).toBe(false);
        expect(isProblem({ fields: [] })).toBe(false);
        expect(isProblem(null)).toBe(false);
        expect(isProblem("problem")).toBe(false);
        expect(isProblem({ message: "x" })).toBe(false);
    });
});
