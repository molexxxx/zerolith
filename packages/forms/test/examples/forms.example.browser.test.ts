// Executed examples for the forms guide: the form.
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Root, html, render } from "zerolith";
import { createForm, problemResponse } from "@zerolith/forms";
import { noteSchema } from "./note-schema.ts";

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() =>
{
    root?.dispose();
    host?.remove();
    vi.unstubAllGlobals();
});

describe("forms guide", () =>
{
    it("enhances a native form", async () =>
    {
        const responses = [problemResponse({ title: "Invalid note", fields: { title: ["That title exists already."] } }), Response.json({ id: 7 }, { status: 201 })];
        const fetchMock = vi.fn(() => Promise.resolve(responses.shift() ?? new Response(null, { status: 500 })));
        vi.stubGlobal("fetch", fetchMock);
        const saved: unknown[] = [];
        // #region form
        const noteForm = createForm({
            schema: noteSchema,
            onSuccess: ({ result }) => saved.push(result)
        });

        const view = html`
            <form method="post" action="/notes" @submit=${noteForm.submit}>
                <label>Title <input name="title" aria-invalid=${noteForm.field("title").invalid} aria-describedby="title-error"></label>
                <output id="title-error">${noteForm.field("title").error}</output>
                <button ?disabled=${noteForm.pending}>Save</button>
            </form>`;
        // #endregion form
        host = document.createElement("div");
        document.body.append(host);
        root = render(view, host);
        const form = host.querySelector("form") as HTMLFormElement;
        const input = host.querySelector("input") as HTMLInputElement;

        input.value = "x";
        form.requestSubmit();
        await vi.waitFor(() => expect(noteForm.status.get()).toBe("failure"));
        expect(host.querySelector("output")?.textContent).toBe("Give the note a title of at least two characters.");
        expect(input.getAttribute("aria-invalid")).toBe("true");
        expect(fetchMock).not.toHaveBeenCalled();

        input.value = "Routing";
        form.requestSubmit();
        await vi.waitFor(() => expect(noteForm.status.get()).toBe("failure"));
        expect(host.querySelector("output")?.textContent).toBe("That title exists already.");
        expect(fetchMock).toHaveBeenCalledTimes(1);

        form.requestSubmit();
        await vi.waitFor(() => expect(noteForm.status.get()).toBe("success"));
        expect(saved).toEqual([{ id: 7 }]);
        expect(host.querySelector("output")?.textContent).toBe("");
        expect(input.getAttribute("aria-invalid")).toBe("false");
    });
});
