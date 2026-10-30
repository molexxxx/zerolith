// Executed examples for the forms guide: the form.
import { afterEach, describe, expect, it, vi } from "vitest";
import { html, render } from "zerolith";
import { createForm, problemResponse } from "@zerolith/forms";
import { noteSchema } from "./note-schema.ts";

let host: HTMLElement | undefined;

afterEach(() =>
{
    host?.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("forms guide", () =>
{
    it("enhances a native form", async () =>
    {
        const responses = [problemResponse({ title: "Invalid note", fields: { title: ["That title exists already."] } }), Response.json({ id: 7, title: "Routing" }, { status: 201 })];
        const fetchMock = vi.fn(() => Promise.resolve(responses.shift() ?? new Response(null, { status: 500 })));
        vi.stubGlobal("fetch", fetchMock);
        const created: unknown[] = [];
        vi.spyOn(console, "log").mockImplementation((...values: unknown[]) =>
        {
            created.push(values);
        });
        host = document.createElement("main");
        host.id = "app";
        document.body.append(host);
        // #region form
        const noteForm = createForm({
            schema: noteSchema,
            reset: true,
            onSuccess: ({ result }) => console.log("created", result)
        });

        render(html`
            <form method="post" action="/notes" @submit=${noteForm.submit}>
                <label>Title
                    <input name="title" aria-describedby="title-error"
                        aria-invalid=${noteForm.field("title").invalid}>
                </label>
                <output id="title-error">${noteForm.field("title").error}</output>
                <button ?disabled=${noteForm.pending}>Save</button>
            </form>`, "#app");
        // #endregion form
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
        expect(created).toEqual([["created", { id: 7, title: "Routing" }]]);
        expect(host.querySelector("output")?.textContent).toBe("");
        expect(input.getAttribute("aria-invalid")).toBe("false");
        expect(input.value).toBe("");
    });
});
