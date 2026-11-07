import { afterEach, describe, expect, it, vi } from "vitest";
import { type Diagnostic, effect, onDiagnostic, scope, signal } from "zerolith";
import { debounced, history, selector, stored, throttled } from "@zerolith/state";

const heard: Diagnostic[] = [];
let stop = onDiagnostic((record) => heard.push(record));

afterEach(() =>
{
    localStorage.clear();
    sessionStorage.clear();
    heard.length = 0;
    vi.restoreAllMocks();
    stop();
    stop = onDiagnostic((record) => heard.push(record));
});

/** Waits `ms` milliseconds and a tick more, for a timer set with `ms` to have fired. */
function after(ms: number): Promise<void>
{
    return new Promise((resolve) => setTimeout(resolve, ms + 15));
}

/** Keeps the page busy for `ms` milliseconds, so a timer due in the meantime fires late. */
function block(ms: number): void
{
    const until = Date.now() + ms;
    while (Date.now() < until)
    {
        continue;
    }
}

/** Tells the page another tab wrote `key`, as the browser does with a `storage` event. */
function otherTabWrote(store: Storage, key: string | null, newValue: string | null): void
{
    dispatchEvent(new StorageEvent("storage", { key, newValue, storageArea: store }));
}

/** Whether a value is a list of strings, as a stored signal's validate checks. */
function isNames(value: unknown): boolean
{
    return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

describe("stored", () =>
{
    it("reads the kept value, writes every set as JSON, and takes the initial value where nothing is kept", () =>
    {
        localStorage.setItem("prefs", JSON.stringify({ theme: "dark" }));
        const prefs = stored("prefs", { theme: "light" });
        expect(prefs.get()).toEqual({ theme: "dark" });
        prefs.set({ theme: "light" });
        expect(localStorage.getItem("prefs")).toBe("{\"theme\":\"light\"}");
        const count = stored("count", 3);
        expect(count.get()).toBe(3);
        expect(localStorage.getItem("count")).toBeNull();
        count.set(4);
        expect(localStorage.getItem("count")).toBe("4");
        expect(heard).toEqual([]);
    });

    it("follows another tab's write of the key and a clear of the storage, and ignores other keys and the other storage", () =>
    {
        const name = stored("name", "nobody");
        localStorage.setItem("name", JSON.stringify("ada"));
        otherTabWrote(localStorage, "name", JSON.stringify("ada"));
        expect(name.get()).toBe("ada");
        otherTabWrote(localStorage, "other", JSON.stringify("x"));
        otherTabWrote(sessionStorage, "name", JSON.stringify("grace"));
        expect(name.get()).toBe("ada");
        localStorage.clear();
        otherTabWrote(localStorage, null, null);
        expect(name.get()).toBe("nobody");
    });

    it("does not write back what another tab wrote", () =>
    {
        const author = stored("author", "nobody");
        localStorage.setItem("author", JSON.stringify("ada"));
        const writes = vi.spyOn(Storage.prototype, "setItem");
        otherTabWrote(localStorage, "author", JSON.stringify("ada"));
        expect(author.get()).toBe("ada");
        expect(writes).not.toHaveBeenCalled();
        author.set("grace");
        expect(writes).toHaveBeenCalledTimes(1);
    });

    it("keeps a value in session storage when asked, this tab's alone", () =>
    {
        const token = stored("token", "", { storage: "session" });
        token.set("abc");
        expect(sessionStorage.getItem("token")).toBe("\"abc\"");
        expect(localStorage.getItem("token")).toBeNull();
    });

    it("takes the initial value and reports a kept value that does not parse", () =>
    {
        localStorage.setItem("broken", "{not json");
        const value = stored("broken", 1);
        expect(value.get()).toBe(1);
        expect(heard.map((record) => `${record.code} ${record.severity} ${record.args?.["key"]}`)).toEqual(["state_storage_unreadable warning broken"]);
        expect(heard[0]?.url).toBe("https://zerolith.dev/e/state_storage_unreadable/?key=broken");
    });

    it("takes the initial value and reports a kept value its validate refuses or throws on, on creation and from another tab", () =>
    {
        localStorage.setItem("names", JSON.stringify({ not: "a list" }));
        const kept = stored<string[]>("names", ["x"], { validate: isNames });
        expect(kept.get()).toEqual(["x"]);
        otherTabWrote(localStorage, "names", JSON.stringify(["y"]));
        expect(kept.get()).toEqual(["y"]);
        otherTabWrote(localStorage, "names", JSON.stringify([1]));
        expect(kept.get()).toEqual(["x"]);
        localStorage.setItem("checked", "7");
        const checked = stored("checked", 0, {
            validate: (): boolean =>
            {
                throw new Error("no");
            }
        });
        expect(checked.get()).toBe(0);
        localStorage.setItem("accepted", "[\"z\"]");
        expect(stored<string[]>("accepted", [], { validate: isNames }).get()).toEqual(["z"]);
        expect(heard.map((record) => `${record.code} ${record.args?.["key"]}`)).toEqual(["state_storage_unreadable names", "state_storage_unreadable names", "state_storage_unreadable checked"]);
    });

    it("stops writing and following other tabs when the enclosing owner is disposed", () =>
    {
        const handle = scope(() => stored("owned", 0));
        otherTabWrote(localStorage, "owned", "5");
        localStorage.setItem("owned", "5");
        otherTabWrote(localStorage, "owned", "5");
        expect(handle.value.get()).toBe(5);
        handle.dispose();
        localStorage.setItem("owned", "6");
        otherTabWrote(localStorage, "owned", "6");
        expect(handle.value.get()).toBe(5);
        handle.value.set(7);
        expect(localStorage.getItem("owned")).toBe("6");
    });

    it("honors the signal's own equality", () =>
    {
        const point = stored("point", { x: 1 }, { equals: (a, b) => a.x === b.x });
        point.set({ x: 1 });
        expect(localStorage.getItem("point")).toBeNull();
        point.set({ x: 2 });
        expect(localStorage.getItem("point")).toBe("{\"x\":2}");
    });

    it("keeps the value in memory and reports once that storage is unavailable", () =>
    {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() =>
        {
            throw new Error("denied");
        });
        const first = stored("memory", 1);
        const second = stored("memory", 2);
        first.set(3);
        expect([first.get(), second.get()]).toEqual([3, 2]);
        expect(heard.map((record) => `${record.code} ${record.args?.["storage"]} ${record.args?.["key"]}`)).toEqual(["state_storage_unavailable local memory"]);
    });

    it("keeps the value and reports that storage refused a write", () =>
    {
        const count = stored("full", 1);
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() =>
        {
            throw new Error("quota");
        });
        count.set(2);
        expect(count.get()).toBe(2);
        expect(localStorage.getItem("full")).toBeNull();
        expect(heard.map((record) => `${record.code} ${record.args?.["storage"]} ${record.args?.["key"]}`)).toEqual(["state_storage_unavailable local full"]);
    });

    it("removes the key for undefined, which reads back as the initial value", () =>
    {
        const pick = stored<number | undefined>("pick", 7);
        pick.set(3);
        pick.set(undefined);
        expect(localStorage.getItem("pick")).toBeNull();
        expect(pick.get()).toBeUndefined();
        otherTabWrote(localStorage, "pick", null);
        expect(pick.get()).toBe(7);
        expect(heard).toEqual([]);
    });

    it("keeps a value JSON cannot hold in memory alone and reports it", () =>
    {
        const big = stored<number | bigint>("big", 1);
        big.set(2);
        big.set(3n);
        expect(big.get()).toBe(3n);
        expect(localStorage.getItem("big")).toBe("2");
        expect(heard.map((record) => `${record.code} ${record.args?.["key"]}`)).toEqual(["state_value_not_json big"]);
    });

    it("keeps a function in memory alone and reports it, since JSON leaves it out", () =>
    {
        const action = stored<number | (() => number)>("action", 1);
        action.set(2);
        action.set(() => 3);
        expect(localStorage.getItem("action")).toBe("2");
        expect(heard.map((record) => `${record.code} ${record.args?.["key"]}`)).toEqual(["state_value_not_json action"]);
    });

    it("reports a second stored signal for a key, and none once the first is disposed", () =>
    {
        stored("twice", 1);
        stored("twice", 2);
        expect(heard.map((record) => `${record.code} ${record.args?.["storage"]} ${record.args?.["key"]}`)).toEqual(["state_key_duplicate local twice"]);
        heard.length = 0;
        const handle = scope(() => stored("again", 1));
        handle.dispose();
        stored("again", 2);
        stored("again", 1, { storage: "session" });
        expect(heard).toEqual([]);
    });
});

describe("history", () =>
{
    it("goes back to checkpoints and forward again, tells whether it can, and starts a new branch after a checkpoint", () =>
    {
        const text = signal("");
        const edits = history(text);
        expect(edits.canUndo.get()).toBe(false);
        expect(edits.undo()).toBe(false);
        edits.checkpoint();
        text.set("a");
        edits.checkpoint();
        text.set("ab");
        expect(edits.canUndo.get()).toBe(true);
        expect(edits.canRedo.get()).toBe(false);
        expect(edits.undo()).toBe(true);
        expect(text.get()).toBe("a");
        expect(edits.canRedo.get()).toBe(true);
        expect(edits.undo()).toBe(true);
        expect(text.get()).toBe("");
        expect(edits.canUndo.get()).toBe(false);
        expect(edits.redo()).toBe(true);
        expect(text.get()).toBe("a");
        edits.checkpoint();
        expect(edits.canRedo.get()).toBe(false);
        expect(edits.redo()).toBe(false);
        text.set("ac");
        expect(edits.undo()).toBe(true);
        expect(text.get()).toBe("a");
        expect(edits.source).toBe(text);
    });

    it("keeps at most the limit of checkpoints, dropping the oldest, and forgets everything on dispose", () =>
    {
        const count = signal(0);
        const edits = history(count, { limit: 2 });
        for (const value of [1, 2, 3])
        {
            edits.checkpoint();
            count.set(value);
        }
        expect(edits.undo()).toBe(true);
        expect(count.get()).toBe(2);
        expect(edits.undo()).toBe(true);
        expect(count.get()).toBe(1);
        expect(edits.undo()).toBe(false);
        edits.checkpoint();
        count.set(9);
        edits.checkpoint();
        count.set(10);
        expect(edits.undo()).toBe(true);
        expect([edits.canUndo.get(), edits.canRedo.get()]).toEqual([true, true]);
        edits.dispose();
        expect([edits.canUndo.get(), edits.canRedo.get()]).toEqual([false, false]);
        expect(edits.undo()).toBe(false);
        expect(edits.redo()).toBe(false);
        expect(count.get()).toBe(9);
    });

    it("forgets its checkpoints when another tab writes the stored signal it follows, so an undo never takes that change back", () =>
    {
        const list = stored("list", ["a"]);
        const changes = history(list);
        changes.checkpoint();
        list.set(["a", "b"]);
        changes.checkpoint();
        list.set(["a", "b", "c"]);
        changes.undo();
        expect([changes.canUndo.get(), changes.canRedo.get()]).toEqual([true, true]);
        otherTabWrote(localStorage, "list", JSON.stringify(["d"]));
        expect(list.get()).toEqual(["d"]);
        expect([changes.canUndo.get(), changes.canRedo.get()]).toEqual([false, false]);
        expect(changes.undo()).toBe(false);
        expect(changes.redo()).toBe(false);
        expect(list.get()).toEqual(["d"]);
        changes.checkpoint();
        list.set(["e"]);
        expect(changes.undo()).toBe(true);
        expect(list.get()).toEqual(["d"]);
    });

    it("stops listening for other tabs' writes when the owner it was created in is disposed", () =>
    {
        const draft = stored("draft", "");
        const handle = scope(() => history(draft));
        handle.value.checkpoint();
        draft.set("hello");
        handle.dispose();
        otherTabWrote(localStorage, "draft", JSON.stringify("from another tab"));
        expect(handle.value.canUndo.get()).toBe(true);
    });

    it("keeps the default limit for one that is not a finite number", () =>
    {
        const count = signal(0);
        const edits = history(count, { limit: Number.NaN });
        for (let value = 1; value <= 51; value += 1)
        {
            edits.checkpoint();
            count.set(value);
        }
        let undone = 0;
        while (edits.undo())
        {
            undone += 1;
        }
        expect(undone).toBe(50);
    });

    it("writes the signal and both flags in one batch", () =>
    {
        const text = signal("");
        const edits = history(text);
        const seen: string[] = [];
        effect(() =>
        {
            seen.push(`${text.get()} ${edits.canUndo.get()} ${edits.canRedo.get()}`);
        });
        edits.checkpoint();
        text.set("a");
        seen.length = 0;
        edits.undo();
        expect(seen).toEqual([" false true"]);
        edits.redo();
        expect(seen).toEqual([" false true", "a true false"]);
    });
});

describe("debounced", () =>
{
    it("follows the source once it has been quiet for the time, starting at its value", async () =>
    {
        const query = signal("a");
        const settled = debounced(query, 30);
        expect(settled.get()).toBe("a");
        query.set("ab");
        query.set("abc");
        expect(settled.get()).toBe("a");
        await after(30);
        expect(settled.get()).toBe("abc");
    });

    it("drops a pending change when the enclosing owner is disposed", async () =>
    {
        const query = signal("a");
        const handle = scope(() => debounced(query, 30));
        query.set("ab");
        handle.dispose();
        await after(30);
        expect(handle.value.get()).toBe("a");
    });
});

describe("throttled", () =>
{
    it("shows the first change at once and the last one in the window when it ends", async () =>
    {
        const position = signal(0);
        const steady = throttled(position, 40);
        expect(steady.get()).toBe(0);
        position.set(1);
        expect(steady.get()).toBe(1);
        position.set(2);
        position.set(3);
        expect(steady.get()).toBe(1);
        await after(40);
        expect(steady.get()).toBe(3);
        await after(40);
        position.set(4);
        expect(steady.get()).toBe(4);
    });

    it("drops a pending change when the enclosing owner is disposed", async () =>
    {
        const position = signal(0);
        const handle = scope(() => throttled(position, 40));
        position.set(1);
        position.set(2);
        handle.dispose();
        await after(40);
        expect(handle.value.get()).toBe(1);
    });

    it("drops a change still pending when a newer one shows after its window is over", async () =>
    {
        const position = signal(0);
        const steady = throttled(position, 30);
        position.set(1);
        position.set(2);
        block(45);
        position.set(3);
        expect(steady.get()).toBe(3);
        await after(30);
        expect(steady.get()).toBe(3);
    });
});

describe("selector", () =>
{
    it("gives each key a signal that is true for the selected one, updates two keys on a change, and shares a key's signal", () =>
    {
        const selected = signal<number | null>(null);
        const isSelected = selector(selected);
        const one = isSelected(1);
        const two = isSelected(2);
        expect([one.get(), two.get()]).toEqual([false, false]);
        selected.set(1);
        expect([one.get(), two.get()]).toEqual([true, false]);
        selected.set(2);
        expect([one.get(), two.get()]).toEqual([false, true]);
        expect(isSelected(2)).toBe(two);
        expect(isSelected(3).get()).toBe(false);
        selected.set(null);
        expect([one.get(), two.get()]).toEqual([false, false]);
    });

    it("treats keys as a Map does, so NaN is one key", () =>
    {
        const selected = signal(Number.NaN);
        const isSelected = selector(selected);
        expect(isSelected(Number.NaN).get()).toBe(true);
        selected.set(1);
        expect(isSelected(Number.NaN).get()).toBe(false);
        selected.set(Number.NaN);
        expect(isSelected(Number.NaN).get()).toBe(true);
    });
});
