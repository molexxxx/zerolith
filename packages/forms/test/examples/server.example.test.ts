// Executed examples for the forms guide: the server side.
import { describe, expect, it } from "vitest";
import { problemResponse, validateForm } from "@zerolith/forms";
import { type Note, noteSchema } from "./note-schema.ts";

// #region server
const notes: (Note & { id: number })[] = [];

async function createNote(request: Request): Promise<Response>
{
    const validation = await validateForm(noteSchema, await request.formData());
    if (validation.problem !== undefined)
    {
        return problemResponse(validation.problem);
    }
    const note = { id: notes.length + 1, ...validation.value };
    notes.push(note);
    return Response.json(note, { status: 201 });
}
// #endregion server

function post(fields: Record<string, string>): Request
{
    const body = new URLSearchParams(fields);
    return new Request("http://localhost/notes", { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } });
}

describe("forms guide: server", () =>
{
    it("answers an invalid submission with problem+json and a valid one with the created note", async () =>
    {
        const failed = await createNote(post({ title: "x" }));
        expect(failed.status).toBe(400);
        expect(failed.headers.get("content-type")).toBe("application/problem+json; charset=utf-8");
        await expect(failed.json()).resolves.toMatchObject({ fields: { title: ["Give the note a title of at least two characters."] } });

        const created = await createNote(post({ title: "  Routing  " }));
        expect(created.status).toBe(201);
        await expect(created.json()).resolves.toEqual({ id: 1, title: "Routing" });
    });
});
