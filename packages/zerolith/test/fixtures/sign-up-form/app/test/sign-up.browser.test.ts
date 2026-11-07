// The sign-up page in a browser, answered by the server's own function.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { accessibilityIssues, cleanup, mount } from "@zerolith/test";
import { answer } from "../server/sign-ups.ts";
import { SignUp } from "../src/components/sign-up.ts";

beforeEach(() =>
{
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
        answer(new Request(input, init)));
});
afterEach(() =>
{
    cleanup();
    vi.unstubAllGlobals();
});

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

function fillIn(container: HTMLElement, email: string): void
{
    type(container, "name", "Grace Hopper");
    type(container, "email", email);
    type(container, "password", "compilers-in-1952");
    container.querySelector<HTMLInputElement>("[value=team]")?.click();
    field(container, "terms").click();
}

function submit(container: HTMLElement): void
{
    container.querySelector("form")?.requestSubmit();
}

it("names every control", () =>
{
    const { container } = mount(SignUp());
    expect(accessibilityIssues(container)).toEqual([]);
});

it("says what to change and moves focus to the first field", async () =>
{
    const { container } = mount(SignUp());
    submit(container);
    await vi.waitFor(() =>
        expect(message(container, "name")).toBe("Enter your name."));
    expect(message(container, "plan")).toBe("Choose a plan.");
    expect(document.activeElement).toBe(field(container, "name"));
});

it("checks a field again as you change it", async () =>
{
    const { container } = mount(SignUp());
    submit(container);
    await vi.waitFor(() =>
        expect(message(container, "email")).not.toBe(""));
    type(container, "email", "grace@");
    expect(message(container, "email"))
        .toBe("Enter an email address like name@example.com.");
    type(container, "email", "grace@example.com");
    expect(message(container, "email")).toBe("");
});

it("shows the server's message next to the email address", async () =>
{
    const { container } = mount(SignUp());
    fillIn(container, "ada@example.com");
    submit(container);
    await vi.waitFor(() => expect(message(container, "email"))
        .toBe("This email address already has an account."));
    expect(document.activeElement).toBe(field(container, "email"));
});

it("creates the account and welcomes you", async () =>
{
    const { container } = mount(SignUp());
    fillIn(container, "grace@example.com");
    submit(container);
    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent)
        .toBe("Welcome, Grace Hopper"));
    expect(container.textContent)
        .toContain("Your Team account for grace@example.com is ready.");
    await vi.waitFor(() =>
        expect(document.activeElement).toBe(container.querySelector("h1")));
});
