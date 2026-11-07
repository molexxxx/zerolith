// Executed checks for the sign-up form tutorial. Every file a step shows is
// a fixture under fixtures/sign-up-form, laid out as the reader's project
// is, and each step's page runs here the way it runs in the reader's
// browser. The finished app's own test file runs here too; its hooks answer
// every request with the server's answer function, in place of the network,
// unless a check replaces fetch itself.
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { problemResponse, validateForm } from "@zerolith/forms";
import { createRouter } from "@zerolith/router";
import { accessibilityIssues, cleanup, mount } from "@zerolith/test";
import { routes } from "../fixtures/sign-up-form/form/src/routes.ts";
import { SignUp as FormPage } from "../fixtures/sign-up-form/form/src/components/sign-up.ts";
import { SignUp as RulesPage } from "../fixtures/sign-up-form/rules/src/components/sign-up.ts";
import { SignUp as TypingPage } from "../fixtures/sign-up-form/typing/src/components/sign-up.ts";
import { SignUp as SendingPage } from "../fixtures/sign-up-form/sending/src/components/sign-up.ts";
import { SignUp as AppPage } from "../fixtures/sign-up-form/app/src/components/sign-up.ts";
import { answer } from "../fixtures/sign-up-form/app/server/sign-ups.ts";
import { signUpSchema } from "../fixtures/sign-up-form/app/src/schema.ts";
import type * as SignUps from "../fixtures/sign-up-form/app/server/sign-ups.ts";

afterEach(() =>
{
    cleanup();
    vi.unstubAllGlobals();
});

await import("../fixtures/sign-up-form/app/test/sign-up.browser.test.ts");

function field(container: HTMLElement, name: string): HTMLInputElement
{
    const input = container.querySelector<HTMLInputElement>(`[name=${name}]`);
    if (input === null)
    {
        throw new Error(`the form has no field named ${name}`);
    }
    return input;
}

/** Types into a field as a person does: the value, then an input event. */
function type(container: HTMLElement, name: string, value: string): void
{
    const input = field(container, name);
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

function message(container: HTMLElement, name: string): string
{
    return container.querySelector(`#${name}-message`)?.textContent ?? "";
}

/** Every field's message, by field name. */
function messages(container: HTMLElement): Record<string, string>
{
    const names = ["name", "email", "password", "plan", "terms"];
    return Object.fromEntries(names.map((name) => [name, message(container, name)]));
}

/** Fills in a sign-up that passes every rule, for `name` and `email`. */
function fillIn(container: HTMLElement, name: string, email: string, plan = "team"): void
{
    type(container, "name", name);
    type(container, "email", email);
    type(container, "password", "compilers-in-1952");
    container.querySelector<HTMLInputElement>(`[value=${plan}]`)?.click();
    field(container, "terms").click();
}

function submit(container: HTMLElement): void
{
    container.querySelector("form")?.requestSubmit();
}

function button(container: HTMLElement): HTMLButtonElement
{
    const found = container.querySelector("button");
    if (found === null)
    {
        throw new Error("the form has no button");
    }
    return found;
}

/** What the announcer's polite region says, once its next task has run. */
function announced(): string
{
    return document.querySelector("[aria-live=polite]")?.textContent ?? "";
}

/** Empties the polite region, so a check sees only what comes after. */
function quiet(): void
{
    const region = document.querySelector("[aria-live=polite]");
    if (region !== null)
    {
        region.textContent = "";
    }
}

/** A fetch whose answers wait until `release` is called, then come from `respond`, the server's answer function unless given. */
function held(respond: (request: Request) => Promise<Response> = answer): { release: () => void; requests: Request[] }
{
    const requests: Request[] = [];
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) =>
    {
        release = resolve;
    });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) =>
    {
        const request = new Request(input, init);
        requests.push(request.clone());
        await gate;
        return respond(request);
    });
    return { release: () => release(), requests };
}

const empty = { name: "Enter your name.", email: "Enter an email address like name@example.com.", password: "Choose a password.", plan: "Choose a plan.", terms: "Accept the terms to create your account." };
const none = { name: "", email: "", password: "", plan: "", terms: "" };
const unsent = "The sign-up did not go through. Try again in a moment.";

describe("sign-up form tutorial", () =>
{
    describe("the form", () =>
    {
        it("adds the sign-up page to the route table, with its title", async () =>
        {
            const router = createRouter(routes, { window: null });
            await router.navigate("/sign-up");
            const { container } = mount(router.outlet());
            expect(container.querySelector("h1")?.textContent).toBe("Create your account");
            expect(router.head.get().title).toBe("Sign up");
            router.dispose();
        });

        it("labels every control, names the plans by their legend, and tells the browser how to fill each field", () =>
        {
            const { container } = mount(FormPage());
            expect(accessibilityIssues(container)).toEqual([]);
            expect([...container.querySelectorAll("input")].map((input) => input.labels?.[0]?.textContent?.replace(/\s+/g, " ").trim())).toEqual(["Name", "Email", "Password", "Free: three notebooks, no charge", "Plus: unlimited notebooks, $4 a month", "Team: shared notebooks, $8 a user a month", "I accept the terms of service"]);
            expect(container.querySelector("fieldset legend")?.textContent).toBe("Plan");
            expect(["name", "email", "password"].map((name) => field(container, name).autocomplete)).toEqual(["name", "email", "new-password"]);
            const form = container.querySelector("form");
            expect(form?.method).toBe("post");
            expect(new URL(form?.action ?? "").pathname).toBe("/api/sign-ups");
        });

        it("focuses a field or checks a control when you click its label, and submits when you press Enter", async () =>
        {
            const { container } = mount(FormPage());
            const form = container.querySelector("form") as HTMLFormElement;
            const submitted = vi.fn((event: Event) => event.preventDefault());
            form.addEventListener("submit", submitted);
            await userEvent.click(container.querySelector("label[for=name]") as HTMLElement);
            expect(document.activeElement).toBe(field(container, "name"));
            await userEvent.click(container.querySelector("input[value=plus]")?.closest("label") as HTMLElement);
            expect(container.querySelector<HTMLInputElement>("input[value=plus]")?.checked).toBe(true);
            await userEvent.click(field(container, "terms").closest("label") as HTMLElement);
            expect(field(container, "terms").checked).toBe(true);
            type(container, "name", "Grace Hopper");
            type(container, "email", "grace@example.com");
            type(container, "password", "compilers-in-1952");
            field(container, "name").focus();
            await userEvent.keyboard("{Enter}");
            expect(submitted).toHaveBeenCalledTimes(1);
        });

        it("lets the browser refuse a form with a field missing or an email address it does not accept", () =>
        {
            const { container } = mount(FormPage());
            const form = container.querySelector("form") as HTMLFormElement;
            const sent: string[] = [];
            form.addEventListener("submit", (event) =>
            {
                event.preventDefault();
                sent.push(String(new URLSearchParams([...new FormData(form)].map(([name, value]) => [name, String(value)]))));
            });
            form.requestSubmit();
            expect(sent).toEqual([]);
            expect(document.activeElement).toBe(field(container, "name"));
            fillIn(container, "Grace Hopper", "grace");
            expect(field(container, "email").validity.typeMismatch).toBe(true);
            form.requestSubmit();
            expect(sent).toEqual([]);
            expect(document.activeElement).toBe(field(container, "email"));
            type(container, "email", "grace@example.com");
            form.requestSubmit();
            expect(sent).toEqual(["name=Grace+Hopper&email=grace%40example.com&password=compilers-in-1952&plan=team&terms=accepted"]);
        });
    });

    describe("rules on submit", () =>
    {
        it("checks every rule on submit, says what to change next to each field, and sends nothing", async () =>
        {
            const sending = vi.fn(answer);
            vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => sending(new Request(input, init)));
            const { container } = mount(RulesPage());
            expect(messages(container)).toEqual(none);
            expect(container.querySelector("form")?.noValidate).toBe(true);
            submit(container);
            await vi.waitFor(() => expect(messages(container)).toEqual(empty));
            expect(["name", "email", "password", "terms"].map((name) => field(container, name).getAttribute("aria-invalid"))).toEqual(["true", "true", "true", "true"]);
            expect(["name", "email", "password", "terms"].map((name) => field(container, name).getAttribute("aria-describedby"))).toEqual(["name-message", "email-message", "password-message", "terms-message"]);
            expect(container.querySelector("fieldset")?.getAttribute("aria-describedby")).toBe("plan-message");
            expect(sending).not.toHaveBeenCalled();
            expect(accessibilityIssues(container)).toEqual([]);
        });

        it("keeps each message until the next submission, which checks again", async () =>
        {
            vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 405, statusText: "Method Not Allowed" })));
            const { container } = mount(RulesPage());
            submit(container);
            await vi.waitFor(() => expect(messages(container)).toEqual(empty));
            type(container, "name", "Grace Hopper");
            expect(message(container, "name")).toBe("Enter your name.");
            type(container, "password", "ada");
            submit(container);
            await vi.waitFor(() => expect(message(container, "password")).toBe("Use at least 15 characters."));
            expect(message(container, "name")).toBe("");
            expect(field(container, "name").getAttribute("aria-invalid")).toBe("false");
        });

        it("sends a form that passes the way the browser would, and shows nothing while no server answers", async () =>
        {
            const requests: Request[] = [];
            vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
            {
                requests.push(new Request(input, init));
                return Promise.resolve(new Response(null, { status: 405, statusText: "Method Not Allowed" }));
            });
            const { container } = mount(RulesPage());
            fillIn(container, "Grace Hopper", "grace@example.com");
            submit(container);
            await vi.waitFor(() => expect(requests).toHaveLength(1));
            await new Promise((resolve) => setTimeout(resolve, 20));
            const [request] = requests;
            expect(request?.method).toBe("POST");
            expect(new URL(request?.url ?? "").pathname).toBe("/api/sign-ups");
            expect(request?.headers.get("content-type")).toContain("application/x-www-form-urlencoded");
            expect(request?.headers.get("accept")).toBe("application/json, application/problem+json");
            expect(await request?.text()).toBe("name=Grace+Hopper&email=grace%40example.com&password=compilers-in-1952&plan=team&terms=accepted");
            expect(messages(container)).toEqual(none);
            expect(container.textContent).not.toContain("Method Not Allowed");
        });

        it("holds a submission to the rules that schema.ts states, in the browser and on the server alike", async () =>
        {
            const check = async (values: Record<string, unknown>): Promise<unknown> =>
            {
                const result = await validateForm(signUpSchema, values);
                return result.problem?.fields ?? result.value;
            };
            const good = { name: "  Grace Hopper ", email: " grace@example.com ", password: " compilers-in-1952", plan: "team", terms: "accepted" };
            expect(await check(good)).toEqual({ name: "Grace Hopper", email: "grace@example.com", password: " compilers-in-1952", plan: "team" });
            const form = new FormData();
            for (const [name, value] of Object.entries(good))
            {
                form.append(name, value);
            }
            expect((await validateForm(signUpSchema, form)).value?.name).toBe("Grace Hopper");
            expect(await check({})).toEqual(Object.fromEntries(Object.entries(empty).map(([name, text]) => [name, [text]])));
            expect(await check({ ...good, name: "   " })).toEqual({ name: ["Enter your name."] });
            for (const email of ["grace", "grace@example", "grace @example.com", "@example.com", "grace@@example.com"])
            {
                expect(await check({ ...good, email })).toEqual({ email: ["Enter an email address like name@example.com."] });
            }
            expect(await check({ ...good, password: "compilers-in-" })).toEqual({ password: ["Use at least 15 characters."] });
            expect(await check({ ...good, password: "🔑".repeat(14) })).toEqual({ password: ["Use at least 15 characters."] });
            expect(await check({ ...good, password: "🔑".repeat(15) })).toHaveProperty("plan", "team");
            expect(await check({ ...good, password: "x-GRACE@example.com" })).toEqual({ password: ["Use a password that does not contain your email address."] });
            expect(await check({ ...good, email: "GRACE@example.com", password: "x-grace@example.com" })).toEqual({ password: ["Use a password that does not contain your email address."] });
            for (const plan of ["gold", "", undefined, ["team", "plus"]])
            {
                expect(await check({ ...good, plan })).toEqual({ plan: ["Choose a plan."] });
            }
            for (const terms of ["on", "yes", undefined])
            {
                expect(await check({ ...good, terms })).toEqual({ terms: ["Accept the terms to create your account."] });
            }
            expect(await check({ ...good, name: 7, email: ["grace@example.com"] })).toEqual({ name: ["Enter your name."], email: ["Enter an email address like name@example.com."] });
            const result = await signUpSchema["~standard"].validate(null);
            expect(result.issues?.length).toBe(5);
        });
    });

    describe("checking as you type", () =>
    {
        it("ticks off each password rule as you type, in words for assistive technology", () =>
        {
            const { container } = mount(TypingPage());
            const state = (): string[] => [...container.querySelectorAll("#password-hint li")].map((row) => `${row.getAttribute("data-met")} ${row.textContent?.replace(/\s+/g, " ").trim()}`);
            expect(field(container, "password").getAttribute("aria-describedby")).toBe("password-message password-hint");
            expect(container.querySelector("#password-hint .mark")?.getAttribute("aria-hidden")).toBe("true");
            expect(container.querySelector("#password-hint li span:not(.mark)")?.getBoundingClientRect().width).toBeLessThanOrEqual(1);
            expect(state()).toEqual(["false ○ Not met: At least 15 characters", "false ○ Not met: Does not contain your email address"]);
            type(container, "password", "compilers");
            expect(state()).toEqual(["false ○ Not met: At least 15 characters", "true ✓ Met: Does not contain your email address"]);
            type(container, "email", "Compilers@example.com");
            type(container, "password", "compilers@example.com");
            expect(state()).toEqual(["true ✓ Met: At least 15 characters", "false ○ Not met: Does not contain your email address"]);
            type(container, "email", "grace@example.com");
            expect(state()).toEqual(["true ✓ Met: At least 15 characters", "true ✓ Met: Does not contain your email address"]);
            expect(accessibilityIssues(container)).toEqual([]);
        });

        it("says nothing about a field while you type before the first submission", () =>
        {
            const { container } = mount(TypingPage());
            type(container, "email", "g");
            type(container, "password", "short");
            expect(messages(container)).toEqual(none);
        });

        it("after a failed submission, checks each field you change as you type, and drops a message once its field passes", async () =>
        {
            const { container } = mount(TypingPage());
            submit(container);
            await vi.waitFor(() => expect(messages(container)).toEqual(empty));
            type(container, "name", "G");
            expect(message(container, "name")).toBe("");
            expect(field(container, "name").getAttribute("aria-invalid")).toBe("false");
            type(container, "email", "grace@");
            expect(message(container, "email")).toBe("Enter an email address like name@example.com.");
            type(container, "email", "grace@example.com");
            expect(message(container, "email")).toBe("");
            type(container, "password", "short");
            expect(message(container, "password")).toBe("Use at least 15 characters.");
            type(container, "password", "x-grace@example.com");
            expect(message(container, "password")).toBe("Use a password that does not contain your email address.");
            type(container, "email", "hopper@example.com");
            expect(message(container, "password")).toBe("");
            container.querySelector<HTMLInputElement>("[value=plus]")?.click();
            field(container, "terms").click();
            expect(messages(container)).toEqual(none);
            type(container, "name", "");
            expect(message(container, "name")).toBe("Enter your name.");
            field(container, "terms").click();
            expect(message(container, "terms")).toBe("Accept the terms to create your account.");
        });

        it("reads the form when a submission fails, so a value that arrived with no input event counts", async () =>
        {
            const { container } = mount(TypingPage());
            field(container, "name").value = "Grace Hopper";
            submit(container);
            await vi.waitFor(() => expect(message(container, "email")).not.toBe(""));
            expect(message(container, "name")).toBe("");
        });

        it("shows the server's message while the field holds the value it was about", async () =>
        {
            const { container } = mount(TypingPage());
            fillIn(container, "Ada Lovelace", "ada@example.com");
            submit(container);
            await vi.waitFor(() => expect(message(container, "email")).toBe("This email address already has an account."));
            expect(field(container, "email").getAttribute("aria-invalid")).toBe("true");
            type(container, "email", "ada@example.org");
            expect(message(container, "email")).toBe("");
            type(container, "email", "ada@example.com");
            expect(message(container, "email")).toBe("This email address already has an account.");
        });
    });

    describe("a backend to send to", () =>
    {
        /** A fresh copy of the endpoint, with only the account it starts with. */
        async function fresh(run: string): Promise<typeof SignUps.answer>
        {
            const path = `../fixtures/sign-up-form/app/server/sign-ups.ts?run=${run}`;
            return ((await import(/* @vite-ignore */ path)) as typeof SignUps).answer;
        }

        function post(fields: Record<string, string>, headers: HeadersInit = { "content-type": "application/x-www-form-urlencoded" }, body: BodyInit = new URLSearchParams(fields)): Request
        {
            return new Request("http://127.0.0.1:3000/api/sign-ups", { method: "POST", headers, body });
        }

        const grace = { name: "Grace Hopper", email: "grace@example.com", password: "compilers-in-1952", plan: "team", terms: "accepted" };

        it("answers the contract the step writes down", async () =>
        {
            const endpoint = await fresh("contract");
            const created = await endpoint(post(grace));
            expect(created.status).toBe(201);
            expect(created.headers.get("content-type")).toBe("application/json");
            expect(await created.json()).toEqual({ id: 2, name: "Grace Hopper", email: "grace@example.com", plan: "team" });
            const invalid = await endpoint(post({ ...grace, email: "grace", password: "short" }));
            expect(invalid.status).toBe(400);
            expect(invalid.headers.get("content-type")).toBe("application/problem+json; charset=utf-8");
            expect(await invalid.json()).toEqual({ type: "about:blank", title: "The submission has invalid fields", status: 400, fields: { email: ["Enter an email address like name@example.com."], password: ["Use at least 15 characters."] } });
            for (const email of ["ada@example.com", " ADA@Example.com", "grace@example.com"])
            {
                const taken = await endpoint(post({ ...grace, email }));
                expect(taken.status).toBe(409);
                expect(taken.headers.get("content-type")).toBe("application/problem+json; charset=utf-8");
                expect(await taken.json()).toEqual({ type: "about:blank", title: "Conflict", status: 409, fields: { email: ["This email address already has an account."] } });
            }
            const next = await endpoint(post({ ...grace, name: "Zoë Ångström", email: "zoe@example.com", plan: "free" }));
            expect(await next.json()).toEqual({ id: 3, name: "Zoë Ångström", email: "zoe@example.com", plan: "free" });
        });

        it("answers 404 to any other request and 415 to a body that is not a form", async () =>
        {
            const endpoint = await fresh("other");
            const missing = await endpoint(new Request("http://127.0.0.1:3000/api/sign-ups"));
            expect(missing.status).toBe(404);
            expect(await missing.clone().json()).toEqual({ title: "Not Found", status: 404 });
            expect(missing.headers.get("content-type")).toBe("application/problem+json; charset=utf-8");
            expect((await endpoint(new Request("http://127.0.0.1:3000/api/accounts", { method: "POST", body: new URLSearchParams(grace) }))).status).toBe(404);
            const json = await endpoint(post(grace, { "content-type": "application/json" }, JSON.stringify(grace)));
            expect(json.status).toBe(415);
            expect(await json.json()).toEqual({ title: "Unsupported Media Type", status: 415, detail: "Send the form's fields URL-encoded." });
            expect((await endpoint(post(grace, {}, "name=Grace"))).status).toBe(415);
            const multipart = new FormData();
            for (const [name, value] of Object.entries(grace))
            {
                multipart.append(name, value);
            }
            expect((await endpoint(new Request("http://127.0.0.1:3000/api/sign-ups", { method: "POST", body: multipart }))).status).toBe(201);
        });
    });

    describe("sending and the welcome", () =>
    {
        it("waits with the button disabled, then shows the welcome from the server's answer", async () =>
        {
            const { release, requests } = held();
            const { container } = mount(SendingPage());
            expect(button(container).textContent?.trim()).toBe("Create account");
            fillIn(container, "Katherine Johnson", "katherine@example.com", "plus");
            submit(container);
            await vi.waitFor(() => expect(button(container).disabled).toBe(true));
            expect(button(container).textContent?.trim()).toBe("Creating your account…");
            await vi.waitFor(() => expect(requests).toHaveLength(1));
            button(container).click();
            field(container, "name").focus();
            await userEvent.keyboard("{Enter}");
            await new Promise((resolve) => setTimeout(resolve, 20));
            expect(requests).toHaveLength(1);
            release();
            await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Welcome, Katherine Johnson"));
            expect(container.querySelector("form")).toBeNull();
            expect(container.querySelector("p")?.textContent).toBe("Your Plus account for katherine@example.com is ready.");
        });

        it("shows a welcome with blanks rather than failing when a server answers with no account", async () =>
        {
            vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 204 })));
            const { container } = mount(SendingPage());
            fillIn(container, "Katherine Johnson", "katherine@example.org");
            submit(container);
            await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Welcome, "));
        });

        it("wraps a long name inside the page on a narrow screen", async () =>
        {
            const name = "x".repeat(200);
            vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ id: 9, name, email: `${name}@example.com`, plan: "free" }, { status: 201 })));
            const { container } = mount(SendingPage());
            fillIn(container, name, "long@example.com");
            container.style.width = "20rem";
            submit(container);
            await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe(`Welcome, ${name}`));
            expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth);
        });

        it("keeps a long plan or terms label beside its control on a narrow screen, against the starter's rule for labels", () =>
        {
            const starter = document.createElement("style");
            starter.textContent = "label { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }";
            document.head.append(starter);
            onTestFinished(() => starter.remove());
            const { container } = mount(SendingPage());
            container.style.width = "12rem";
            for (const label of container.querySelectorAll("fieldset label, label:has(input[name=terms])"))
            {
                const control = (label.querySelector("input") as HTMLInputElement).getBoundingClientRect();
                const range = document.createRange();
                range.selectNodeContents(label);
                range.setStartAfter(label.querySelector("input") as HTMLInputElement);
                expect(range.getBoundingClientRect().left).toBeGreaterThanOrEqual(control.right);
            }
            expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth);
        });

        it("turns the button back on and keeps the form after a failure", async () =>
        {
            const { container } = mount(SendingPage());
            fillIn(container, "Ada Lovelace", "ada@example.com");
            submit(container);
            await vi.waitFor(() => expect(message(container, "email")).toBe("This email address already has an account."));
            expect(button(container).disabled).toBe(false);
            expect(button(container).textContent?.trim()).toBe("Create account");
            expect(message(container, "sign-up")).toBe("");
        });

        it("says so when the sign-up did not go through, whether the server failed or no answer came", async () =>
        {
            for (const failure of [() => Promise.resolve(new Response(null, { status: 502, statusText: "Bad Gateway" })), () => Promise.reject(new TypeError("Failed to fetch"))])
            {
                vi.stubGlobal("fetch", failure);
                const { container, unmount } = mount(SendingPage());
                fillIn(container, "Mary Jackson", "mary@example.com");
                submit(container);
                await vi.waitFor(() => expect(message(container, "sign-up")).toBe(unsent));
                expect(messages(container)).toEqual(none);
                expect(button(container).disabled).toBe(false);
                unmount();
            }
        });

        it("clears that message while the next submission runs", async () =>
        {
            vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 502 })));
            const { container } = mount(SendingPage());
            fillIn(container, "Mary Jackson", "mary@example.com");
            submit(container);
            await vi.waitFor(() => expect(message(container, "sign-up")).toBe(unsent));
            const { release } = held();
            submit(container);
            await vi.waitFor(() => expect(button(container).disabled).toBe(true));
            expect(message(container, "sign-up")).toBe("");
            release();
            await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Welcome, Mary Jackson"));
        });
    });

    describe("focus and announcements", () =>
    {
        it("moves focus to the first field to change, in the form's order, and says how many there are", async () =>
        {
            const { container } = mount(AppPage());
            quiet();
            submit(container);
            await vi.waitFor(() => expect(messages(container)).toEqual(empty));
            expect(document.activeElement).toBe(field(container, "name"));
            await vi.waitFor(() => expect(announced()).toBe("Fix 5 fields to create your account."));
            type(container, "name", "Grace Hopper");
            type(container, "email", "grace");
            type(container, "password", "compilers-in-1952");
            field(container, "terms").click();
            quiet();
            submit(container);
            await vi.waitFor(() => expect(document.activeElement).toBe(field(container, "email")));
            await vi.waitFor(() => expect(announced()).toBe("Fix 2 fields to create your account."));
            type(container, "email", "grace@example.org");
            quiet();
            submit(container);
            await vi.waitFor(() => expect(document.activeElement).toBe(container.querySelector("[value=free]")));
            await vi.waitFor(() => expect(announced()).toBe("Fix 1 field to create your account."));
        });

        it("has its live regions in the page before the first message", () =>
        {
            mount(AppPage());
            expect([...document.querySelectorAll("[aria-live]")].map((region) => region.getAttribute("aria-live"))).toEqual(["polite", "assertive"]);
        });

        it("moves focus by the form's order, whatever order the problem names the fields in", async () =>
        {
            vi.stubGlobal("fetch", () => Promise.resolve(problemResponse({ title: "Conflict", status: 409, fields: { terms: ["Accept these terms."], password: ["Choose another password."], email: ["Choose another address."] } })));
            const { container } = mount(AppPage());
            fillIn(container, "Grace Hopper", "grace@example.net");
            quiet();
            submit(container);
            await vi.waitFor(() => expect(document.activeElement).toBe(field(container, "email")));
            expect(messages(container)).toEqual({ ...none, email: "Choose another address.", password: "Choose another password.", terms: "Accept these terms." });
            await vi.waitFor(() => expect(announced()).toBe("Fix 3 fields to create your account."));
        });

        it("announces a server's message as one field to fix", async () =>
        {
            const { container } = mount(AppPage());
            fillIn(container, "Ada Lovelace", "ada@example.com");
            button(container).focus();
            quiet();
            submit(container);
            await vi.waitFor(() => expect(document.activeElement).toBe(field(container, "email")));
            await vi.waitFor(() => expect(announced()).toBe("Fix 1 field to create your account."));
        });

        it("hands focus back to the button, which lost it while disabled, and announces it when the sign-up did not go through", async () =>
        {
            for (const failure of [() => Promise.resolve(new Response(null, { status: 502 })), () => Promise.reject(new TypeError("Failed to fetch"))])
            {
                const { release } = held(failure);
                const { container, unmount } = mount(AppPage());
                fillIn(container, "Dorothy Vaughan", "dorothy@example.com");
                button(container).focus();
                quiet();
                submit(container);
                await vi.waitFor(() => expect(document.activeElement).toBe(document.body));
                release();
                await vi.waitFor(() => expect(message(container, "sign-up")).toBe(unsent));
                expect(document.activeElement).toBe(button(container));
                await vi.waitFor(() => expect(announced()).toBe(unsent));
                unmount();
            }
        });

        it("loses focus with the disabled button, then moves it to the welcome heading", async () =>
        {
            const { release } = held();
            const { container } = mount(AppPage());
            fillIn(container, "Annie Easley", "annie@example.com");
            button(container).focus();
            submit(container);
            await vi.waitFor(() => expect(document.activeElement).toBe(document.body));
            release();
            await vi.waitFor(() => expect(document.activeElement?.textContent).toBe("Welcome, Annie Easley"));
            expect(document.activeElement?.tagName).toBe("H1");
            expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
        });
    });
});
