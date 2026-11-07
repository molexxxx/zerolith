// Executed checks for the widget tutorial. Every file a step shows is a
// fixture under fixtures/widget, laid out as the reader's project is, and
// each step runs here the way it runs in the reader's browser. A page can
// define an element name once: the finished app's entry, which its own test
// file imports, defines feedback-widget, and each earlier step's element is
// defined under a name of its own, feedback-widget-<step>.
/// <reference types="zerolith/imports" />
/// <reference types="@zerolith/cli/assets" />
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReadableSignal, View } from "zerolith";
import { define } from "zerolith/element";
import { accessibilityIssues, cleanup, mount } from "@zerolith/test";
import { type OpenApiDocument, generateClient } from "@zerolith/client/generate";
import { feedbackHandler } from "../fixtures/widget/app/server/feedback.ts";
import type { Feedback } from "../fixtures/widget/app/src/api.ts";
import { FeedbackForm as SendingForm } from "../fixtures/widget/sending/src/components/feedback.ts";
import { FeedbackForm as EventsForm } from "../fixtures/widget/events/src/components/feedback.ts";
import contract from "../fixtures/widget/app/openapi.json?raw";
import proxy from "../fixtures/widget/app/zerolith.json?raw";
import elementPage from "../fixtures/widget/element/index.html?raw";
import appPage from "../fixtures/widget/app/index.html?raw";
import sitePage from "../fixtures/widget/embed/site/index.html?raw";
import plainStyles from "../fixtures/widget/element/src/styles.css?raw";
import themedStyles from "../fixtures/widget/app/src/styles.css?raw";

afterEach(() =>
{
    cleanup();
    vi.unstubAllGlobals();
    document.querySelectorAll("style[data-check]").forEach((style) => style.remove());
});

await import("../fixtures/widget/app/test/feedback.browser.test.ts");
const { default: generated } = await import("../fixtures/widget/app/src/api.ts?raw");
const { default: sendingApi } = await import("../fixtures/widget/sending/src/api.ts?raw");
const { default: eventsApi } = await import("../fixtures/widget/events/src/api.ts?raw");

/**
 * Loads a step's entry with the element it defines named
 * feedback-widget-<step>, and returns that name.
 */
async function defineStep(step: string, load: () => Promise<unknown>): Promise<string>
{
    const name = `feedback-widget-${step}`;
    const rename = (tag: string): string => (tag === "feedback-widget" ? name : tag);
    const { define: register, get } = CustomElementRegistry.prototype;
    customElements.define = (tag, constructor, options) => register.call(customElements, rename(tag), constructor, options);
    customElements.get = (tag) => get.call(customElements, rename(tag));
    try
    {
        await load();
    }
    finally
    {
        Reflect.deleteProperty(customElements, "define");
        Reflect.deleteProperty(customElements, "get");
    }
    return name;
}

type Form = (props: { api: ReadableSignal<unknown>; question: ReadableSignal<unknown>; page: ReadableSignal<unknown>; host: HTMLElement }) => View;

/** Defines `name` around a step's form, as the finished app's entry defines feedback-widget around its own. */
function defineForm(name: string, form: Form): string
{
    define(name, {
        props: ["api", "question", "page"],
        view: ({ api, question, page }, host) => form({ api, question, page, host })
    });
    return name;
}

const elementTag = await defineStep("element", () => import("../fixtures/widget/element/src/main.ts"));
const attributesTag = await defineStep("attributes", () => import("../fixtures/widget/attributes/src/main.ts"));
const sendingTag = defineForm("feedback-widget-sending", SendingForm);
const eventsTag = defineForm("feedback-widget-events", EventsForm);

/** Mounts a `tag` element with the attributes given and returns it. */
function widget(tag: string, attributes: Record<string, string> = {}): HTMLElement
{
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes))
    {
        element.setAttribute(name, value);
    }
    mount(element);
    return element;
}

/** Chooses an answer, writes a comment, focuses Send, and presses it. */
function answer(host: HTMLElement, choice: string, comment: string): void
{
    host.querySelector<HTMLInputElement>(`[value=${choice}]`)?.click();
    const field = host.querySelector("textarea");
    if (field !== null)
    {
        field.value = comment;
    }
    const send = host.querySelector("button");
    send?.focus();
    send?.click();
}

function status(host: HTMLElement): string | null | undefined
{
    return host.querySelector("[role=status]")?.textContent;
}

/** A backend that takes any request and answers 201 with a receipt. */
function accept(): Promise<Response>
{
    return Promise.resolve(Response.json({ id: "r1" }, { status: 201 }));
}

/** A fetch that answers with `handler` and keeps a copy of every request. */
function backend(handler: (request: Request) => Promise<Response>): Request[]
{
    const requests: Request[] = [];
    vi.stubGlobal("fetch", (request: Request) =>
    {
        requests.push(request.clone());
        return handler(request);
    });
    return requests;
}

/** A fetch that answers every request with `problem` and the status `code`. */
function problemFetch(problem: Record<string, unknown>, code: number): void
{
    const headers = { "content-type": "application/problem+json" };
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json(problem, { status: code, headers })));
}

/** Runs a page's inline script in a frame of its own and returns what it logs when the widget dispatches `type` with `detail`. */
function logsFromScript(page: string, type: string, detail: unknown): unknown[][]
{
    const parsed = new DOMParser().parseFromString(page, "text/html");
    const inline = [...parsed.querySelectorAll("script:not([src])")].map((script) => script.textContent).join("\n");
    const frame = document.createElement("iframe");
    document.body.append(frame);
    try
    {
        const view = frame.contentWindow as (Window & typeof globalThis);
        const logged: unknown[][] = [];
        view.console.log = (...values: unknown[]) => logged.push(values);
        const script = view.document.createElement("script");
        script.textContent = inline;
        view.document.body.append(script);
        const host = view.document.createElement("feedback-widget");
        view.document.body.append(host);
        host.dispatchEvent(new view.CustomEvent(type, { bubbles: true, detail }));
        return logged;
    }
    finally
    {
        frame.remove();
    }
}

function parse(page: string): Document
{
    return new DOMParser().parseFromString(page, "text/html");
}

/** The module scripts a page loads by their source. */
function moduleScripts(page: Document): string[]
{
    return [...page.querySelectorAll("script[type=module][src]")].map((script) => script.getAttribute("src") ?? "");
}

/** The WCAG contrast ratio of two colors the browser computed as rgb(). */
function contrast(first: string, second: string): number
{
    const luminance = (color: string): number =>
    {
        const [red = 0, green = 0, blue = 0] = (color.match(/\d+/g) ?? []).map(Number).map((part) =>
        {
            const scaled = part / 255;
            return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const [dark, light] = [luminance(first), luminance(second)].toSorted((a, b) => a - b) as [number, number];
    return (light + 0.05) / (dark + 0.05);
}

function addStyles(text: string): void
{
    const style = document.createElement("style");
    style.dataset["check"] = "";
    style.textContent = text;
    document.head.append(style);
}

describe("widget tutorial", () =>
{
    it("serves a development page that loads one entry and holds the element", () =>
    {
        const page = parse(elementPage);
        expect(moduleScripts(page)).toEqual(["/src/main.ts"]);
        expect(page.querySelector("link[rel=stylesheet]")?.getAttribute("href")).toBe("/src/styles.css");
        expect(page.querySelectorAll("body feedback-widget")).toHaveLength(1);
        expect(plainStyles).toContain("font: 1.125rem/1.6 Georgia, serif;");
    });

    it("defines the element, whose form lives in the page's own DOM", () =>
    {
        const host = widget(elementTag);
        expect(host.shadowRoot).toBeNull();
        expect(host.querySelector("legend")?.textContent).toBe("Did this page help?");
        const labels = [...host.querySelectorAll("label")].map((label) => label.textContent?.replace(/\s+/g, " ").trim());
        expect(labels).toEqual(["Yes", "No", "Comment, if you like"]);
        expect(host.querySelector("button")?.textContent).toBe("Send");
        expect(accessibilityIssues(host)).toEqual([]);
        const form = host.querySelector("form");
        expect(form?.checkValidity()).toBe(false);
        host.querySelector<HTMLInputElement>("[value=no]")?.click();
        expect(form?.checkValidity()).toBe(true);
        expect(form?.method).toBe("get");
        expect(form?.action).toBe(location.href);
        expect(host.querySelector("textarea")?.maxLength).toBe(1000);
        expect(() => define("feedback", { props: [], view: () => "" })).toThrow();
    });

    it("renders the view each time the element joins the page and disposes it when it leaves", () =>
    {
        const host = widget(elementTag);
        const parent = host.parentElement;
        host.remove();
        expect(host.querySelector("form")).toBeNull();
        parent?.append(host);
        expect(host.querySelectorAll("form")).toHaveLength(1);
    });

    it("follows the question as an attribute and as a property", () =>
    {
        const host = widget(attributesTag, { question: "Did this guide help?" }) as HTMLElement & { question: unknown };
        const legend = host.querySelector("legend");
        const form = host.querySelector("form");
        expect(legend?.textContent).toBe("Did this guide help?");
        host.setAttribute("question", "Was this useful?");
        expect(legend?.textContent).toBe("Was this useful?");
        expect(host.question).toBe("Was this useful?");
        host.question = "Did you find what you needed?";
        expect(legend?.textContent).toBe("Did you find what you needed?");
        expect(host.querySelector("legend")).toBe(legend);
        expect(host.querySelector("form")).toBe(form);
        host.question = 42;
        expect(legend?.textContent).toBe("Did this page help?");
        host.setAttribute("question", "  ");
        expect(legend?.textContent).toBe("Did this page help?");
        host.setAttribute("question", "Back again?");
        host.removeAttribute("question");
        expect(host.question).toBeUndefined();
        expect(legend?.textContent).toBe("Did this page help?");
    });

    it("generates the client module from the contract", () =>
    {
        expect(generateClient(JSON.parse(contract) as OpenApiDocument)).toBe(generated);
        expect([sendingApi, eventsApi]).toEqual([generated, generated]);
    });

    it("answers valid feedback with 201 and a receipt, keeping only the contract's members", async () =>
    {
        const saved: Feedback[] = [];
        const handle = feedbackHandler((feedback) => saved.push(feedback));
        const post = (body: unknown): Promise<Response> => handle(new Request("http://127.0.0.1:3000/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
        const created = await post({ helpful: true, page: "/install", comment: "Clear", extra: 1 });
        expect(created.status).toBe(201);
        expect(created.headers.get("access-control-allow-origin")).toBe("*");
        expect(await created.json()).toEqual({ id: expect.stringMatching(/^[\da-f-]{36}$/) });
        expect((await post({ helpful: false, page: "/install" })).status).toBe(201);
        expect((await post({ helpful: true, page: "p".repeat(2000), comment: "😀".repeat(1000) })).status).toBe(201);
        expect(saved).toEqual([
            { helpful: true, page: "/install", comment: "Clear" },
            { helpful: false, page: "/install" },
            { helpful: true, page: "p".repeat(2000), comment: "😀".repeat(1000) }
        ]);
    });

    it("answers invalid feedback with a problem that names each field", async () =>
    {
        const saved: Feedback[] = [];
        const handle = feedbackHandler((feedback) => saved.push(feedback));
        const send = (init: RequestInit, path = "/feedback"): Promise<Response> => handle(new Request(`http://127.0.0.1:3000${path}`, init));
        const invalid = await send({ method: "POST", body: JSON.stringify({ helpful: "yes", page: "", comment: "x".repeat(1001) }) });
        expect(invalid.status).toBe(400);
        expect(invalid.headers.get("content-type")).toBe("application/problem+json");
        expect(invalid.headers.get("access-control-allow-origin")).toBe("*");
        expect(await invalid.json()).toEqual({
            status: 400,
            title: "The feedback is not valid",
            fields: {
                helpful: ["Say whether the page helped: true or false."],
                page: ["Name the page in 1 to 2000 characters."],
                comment: ["Keep the comment to 1000 characters."]
            }
        });
        const tooLong = await send({ method: "POST", body: JSON.stringify({ helpful: true, page: "p".repeat(2001), comment: 7 }) });
        expect(Object.keys((await tooLong.json() as { fields: object }).fields)).toEqual(["page", "comment"]);
        const refused = await Promise.all(["{not json", "[]", "null", "\"text\""].map(async (body) => (await send({ method: "POST", body })).json()));
        expect(refused).toEqual(Array.from({ length: 4 }, () => ({ status: 400, title: "Send a JSON object" })));
        const get = await send({ method: "GET" });
        expect(get.status).toBe(405);
        expect(get.headers.get("allow")).toBe("POST, OPTIONS");
        expect((await send({ method: "POST", body: "{}" }, "/other")).status).toBe(404);
        expect(saved).toEqual([]);
    });

    it("answers the preflight a page on another origin sends", async () =>
    {
        const response = await feedbackHandler(() => undefined)(new Request("http://127.0.0.1:3000/feedback", { method: "OPTIONS", headers: { origin: "http://127.0.0.1:8000", "access-control-request-method": "POST" } }));
        expect(response.status).toBe(204);
        expect(Object.fromEntries(response.headers)).toEqual({
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST",
            "access-control-allow-headers": "content-type"
        });
    });

    it("forwards /api to the example handler, which zerolith dev starts", () =>
    {
        expect(JSON.parse(proxy)).toEqual({
            $schema: "./node_modules/@zerolith/cli/zerolith.schema.json",
            proxy: { "/api": { target: "http://127.0.0.1:3000", stripPrefix: true, run: "node server/main.ts" } }
        });
    });

    it("sends the answer as JSON to the api, says it is sending, and ignores a second press meanwhile", async () =>
    {
        const requests = backend(accept);
        const host = widget(sendingTag, { api: "https://feedback.example/v1" });
        answer(host, "no", "  Too long.  ");
        const send = host.querySelector("button");
        expect(host.querySelector("[role=status]")?.getAttribute("tabindex")).toBe("-1");
        expect(send?.getAttribute("aria-disabled")).toBe("true");
        expect(send?.disabled).toBe(false);
        expect(status(host)).toBe("Sending your feedback.");
        host.querySelector("form")?.requestSubmit();
        await vi.waitFor(() => expect(status(host)).toBe("Thanks for your feedback."));
        expect(requests).toHaveLength(1);
        const [request] = requests;
        expect(request?.url).toBe("https://feedback.example/v1/feedback");
        expect(request?.method).toBe("POST");
        expect(request?.headers.get("content-type")).toBe("application/json");
        expect(request?.credentials).toBe("same-origin");
        const page = location.origin + location.pathname;
        expect(await request?.json()).toEqual({ helpful: false, page, comment: "Too long." });
        expect(host.querySelector("form")).toBeNull();
        expect(document.activeElement).toBe(host.querySelector("[role=status]"));
    });

    it("keeps the empty status line on the page before there is anything to say", () =>
    {
        const host = widget(sendingTag, { api: "/api" });
        expect(status(host)).toBe("");
    });

    it("sends the page attribute, leaves out an empty comment, and keeps focus where it was", async () =>
    {
        const requests = backend(accept);
        const host = widget(sendingTag, { api: "/api", page: "guide/install" });
        host.querySelector<HTMLInputElement>("[value=yes]")?.click();
        const outside = document.createElement("button");
        document.body.append(outside);
        outside.focus();
        host.querySelector("button")?.click();
        await vi.waitFor(() => expect(status(host)).toBe("Thanks for your feedback."));
        expect(new URL(requests[0]?.url ?? "").pathname).toBe("/api/feedback");
        expect(await requests[0]?.json()).toEqual({ helpful: true, page: "guide/install" });
        expect(document.activeElement).toBe(outside);
        outside.remove();
    });

    it("says why feedback was not sent and keeps the form to try again", async () =>
    {
        problemFetch({ title: "Too much feedback", detail: "Try again in a minute.", status: 429 }, 429);
        const host = widget(sendingTag, { api: "/api" });
        answer(host, "yes", "");
        await vi.waitFor(() => expect(status(host)).toBe("Not sent: Try again in a minute."));
        const send = host.querySelector("button");
        expect(send?.getAttribute("aria-disabled")).toBe("false");
        expect(document.activeElement).toBe(send);
        problemFetch({ title: "Too much feedback", status: 429 }, 429);
        send?.click();
        await vi.waitFor(() => expect(status(host)).toBe("Not sent: Too much feedback"));
        vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
        send?.click();
        await vi.waitFor(() => expect(status(host)).toBe("Not sent: The feedback service could not be reached"));
        vi.stubGlobal("fetch", () => Promise.resolve(new Response("<h1>Bad gateway</h1>", { status: 502, statusText: "Bad Gateway", headers: { "content-type": "text/html" } })));
        send?.click();
        await vi.waitFor(() => expect(status(host)).toBe("Not sent: Bad Gateway"));
        expect(host.querySelector("form")).not.toBeNull();
    });

    it("sends nothing when the page names no api", () =>
    {
        const fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);
        const host = widget(sendingTag);
        answer(host, "yes", "");
        expect(status(host)).toBe("Not sent: The page names no api to send it to");
        expect(fetch).not.toHaveBeenCalled();
    });

    it("dispatches feedback-sent with the feedback and its receipt", async () =>
    {
        backend(feedbackHandler(() => undefined));
        const host = widget(eventsTag, { api: "https://feedback.example" });
        const events: CustomEvent[] = [];
        const listen = (event: Event): void =>
        {
            events.push(event as CustomEvent);
        };
        document.addEventListener("feedback-sent", listen);
        answer(host, "yes", "Clear");
        await vi.waitFor(() => expect(events).toHaveLength(1));
        document.removeEventListener("feedback-sent", listen);
        const [event] = events;
        expect(event?.target).toBe(host);
        expect(event?.bubbles).toBe(true);
        expect(event?.composed).toBe(true);
        expect(event?.detail).toEqual({ helpful: true, page: location.origin + location.pathname, comment: "Clear", id: expect.any(String) });
    });

    it("dispatches feedback-failed with the problem", async () =>
    {
        problemFetch({ title: "Too much feedback" }, 429);
        const host = widget(eventsTag, { api: "/api" });
        const failed: unknown[] = [];
        host.parentElement?.addEventListener("feedback-failed", (event) =>
        {
            failed.push((event as CustomEvent).detail);
        });
        answer(host, "no", "");
        await vi.waitFor(() => expect(failed).toEqual([{ title: "Too much feedback", status: 429 }]));
        const missing: unknown[] = [];
        const bare = widget(eventsTag);
        bare.addEventListener("feedback-failed", (event) => missing.push((event as CustomEvent).detail));
        answer(bare, "no", "");
        expect(missing).toEqual([{ title: "The page names no api to send it to" }]);
    });

    it("logs the events on the development page", () =>
    {
        const page = parse(appPage);
        expect(moduleScripts(page)).toEqual(["/src/main.ts"]);
        const element = page.querySelector("feedback-widget");
        expect(element?.getAttribute("api")).toBe("/api");
        expect(element?.getAttribute("question")).toBe("Did this guide help?");
        expect(logsFromScript(appPage, "feedback-sent", { id: "7" })).toEqual([["feedback-sent", { id: "7" }]]);
        expect(logsFromScript(appPage, "feedback-failed", { title: "Gone" })).toEqual([["feedback-failed", { title: "Gone" }]]);
    });

    it("keeps its styles inside the element and takes the theme from custom properties", () =>
    {
        const host = widget("feedback-widget", { api: "/api" });
        const button = host.querySelector("button") as HTMLButtonElement;
        expect(getComputedStyle(button).backgroundColor).toBe("rgb(31, 95, 209)");
        expect(getComputedStyle(button).borderRadius).toBe("8px");
        expect(getComputedStyle(host.querySelector("input") as HTMLElement).accentColor).toBe("rgb(31, 95, 209)");
        const outside = document.createElement("button");
        host.parentElement?.append(outside);
        expect(getComputedStyle(outside).backgroundColor).not.toBe("rgb(31, 95, 209)");
        host.style.setProperty("--feedback-accent", "#0f766e");
        expect(getComputedStyle(button).backgroundColor).toBe("rgb(15, 118, 110)");
        host.style.removeProperty("--feedback-accent");
        host.parentElement?.style.setProperty("--feedback-accent", "#b91c1c");
        expect(getComputedStyle(button).backgroundColor).toBe("rgb(185, 28, 28)");
        addStyles(themedStyles);
        expect(getComputedStyle(button).backgroundColor).toBe("rgb(109, 40, 217)");
        expect(getComputedStyle(button).borderRadius).toBe("0px");
    });

    it("adds its rules to the page once, however many widgets it holds", () =>
    {
        widget("feedback-widget");
        const sheets = document.adoptedStyleSheets.length;
        const second = widget("feedback-widget");
        expect(second.firstElementChild?.className).toContain("zl-");
        expect(document.adoptedStyleSheets).toHaveLength(sheets);
    });

    it("takes the page's font, and the page's own rules reach in", () =>
    {
        const host = widget("feedback-widget", { api: "/api" });
        host.parentElement?.style.setProperty("font-family", "Georgia, serif");
        const button = host.querySelector("button") as HTMLButtonElement;
        expect(getComputedStyle(button).fontFamily).toBe("Georgia, serif");
        expect(getComputedStyle(host.querySelector("textarea") as HTMLElement).fontFamily).toBe("Georgia, serif");
        addStyles("button { text-transform: uppercase; }");
        expect(getComputedStyle(button).textTransform).toBe("uppercase");
        document.querySelector("style[data-check]")?.remove();
        addStyles("button:not(feedback-widget button) { text-transform: uppercase; }");
        expect(getComputedStyle(button).textTransform).toBe("none");
    });

    it("keeps its default colors and the development page's accent at a contrast of 4.5 to 1", () =>
    {
        const host = widget("feedback-widget", { api: "/api" });
        const button = host.querySelector("button") as HTMLButtonElement;
        const panel = host.firstElementChild as HTMLElement;
        const label = (): number => contrast(getComputedStyle(button).color, getComputedStyle(button).backgroundColor);
        expect(contrast(getComputedStyle(panel).color, getComputedStyle(panel).backgroundColor)).toBeGreaterThanOrEqual(4.5);
        expect(label()).toBeGreaterThanOrEqual(4.5);
        addStyles(themedStyles);
        expect(label()).toBeGreaterThanOrEqual(4.5);
    });

    it("dims Send while sending and fits a narrow column", async () =>
    {
        backend(feedbackHandler(() => undefined));
        const host = widget("feedback-widget", { api: "https://feedback.example" });
        const parent = host.parentElement as HTMLElement;
        parent.style.width = "16rem";
        expect(parent.scrollWidth).toBeLessThanOrEqual(parent.clientWidth);
        answer(host, "yes", "");
        expect(getComputedStyle(host.querySelector("button") as HTMLElement).opacity).toBe("0.6");
        await vi.waitFor(() => expect(status(host)).toBe("Thanks for your feedback."));
    });

    it("replaces the text the element held", () =>
    {
        const element = document.createElement("feedback-widget");
        element.setAttribute("api", "https://feedback.example");
        element.textContent = "Fallback";
        mount(element);
        expect(element.textContent).not.toContain("Fallback");
        expect(element.querySelectorAll("form")).toHaveLength(1);
    });

    it("keeps its styles inside a shadow root, and reports from there", async () =>
    {
        backend(feedbackHandler(() => undefined));
        const outer = document.createElement("div");
        const shadowRoot = outer.attachShadow({ mode: "open" });
        const host = document.createElement("feedback-widget");
        host.setAttribute("api", "https://feedback.example");
        shadowRoot.append(host);
        mount(outer);
        const button = host.querySelector("button") as HTMLButtonElement;
        expect(getComputedStyle(button).backgroundColor).toBe("rgb(31, 95, 209)");
        const heard: unknown[] = [];
        const listen = (event: Event): void =>
        {
            heard.push((event as CustomEvent).detail);
        };
        document.addEventListener("feedback-sent", listen);
        answer(host, "yes", "");
        await vi.waitFor(() => expect(heard).toHaveLength(1));
        document.removeEventListener("feedback-sent", listen);
    });

    it("embeds the built script in a plain page that posts to the handler", async () =>
    {
        const page = parse(sitePage);
        expect(moduleScripts(page)).toEqual(["feedback-widget.js"]);
        expect(page.querySelector("style")?.textContent).toContain("--feedback-accent: #0f766e;");
        const requests = backend(feedbackHandler(() => undefined));
        const { container } = mount(document.importNode(page.querySelector("feedback-widget") as Element, true));
        const host = container.querySelector("feedback-widget") as HTMLElement;
        expect(host.querySelector("legend")?.textContent).toBe("Were these notes useful?");
        answer(host, "yes", "");
        await vi.waitFor(() => expect(status(host)).toBe("Thanks for your feedback."));
        expect(requests[0]?.url).toBe("http://127.0.0.1:3000/feedback");
        expect(logsFromScript(sitePage, "feedback-sent", { id: "7" })).toEqual([["feedback-sent", { id: "7" }]]);
    });
});
