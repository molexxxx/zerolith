// Server rendering on a runtime with Web Storage globals and no window, as
// Node has from 25: a stored signal is a plain one there, since that storage
// is one store for the whole process, shared by every request.
import { afterEach, beforeEach, expect, it } from "vitest";
import { type Diagnostic, onDiagnostic } from "zerolith";
import { stored } from "@zerolith/state";

/** A Storage stand-in that records every write. */
function memoryStorage(writes: string[]): Storage
{
    const items = new Map<string, string>();
    return {
        get length()
        {
            return items.size;
        },
        clear: () => items.clear(),
        getItem: (key: string) => items.get(key) ?? null,
        key: (index: number) => [...items.keys()][index] ?? null,
        removeItem: (key: string) =>
        {
            writes.push(`remove ${key}`);
            items.delete(key);
        },
        setItem: (key: string, value: string) =>
        {
            writes.push(`set ${key}`);
            items.set(key, value);
        }
    };
}

const writes: string[] = [];
const heard: Diagnostic[] = [];
let stop = (): void => undefined;

beforeEach(() =>
{
    Object.defineProperty(globalThis, "localStorage", { value: memoryStorage(writes), configurable: true, writable: true });
    Object.defineProperty(globalThis, "sessionStorage", { value: memoryStorage(writes), configurable: true, writable: true });
    stop = onDiagnostic((record) => heard.push(record));
});

afterEach(() =>
{
    stop();
    Reflect.deleteProperty(globalThis, "localStorage");
    Reflect.deleteProperty(globalThis, "sessionStorage");
    writes.length = 0;
    heard.length = 0;
});

it("is a plain signal on a server with Web Storage globals, writing nothing a later request could read", () =>
{
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
    const local = stored("server-local", "initial");
    const session = stored("server-session", "initial", { storage: "session" });
    local.set("one request");
    session.set("one request");
    expect([local.get(), session.get()]).toEqual(["one request", "one request"]);
    expect(writes).toEqual([]);
    expect(stored("server-session", "initial", { storage: "session" }).get()).toBe("initial");
    expect(heard.map((record) => record.code)).toContain("state_storage_unavailable");
});
