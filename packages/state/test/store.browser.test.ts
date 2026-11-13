import { afterEach, describe, expect, it } from "vitest";
import { type Root, ZerolithError, computed, each, effect, html, render } from "zerolith";
import { reconcile, snapshot, store } from "@zerolith/state";

interface Row
{
    id: number;
    label: string;
}

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() =>
{
    root?.dispose();
    root = undefined;
    host?.remove();
    host = undefined;
});

/** The diagnostic code an error carries, or undefined for any other error. */
function codeOf(run: () => unknown): string | undefined
{
    try
    {
        run();
    }
    catch (error)
    {
        return error instanceof ZerolithError ? error.diagnostic.code : undefined;
    }
    return undefined;
}

describe("store", () =>
{
    it("reads nested objects and arrays through views that keep their identity", () =>
    {
        const [board] = store({ title: "Board", rows: [{ id: 1, label: "one" }] as Row[], owner: { name: "Ada" } });
        expect(board.title).toBe("Board");
        expect(board.rows[0]).toBe(board.rows[0]);
        expect(board.owner).toBe(board.owner);
        expect(board.rows.map((row) => row.label)).toEqual(["one"]);
        expect(board.rows.length).toBe(1);
    });

    it("wakes only what reads the field a path changes, and keeps the object it changes", () =>
    {
        const [board, setBoard] = store({ rows: [{ id: 1, label: "one" }, { id: 2, label: "two" }] as Row[], title: "Board" });
        const first = board.rows[0];
        const runs: string[] = [];
        const stopLabel = effect(() =>
        {
            runs.push(`label ${board.rows[1]?.label}`);
        });
        const stopTitle = effect(() =>
        {
            runs.push(`title ${board.title}`);
        });
        runs.length = 0;
        setBoard("rows", 1, "label", "renamed");
        expect(runs).toEqual(["label renamed"]);
        expect(board.rows[0]).toBe(first);
        setBoard("title", (title) => `${title}!`);
        expect(runs).toEqual(["label renamed", "title Board!"]);
        stopLabel();
        stopTitle();
    });

    it("replaces an array when an item changes, so a list over it sees the change, and keeps it through an edit inside an item", () =>
    {
        const [board, setBoard] = store({ rows: [{ id: 1, label: "one" }] as Row[] });
        const rows = computed(() => board.rows);
        const before = rows.get();
        setBoard("rows", 0, "label", "edited");
        expect(rows.get()).toBe(before);
        setBoard("rows", 1, { id: 2, label: "two" });
        expect(rows.get()).not.toBe(before);
        setBoard("rows", (list) => [...list, { id: 3, label: "three" }]);
        expect(rows.get().map((row) => row.id)).toEqual([1, 2, 3]);
    });

    it("renders a keyed list a field at a time, recreating no row for an edit", () =>
    {
        const [board, setBoard] = store({ rows: [{ id: 1, label: "one" }, { id: 2, label: "two" }] as Row[] });
        let made = 0;
        host = document.createElement("div");
        document.body.append(host);
        root = render(html`<ul>${each(computed(() => board.rows), (row) => row.id, (row) =>
        {
            made++;
            return html`<li>${computed(() => row.get().label)}</li>`;
        })}</ul>`, host);
        const second = host.querySelectorAll("li")[1];
        setBoard("rows", 1, "label", "renamed");
        expect(host.querySelectorAll("li")[1]).toBe(second);
        expect(second?.textContent).toBe("renamed");
        setBoard("rows", (list) => [...list, { id: 3, label: "three" }]);
        expect([...host.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["one", "renamed", "three"]);
        expect(made).toBe(3);
    });

    it("merges data sent again whole, waking only the fields that differ and keeping the items the key matches", () =>
    {
        const [board, setBoard] = store({ rows: [{ id: 1, label: "one" }, { id: 2, label: "two" }] as Row[] });
        const kept = board.rows[1];
        const labels: string[] = [];
        const stop = effect(() =>
        {
            labels.push(`${board.rows[0]?.label}`);
        });
        labels.length = 0;
        setBoard("rows", reconcile([{ id: 2, label: "two" }, { id: 3, label: "three" }], "id"));
        expect(board.rows.map((row) => row.id)).toEqual([2, 3]);
        expect(board.rows[0]).toBe(kept);
        expect(labels).toEqual(["two"]);
        setBoard("rows", reconcile([{ id: 2, label: "TWO" }, { id: 3, label: "three" }], "id"));
        expect(board.rows[0]).toBe(kept);
        expect(labels).toEqual(["two", "TWO"]);
        stop();
    });

    it("wakes what reads an object's keys when the setter adds or reconcile removes one", () =>
    {
        const [board, setBoard] = store({ tags: { a: 1 } as Record<string, number> });
        const seen: string[][] = [];
        const stop = effect(() =>
        {
            seen.push(Object.keys(board.tags));
        });
        setBoard("tags", "b", 2);
        setBoard("tags", reconcile({ b: 2 }));
        expect(seen).toEqual([["a"], ["a", "b"], ["b"]]);
        stop();
    });

    it("gives a plain copy in a snapshot, and stores the data behind a view written back into it", () =>
    {
        const [board, setBoard] = store({ rows: [{ id: 1, label: "one" }, { id: 2, label: "two" }] as Row[] });
        const copy = snapshot(board);
        (copy.rows[0] as Row).label = "changed";
        expect(board.rows[0]?.label).toBe("one");
        expect(Object.getPrototypeOf(copy.rows)).toBe(Array.prototype);
        setBoard("rows", 0, board.rows[1] as Row);
        expect(snapshot(board).rows[0]).toEqual({ id: 2, label: "two" });
        expect(board.rows[0]).toBe(board.rows[1]);
    });

    it("keeps maps, class instances, and frozen objects as values", () =>
    {
        const tags = new Map([["a", 1]]);
        const when = new Date(0);
        const fixed = Object.freeze({ id: 1 });
        const [board] = store({ tags, when, fixed });
        expect(board.tags).toBe(tags);
        expect(board.when).toBe(when);
        expect(board.fixed).toBe(fixed);
    });

    it("refuses a write that skips the setter, a path through nothing, and a setter call without a path", () =>
    {
        const [board, setBoard] = store({ rows: [{ id: 1, label: "one" }] as Row[], owner: undefined as { name: string } | undefined });
        expect(codeOf(() =>
        {
            (board as unknown as { rows: Row[] }).rows = [];
        })).toBe("state_store_assigned");
        expect(codeOf(() => (board.rows as Row[]).push({ id: 2, label: "two" }))).toBe("state_store_assigned");
        expect(codeOf(() => delete (board.rows[0] as Partial<Row>).label)).toBe("state_store_assigned");
        expect(codeOf(() => setBoard("owner", "name", "Ada"))).toBe("state_store_path_missing");
        expect(() => (setBoard as unknown as (value: unknown) => void)({})).toThrow(TypeError);
        expect(() => store([] as unknown as object)).toThrow(TypeError);
    });
});
