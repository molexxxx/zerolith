import { afterEach, expect, it, vi } from "vitest";
import { html } from "zerolith";
import { accessibilityIssues, cleanup, mount } from "@zerolith/test";
import { feedbackHandler } from "../server/feedback.ts";
import type { Feedback } from "../src/api.ts";

await import("../src/main.ts");

afterEach(() =>
{
    cleanup();
    vi.unstubAllGlobals();
});

/** Mounts a widget whose api is at https://feedback.example. */
function widget(): HTMLElement
{
    const { container } = mount(html`
        <feedback-widget api="https://feedback.example"></feedback-widget>`);
    return container;
}

/** Chooses an answer, writes a comment, and presses Send. */
function answer(container: HTMLElement, choice: string, comment: string): void
{
    container.querySelector<HTMLInputElement>(`[value=${choice}]`)?.click();
    const field = container.querySelector("textarea");
    if (field !== null)
    {
        field.value = comment;
    }
    container.querySelector("button")?.click();
}

it("sends the answer and the comment, then thanks the reader", async () =>
{
    const received: Feedback[] = [];
    vi.stubGlobal("fetch", feedbackHandler((item) => received.push(item)));
    const sent: unknown[] = [];
    const container = widget();
    container.addEventListener("feedback-sent", (event) =>
    {
        sent.push((event as CustomEvent).detail);
    });
    answer(container, "yes", "The steps were clear.");
    const status = container.querySelector("[role=status]");
    await vi.waitFor(() =>
        expect(status?.textContent).toBe("Thanks for your feedback."));
    const feedback = {
        helpful: true,
        page: location.origin + location.pathname,
        comment: "The steps were clear."
    };
    expect(received).toEqual([feedback]);
    expect(sent).toEqual([{ ...feedback, id: expect.any(String) }]);
    expect(container.querySelector("form")).toBeNull();
});

it("says why the feedback was not sent, and keeps the form", async () =>
{
    const problem = { title: "Too much feedback", status: 429 };
    const headers = { "content-type": "application/problem+json" };
    vi.stubGlobal("fetch", async () =>
        Response.json(problem, { status: 429, headers }));
    const container = widget();
    answer(container, "no", "");
    const status = container.querySelector("[role=status]");
    await vi.waitFor(() =>
        expect(status?.textContent).toBe("Not sent: Too much feedback"));
    expect(container.querySelector("form")).not.toBeNull();
});

it("names every control", () =>
{
    expect(accessibilityIssues(widget())).toEqual([]);
});
