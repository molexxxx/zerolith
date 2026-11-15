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
        setBoard("tags", "c", undefined as unknown as number);
        setBoard("tags", reconcile({ b: 2, c: undefined, d: undefined } as unknown as Record<string, number>));
        expect(seen).toEqual([["a"], ["a", "b"], ["b"], ["b", "c"], ["b", "c", "d"]]);
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

    it("keeps data from reaching Object.prototype through a path, reconciled data, or a snapshot", () =>
    {
        const [board, setBoard] = store({ settings: { theme: "light" } as Record<string, unknown> });
        expect(() => setBoard("settings", "__proto__" as string, { polluted: true })).toThrow(TypeError);
        expect(() => setBoard("settings", "__proto__" as string, "polluted" as never, true as never)).toThrow(TypeError);
        const sent = JSON.parse('{"theme": "dark", "__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}}') as Record<string, unknown>;
        setBoard("settings", reconcile(sent));
        setBoard("settings", "nested", JSON.parse('{"__proto__": {"polluted": true}}'));
        const copy = snapshot(board) as { settings: Record<string, unknown> };
        expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
        expect((Object as unknown as Record<string, unknown>)["polluted"]).toBeUndefined();
        expect(board.settings["theme"]).toBe("dark");
        expect(Object.getPrototypeOf(copy.settings)).toBe(Object.prototype);
        expect(Object.hasOwn(copy.settings, "__proto__")).toBe(false);
        const nested = copy.settings["nested"] as Record<string, unknown>;
        expect(Object.getPrototypeOf(nested)).toBe(Object.prototype);
        expect(Object.hasOwn(nested, "__proto__")).toBe(false);
        expect(nested["polluted"]).toBeUndefined();
    });

    it("reads a path key as the property name it stands for, so a number names a field and no key hides __proto__", () =>
    {
        const [board, setBoard] = store({ byId: {} as Record<string, string>, settings: { theme: "light" } as Record<string, unknown> });
        const seen: unknown[] = [];
        const stop = effect(() =>
        {
            seen.push(board.byId[5]);
        });
        setBoard("byId", 5 as unknown as string, "five");
        expect(seen).toEqual([undefined, "five"]);
        expect(() => setBoard("settings", ["__proto__"] as unknown as string, { admin: true })).toThrow(TypeError);
        expect(() => setBoard("settings", { toString: () => "__proto__" } as unknown as string, { admin: true })).toThrow(TypeError);
        expect(Object.getPrototypeOf(snapshot(board).settings)).toBe(Object.prototype);
        expect(board.settings["admin"]).toBeUndefined();
        stop();
    });

    it("makes a field of the object's own under a name it inherits, whatever the inherited member allows", () =>
    {
        const [board, setBoard] = store({ settings: { theme: "light" } as Record<string, unknown>, rows: [] as Row[] });
        const base = Object.prototype as unknown as Record<string, unknown>;
        const list = Array.prototype as unknown as Record<string, unknown>;
        try
        {
            Object.defineProperty(Array.prototype, "3", { value: undefined, writable: false, configurable: true });
            setBoard("rows", 3, { id: 3, label: "three" });
            expect([Object.hasOwn(board.rows, 3), board.rows[3]?.label]).toEqual([true, "three"]);
            delete list["3"];
            Object.defineProperty(Object.prototype, "fixed", { value: 1, writable: false, configurable: true });
            Object.defineProperty(Object.prototype, "guarded", {
                configurable: true,
                get: () => 1,
                set: () =>
                {
                    throw new Error("the inherited setter ran");
                }
            });
            setBoard("settings", "fixed", 2);
            setBoard("settings", reconcile({ theme: "dark", fixed: 3, guarded: 4 } as Record<string, unknown>));
            expect([board.settings["fixed"], board.settings["guarded"]]).toEqual([3, 4]);
            expect(Object.hasOwn(snapshot(board).settings, "guarded")).toBe(true);
            expect(JSON.stringify(snapshot(board).settings)).toBe('{"theme":"dark","fixed":3,"guarded":4}');
            expect([base["fixed"], base["guarded"]]).toEqual([1, 1]);
        }
        finally
        {
            delete list["3"];
            delete base["fixed"];
            delete base["guarded"];
        }
    });

    it("names an item of an array by its index alone, a whole number from 0 or the same as a string", () =>
    {
        const [board, setBoard] = store({ rows: [{ id: 1, label: "one" }, { id: 2, label: "two" }] as Row[] });
        for (const key of ["constructor", "length", "label", "01", "1.5", "", " 1", -1, 1.5, Number.NaN, 2 ** 32 - 1, 1e21, "4294967295", Symbol.iterator, null, [1]])
        {
            expect(() => setBoard("rows", key as never, { id: 9, label: "nine" } as never), String(key)).toThrow(TypeError);
        }
        expect(snapshot(board).rows).toEqual([{ id: 1, label: "one" }, { id: 2, label: "two" }]);
        expect(Object.keys(snapshot(board).rows)).toEqual(["0", "1"]);
        setBoard("rows", "1" as unknown as number, "label", "second");
        setBoard("rows", 2, { id: 3, label: "three" });
        expect(board.rows.map((row) => row.label)).toEqual(["one", "second", "three"]);
        expect(Object.keys(board.rows)).toEqual(["0", "1", "2"]);
    });

    it("goes only through fields an object holds itself, so a path reaches no built-in object", () =>
    {
        const [board, setBoard] = store({ settings: { theme: "light" } as Record<string, unknown>, rows: [] as Row[] });
        const builtin = (Array.prototype as unknown as Record<symbol, Record<string, unknown>>)[Symbol.unscopables] as Record<string, unknown>;
        try
        {
            expect(() => setBoard("settings", "constructor" as string, "prototype" as never, "polluted" as never, true as never)).toThrow(ZerolithError);
            expect(() => setBoard("rows", "constructor" as never, "prototype" as never, "polluted" as never, true as never)).toThrow(TypeError);
            expect(() => setBoard("rows", Symbol.unscopables as never, "polluted" as never, true as never)).toThrow(TypeError);
            expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
            expect(([] as unknown as Record<string, unknown>)["polluted"]).toBeUndefined();
            expect(builtin["polluted"]).toBeUndefined();
            const shared = { level: 1 };
            Object.defineProperty(Object.prototype, "inherited", { value: shared, configurable: true, writable: true });
            expect(() => setBoard("settings", "inherited" as string, "level" as never, 5 as never)).toThrow(ZerolithError);
            setBoard("settings", reconcile({ theme: "dark", inherited: { level: 2 } } as Record<string, unknown>));
            expect(shared).toEqual({ level: 1 });
            expect(Object.hasOwn(snapshot(board).settings, "inherited")).toBe(true);
            expect((board.settings["inherited"] as { level: number }).level).toBe(2);
        }
        finally
        {
            delete builtin["polluted"];
            delete (Object.prototype as unknown as Record<string, unknown>)["polluted"];
            delete (Object.prototype as unknown as Record<string, unknown>)["inherited"];
            delete (Array.prototype as unknown as Record<string, unknown>)["polluted"];
        }
    });

    it("holds fields named constructor and prototype as data, through the setter, reconciled data, and a snapshot", () =>
    {
        const [board, setBoard] = store({ car: { name: "one" } as Record<string, unknown> });
        const seen: unknown[] = [];
        const stop = effect(() =>
        {
            seen.push(board.car["constructor"]);
        });
        expect(seen).toEqual([Object]);
        setBoard("car", "constructor" as string, "first");
        expect(seen).toEqual([Object, "first"]);
        setBoard("car", reconcile(JSON.parse('{"name": "two", "constructor": {"name": "second", "prototype": {"wing": "low"}}, "prototype": true}') as Record<string, unknown>));
        const maker = board.car["constructor"] as Record<string, unknown>;
        expect(seen).toEqual([Object, "first", maker]);
        expect(maker["name"]).toBe("second");
        expect((maker["prototype"] as Record<string, unknown>)["wing"]).toBe("low");
        expect(board.car["prototype"]).toBe(true);
        setBoard("car", "constructor" as string, "prototype" as never, "wing" as never, "high" as never);
        expect((maker["prototype"] as Record<string, unknown>)["wing"]).toBe("high");
        expect(JSON.stringify(snapshot(board))).toBe('{"car":{"name":"two","constructor":{"name":"second","prototype":{"wing":"high"}},"prototype":true}}');
        setBoard("car", reconcile({ name: "three" } as Record<string, unknown>));
        expect(seen).toEqual([Object, "first", maker, Object]);
        expect(Object.keys(board.car)).toEqual(["name"]);
        expect((Object.prototype as unknown as Record<string, unknown>)["wing"]).toBeUndefined();
        stop();
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
