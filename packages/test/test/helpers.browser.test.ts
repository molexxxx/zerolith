import { afterEach, describe, expect, it } from "vitest";
import { computed, html, resource, signal } from "zerolith";
import { accessibilityIssues, cleanup, hydrationMismatches, mount, settle } from "@zerolith/test";

afterEach(cleanup);

describe("mount and cleanup", () =>
{
    it("renders into an attached container and disposes on cleanup, newest first", () =>
    {
        const order: string[] = [];
        const first = mount(html`<p>one</p>`);
        const second = mount(html`<p>two</p>`);
        expect(document.body.contains(first.container)).toBe(true);
        expect(first.container.textContent).toBe("one");
        const firstUnmount = first.unmount;
        const secondUnmount = second.unmount;
        first.unmount = () =>
        {
            order.push("first");
            firstUnmount();
        };
        second.unmount = () =>
        {
            order.push("second");
            secondUnmount();
        };
        cleanup();
        expect(order).toEqual(["second", "first"]);
        expect(document.body.contains(first.container)).toBe(false);
        expect(document.body.contains(second.container)).toBe(false);
    });

    it("renders into a given container and leaves it in place", () =>
    {
        const host = document.createElement("section");
        document.body.append(host);
        const { unmount } = mount(html`<p>here</p>`, { container: host });
        expect(host.textContent).toBe("here");
        unmount();
        expect(host.textContent).toBe("");
        expect(document.body.contains(host)).toBe(true);
        host.remove();
    });

    it("can stay detached", () =>
    {
        const { container } = mount(html`<p>off</p>`, { attach: false });
        expect(document.body.contains(container)).toBe(false);
        expect(container.textContent).toBe("off");
    });
});

describe("settle", () =>
{
    it("waits for a resource to resolve", async () =>
    {
        const id = signal(1);
        const value = resource({ params: () => id.get(), loader: ({ params }) => Promise.resolve(`item ${params}`) });
        const { container } = mount(html`<p>${computed(() => value.get() ?? "loading")}</p>`);
        await settle();
        expect(container.textContent).toBe("item 1");
        id.set(2);
        await settle();
        expect(container.textContent).toBe("item 2");
    });
});

describe("hydrationMismatches", () =>
{
    it("is empty for a view whose markup and client structure agree, and lists the differences otherwise", () =>
    {
        const count = signal(3);
        expect(hydrationMismatches(() => html`<button @click=${() => count.set(count.get() + 1)}>Clicked ${count} times</button>`)).toEqual([]);

        let calls = 0;
        const mismatches = hydrationMismatches(() =>
        {
            calls += 1;
            return html`<p>${calls === 1 ? "server" : "client"}</p>`;
        });
        expect(mismatches.map((mismatch) => mismatch.kind)).toEqual(["text"]);
    });
});

describe("accessibilityIssues", () =>
{
    it("finds the defects it covers and nothing else", () =>
    {
        const { container } = mount(html`
            <img src="a.png">
            <img src="b.png" alt="">
            <input name="plain">
            <label>Name <input name="wrapped"></label>
            <label for="linked">Linked</label><input id="linked">
            <input aria-label="Search">
            <input type="hidden" name="token">
            <button></button>
            <button aria-label="Close"></button>
            <button><img src="icon.png" alt="Menu"></button>
            <a href="/x"></a>
            <a href="/y">Go</a>
            <iframe src="about:blank"></iframe>
            <iframe src="about:blank" title="Player"></iframe>`);
        const found = accessibilityIssues(container).map((issue) => `${issue.code}:${issue.element.tagName.toLowerCase()}${issue.element.getAttribute("name") === null ? "" : `[${issue.element.getAttribute("name")}]`}`);
        expect(found).toEqual(["image_without_alt:img", "control_without_label:input[plain]", "button_without_name:button", "link_without_name:a", "frame_without_title:iframe"]);
    });
});
