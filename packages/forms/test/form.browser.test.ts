import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Root, html, render } from "zerolith";
import { type Form, type FormOptions, type StandardSchema, createForm, problemResponse } from "@zerolith/forms";

let host: HTMLElement;
let root: Root | undefined;

beforeEach(() =>
{
    host = document.createElement("div");
    document.body.append(host);
});

afterEach(() =>
{
    root?.dispose();
    root = undefined;
    host.remove();
});

interface Harness
{
    form: Form;
    element: HTMLFormElement;
    requests: Request[];
    fetchMock: ReturnType<typeof vi.fn>;
}

function harness(responses: (() => Promise<Response>)[], options: Omit<FormOptions, "fetch"> = {}, attributes = "method=\"post\" action=\"/notes\""): Harness
{
    const requests: Request[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    {
        requests.push(new Request(input, init));
        const next = responses.shift();
        if (next === undefined)
        {
            throw new Error("no response queued");
        }
        return next();
    });
    const form = createForm({ ...options, fetch: fetchMock as unknown as typeof fetch });
    const template = document.createElement("template");
    template.innerHTML = `<form ${attributes}></form>`;
    const element = template.content.firstElementChild as HTMLFormElement;
    host.append(element);
    element.addEventListener("submit", (event) => form.submit(event));
    root = render(html`
        <input name="title" value="Hello" aria-invalid=${form.field("title").invalid}>
        <output data-testid="error">${form.field("title").error}</output>
        <button name="intent" value="save" ?disabled=${form.pending}>Save</button>`, element);
    return { form, element, requests, fetchMock };
}

function submit(element: HTMLFormElement): void
{
    element.requestSubmit(element.querySelector("button"));
}

async function settled(form: Form): Promise<void>
{
    await vi.waitFor(() =>
    {
        expect(form.pending.get()).toBe(false);
        expect(form.status.get()).not.toBe("idle");
    });
}

describe("createForm", () =>
{
    it("posts the form's data to its action with fetch and parses the JSON result", async () =>
    {
        const onSuccess = vi.fn();
        const { form, element, requests } = harness([() => Promise.resolve(Response.json({ id: 1 }, { status: 201 }))], { onSuccess });
        submit(element);
        expect(form.status.get()).toBe("pending");
        expect(element.querySelector("button")?.disabled).toBe(true);
        await settled(form);
        expect(form.status.get()).toBe("success");
        expect(form.result.get()).toEqual({ id: 1 });
        expect(element.querySelector("button")?.disabled).toBe(false);
        expect(onSuccess).toHaveBeenCalledTimes(1);
        const request = requests[0];
        expect(request?.method).toBe("POST");
        expect(new URL(request?.url ?? "").pathname).toBe("/notes");
        expect(request?.headers.get("content-type")).toContain("application/x-www-form-urlencoded");
        expect(request?.headers.get("accept")).toBe("application/json, application/problem+json");
        expect(await request?.text()).toBe("title=Hello&intent=save");
    });

    it("shows the fields of a problem+json response and clears them on the next success", async () =>
    {
        const onFailure = vi.fn();
        const { form, element } = harness([
            () => Promise.resolve(problemResponse({ title: "Invalid note", fields: { title: ["Too short", "Pick another"] } })),
            () => Promise.resolve(new Response(null, { status: 204 }))
        ], { onFailure });
        submit(element);
        await settled(form);
        expect(form.status.get()).toBe("failure");
        expect(form.problem.get()?.status).toBe(400);
        expect(form.field("title").errors.get()).toEqual(["Too short", "Pick another"]);
        expect(host.querySelector("[data-testid=\"error\"]")?.textContent).toBe("Too short");
        expect(host.querySelector("input")?.getAttribute("aria-invalid")).toBe("true");
        expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ title: "Invalid note" }), element);

        submit(element);
        await settled(form);
        expect(form.status.get()).toBe("success");
        expect(form.result.get()).toBeUndefined();
        expect(host.querySelector("[data-testid=\"error\"]")?.textContent).toBe("");
        expect(host.querySelector("input")?.getAttribute("aria-invalid")).toBe("false");
    });

    it("turns other failing responses into a problem", async () =>
    {
        const { form, element } = harness([() => Promise.resolve(new Response("nope", { status: 500, statusText: "Server Error" }))]);
        submit(element);
        await settled(form);
        expect(form.status.get()).toBe("failure");
        expect(form.problem.get()).toEqual({ status: 500, title: "Server Error" });
    });

    it("validates with a schema before sending anything", async () =>
    {
        const schema: StandardSchema<unknown, { title: string }> = {
            "~standard": {
                version: 1,
                vendor: "test",
                validate(value)
                {
                    const title = (value as { title?: unknown }).title;
                    return typeof title === "string" && title.length > 5 ? { value: { title } } : { issues: [{ message: "Needs six characters", path: ["title"] }] };
                }
            }
        };
        const { form, element, fetchMock } = harness([() => Promise.resolve(Response.json({ ok: true }))], { schema });
        submit(element);
        await settled(form);
        expect(form.status.get()).toBe("failure");
        expect(form.field("title").error.get()).toBe("Needs six characters");
        expect(fetchMock).not.toHaveBeenCalled();

        const input = element.querySelector("input") as HTMLInputElement;
        input.value = "Hello there";
        submit(element);
        await settled(form);
        expect(form.status.get()).toBe("success");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("hands a redirected response to navigate", async () =>
    {
        const navigate = vi.fn();
        const redirected = new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
        Object.defineProperties(redirected, { redirected: { value: true }, url: { value: "http://localhost/notes/1" } });
        const { form, element } = harness([() => Promise.resolve(redirected)], { navigate });
        submit(element);
        await settled(form);
        expect(form.status.get()).toBe("success");
        expect(form.result.get()).toBeUndefined();
        expect(navigate).toHaveBeenCalledWith("http://localhost/notes/1");
    });

    it("reports a request that never completed as an error", async () =>
    {
        const onError = vi.fn();
        const { form, element } = harness([() => Promise.reject(new TypeError("offline"))], { onError });
        submit(element);
        await settled(form);
        expect(form.status.get()).toBe("error");
        expect(form.error.get()).toBeInstanceOf(TypeError);
        expect(onError).toHaveBeenCalledTimes(1);
        form.reset();
        expect(form.status.get()).toBe("idle");
        expect(form.error.get()).toBeUndefined();
    });

    it("puts a GET form's data in the query string", async () =>
    {
        const { form, element, requests } = harness([() => Promise.resolve(Response.json([]))], {}, "method=\"get\" action=\"/search\"");
        submit(element);
        await settled(form);
        const request = requests[0];
        expect(request?.method).toBe("GET");
        expect(new URL(request?.url ?? "").search).toBe("?title=Hello&intent=save");
        expect(request?.body).toBeNull();
    });

    it("leaves dialog forms to the browser", () =>
    {
        const { element, fetchMock } = harness([], {}, "method=\"dialog\"");
        const event = new SubmitEvent("submit", { cancelable: true, bubbles: true });
        element.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("honors the submitter's overrides and resets the form after success when asked", async () =>
    {
        const { form, element, requests } = harness([() => Promise.resolve(Response.json({ saved: true }))], { reset: true });
        const button = element.querySelector("button") as HTMLButtonElement;
        button.setAttribute("formaction", "/drafts");
        button.setAttribute("formmethod", "post");
        button.setAttribute("formenctype", "multipart/form-data");
        const input = element.querySelector("input") as HTMLInputElement;
        input.value = "Changed";
        submit(element);
        await settled(form);
        const request = requests[0];
        expect(new URL(request?.url ?? "").pathname).toBe("/drafts");
        expect(request?.headers.get("content-type")).toContain("multipart/form-data");
        expect((await request?.formData())?.get("title")).toBe("Changed");
        expect(input.value).toBe("Hello");
    });

    it("drops a submission that a newer one replaced", async () =>
    {
        const onError = vi.fn();
        let abortFirst: (() => void) | undefined;
        const first = (): Promise<Response> => new Promise<Response>((_resolve, reject) =>
        {
            abortFirst = () => reject(new DOMException("aborted", "AbortError"));
        });
        const { form, element, requests } = harness([first, () => Promise.resolve(Response.json({ attempt: 2 }))], { onError });
        submit(element);
        await vi.waitFor(() => expect(requests).toHaveLength(1));
        requests[0]?.signal.addEventListener("abort", () => abortFirst?.());
        submit(element);
        await settled(form);
        expect(form.status.get()).toBe("success");
        expect(form.result.get()).toEqual({ attempt: 2 });
        expect(onError).not.toHaveBeenCalled();
    });
});
