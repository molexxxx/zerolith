/**
 * @zerolith/devtools: an in-page inspector built with zerolith itself. It
 * reads the hook the core publishes in development and renders a dock
 * with the reactive graph, the mounted roots, and the diagnostics feed.
 */
import { type Diagnostic, computed, css, each, html, render, signal, when } from "zerolith";
import { type DevtoolsHook, type NodeSnapshot, type RootSnapshot, devtoolsInternal } from "zerolith/internal";

export type { DevtoolsHandle, DevtoolsOptions } from "./noop.js";
import type { DevtoolsHandle, DevtoolsOptions } from "./noop.js";

type Tab = "signals" | "roots" | "diagnostics";

const dock = css`
    :scope { position: fixed; inset: auto 0 0 0; z-index: 2147483000; max-height: 45vh; display: grid; grid-template-rows: auto 1fr; background: #14171a; color: #e6e8eb; border-top: 1px solid #2a2f36; font: 12px/1.45 ui-monospace, monospace; }
    header { display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-bottom: 1px solid #2a2f36; }
    header strong { margin-right: 8px; color: #7cc4ff; }
    header button { background: none; border: 1px solid transparent; color: inherit; padding: 2px 8px; border-radius: 4px; cursor: pointer; font: inherit; }
    header button[aria-selected="true"] { border-color: #2a2f36; background: #1d2126; }
    header .spacer { flex: 1; }
    .panel { overflow: auto; padding: 4px 8px 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 2px 6px; border-bottom: 1px solid #1d2126; vertical-align: top; white-space: nowrap; }
    td.value { white-space: pre-wrap; max-width: 40vw; overflow-wrap: anywhere; color: #c6e2b5; }
    tr[data-kind="effect"] td.value { color: #9aa3ad; }
    .code { color: #ff8a80; }
    a { color: #7cc4ff; }
    .empty { color: #9aa3ad; padding: 12px 0; }
`;

const launcher = css`
    :scope { position: fixed; right: 12px; bottom: 12px; z-index: 2147483000; background: #14171a; color: #7cc4ff; border: 1px solid #2a2f36; border-radius: 999px; padding: 6px 12px; font: 12px/1 ui-monospace, monospace; cursor: pointer; }
`;

function hook(): DevtoolsHook | undefined
{
    return (globalThis as { __ZEROLITH_DEVTOOLS__?: DevtoolsHook }).__ZEROLITH_DEVTOOLS__;
}

/** A short, safe textual form of a value for the table. */
export function describeValue(value: unknown): string
{
    if (typeof value === "string")
    {
        return JSON.stringify(value.length > 120 ? value.slice(0, 117) + "..." : value);
    }
    if (typeof value === "function")
    {
        return `function ${value.name}`;
    }
    if (value === null || typeof value !== "object")
    {
        return String(value);
    }
    if (typeof Node !== "undefined" && value instanceof Node)
    {
        return `<${value.nodeName.toLowerCase()}>`;
    }
    try
    {
        const text = JSON.stringify(value);
        return text === undefined ? String(value) : text.length > 120 ? text.slice(0, 117) + "..." : text;
    }
    catch
    {
        return Object.prototype.toString.call(value);
    }
}

function describeContainer(node: Node): string
{
    if (node.nodeType !== 1)
    {
        return node.nodeName.toLowerCase();
    }
    const element = node as Element;
    const id = element.id === "" ? "" : `#${element.id}`;
    const classes = element.classList.length === 0 ? "" : "." + Array.from(element.classList).join(".");
    return element.localName + id + classes;
}

function Signals(nodes: () => NodeSnapshot[])
{
    const rows = computed(() => nodes().filter((node) => !node.internal));
    return when(computed(() => rows.get().length > 0), () => html`
        <table>
            <thead><tr><th>id</th><th>kind</th><th>name</th><th>observers</th><th>value</th></tr></thead>
            <tbody>${each(rows, (node) => node.id, (node) => html`
                <tr data-kind=${computed(() => node.get().kind)}>
                    <td>${computed(() => node.get().id)}</td>
                    <td>${computed(() => node.get().kind)}</td>
                    <td>${computed(() => node.get().name ?? "")}</td>
                    <td>${computed(() => node.get().observers)}</td>
                    <td class="value">${computed(() => ("value" in node.get() ? describeValue(node.get().value) : ""))}</td>
                </tr>`)}</tbody>
        </table>`, () => html`<p class="empty">No signals yet.</p>`);
}

function Roots(roots: () => RootSnapshot[])
{
    const rows = computed(() => roots().filter((root) => !root.internal));
    return when(computed(() => rows.get().length > 0), () => html`
        <table>
            <thead><tr><th>id</th><th>kind</th><th>container</th></tr></thead>
            <tbody>${each(rows, (root) => root.id, (root) => html`
                <tr>
                    <td>${computed(() => root.get().id)}</td>
                    <td>${computed(() => root.get().kind)}</td>
                    <td>${computed(() => describeContainer(root.get().container))}</td>
                </tr>`)}</tbody>
        </table>`, () => html`<p class="empty">No roots mounted.</p>`);
}

function Diagnostics(list: () => Diagnostic[])
{
    const rows = computed(() => list().map((record, index) => ({ index, record })));
    return when(computed(() => rows.get().length > 0), () => html`
        <table>
            <thead><tr><th>severity</th><th>code</th><th>cause</th><th>arguments</th></tr></thead>
            <tbody>${each(rows, (row) => row.index, (row) => html`
                <tr>
                    <td>${computed(() => row.get().record.severity)}</td>
                    <td class="code"><a href=${computed(() => row.get().record.url)} target="_blank" rel="noopener">${computed(() => row.get().record.code)}</a></td>
                    <td class="value">${computed(() => row.get().record.cause)}</td>
                    <td class="value">${computed(() => describeValue(row.get().record.args ?? {}))}</td>
                </tr>`)}</tbody>
        </table>`, () => html`<p class="empty">No diagnostics reported.</p>`);
}

/**
 * Mounts the inspector dock at the bottom of the page. Returns a handle to
 * toggle or remove it. Everything the inspector creates is marked internal
 * so it does not appear in its own tables.
 */
export function mountDevtools(options: DevtoolsOptions = {}): DevtoolsHandle
{
    const source = hook();
    const open = signal(options.open === true);
    const tab = signal<Tab>("signals");
    const version = signal(0);
    const nodes = (): NodeSnapshot[] => (version.get(), source?.nodes() ?? []);
    const roots = (): RootSnapshot[] => (version.get(), source?.roots() ?? []);
    const list = (): Diagnostic[] => (version.get(), source?.diagnostics() ?? []);

    let scheduled = false;
    const refresh = (): void =>
    {
        if (scheduled)
        {
            return;
        }
        scheduled = true;
        requestAnimationFrame(() =>
        {
            scheduled = false;
            version.set(version.get() + 1);
        });
    };
    const unsubscribe = source?.subscribe(refresh);

    const onKey = (event: KeyboardEvent): void =>
    {
        if (event.altKey && event.shiftKey && event.code === "KeyZ")
        {
            event.preventDefault();
            open.set(!open.get());
        }
    };
    document.addEventListener("keydown", onKey);

    const host = document.createElement("div");
    host.dataset["zerolithDevtools"] = "";
    document.body.append(host);

    const tabButton = (name: Tab, label: string) => html`<button type="button" role="tab" aria-selected=${computed(() => String(tab.get() === name))} @click=${() => tab.set(name)}>${label}</button>`;

    const root = devtoolsInternal(() => render(html`
        ${when(open, () => html`
            <aside class=${dock} aria-label="zerolith dev tools">
                <header role="tablist">
                    <strong>zerolith</strong>
                    ${tabButton("signals", "Signals")}
                    ${tabButton("roots", "Roots")}
                    ${tabButton("diagnostics", "Diagnostics")}
                    <span class="spacer"></span>
                    <button type="button" @click=${() => refresh()}>Refresh</button>
                    <button type="button" aria-label="Close dev tools" @click=${() => open.set(false)}>Close</button>
                </header>
                <div class="panel">
                    ${when(computed(() => source === undefined), () => html`<p class="empty">No zerolith development build is running on this page.</p>`, () => html`
                        ${when(computed(() => tab.get() === "signals"), () => Signals(nodes))}
                        ${when(computed(() => tab.get() === "roots"), () => Roots(roots))}
                        ${when(computed(() => tab.get() === "diagnostics"), () => Diagnostics(list))}`)}
                </div>
            </aside>`, () => html`<button type="button" class=${launcher} aria-label="Open zerolith dev tools" @click=${() => open.set(true)}>zerolith</button>`)}`, host));

    return {
        toggle(state?: boolean): void
        {
            open.set(state ?? !open.get());
        },
        dispose(): void
        {
            unsubscribe?.();
            document.removeEventListener("keydown", onKey);
            root.dispose();
            host.remove();
        }
    };
}
