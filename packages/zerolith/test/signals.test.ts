import { describe, expect, it, vi } from "vitest";
import { type EffectFunction, ZerolithError, batch, computed, effect, onDiagnostic, onDispose, scope, signal, untracked } from "zerolith";
import { diagnostic } from "../src/diagnostics.ts";
import { jsx } from "../src/jsx-runtime.ts";

/** An effect function written `async`, which TypeScript refuses and JavaScript cannot. */
const asyncEffect = (fn: () => Promise<void>): EffectFunction => fn as unknown as EffectFunction;

function codeOf(fn: () => unknown): string | undefined
{
    try
    {
        fn();
    }
    catch (error)
    {
        if (error instanceof ZerolithError)
        {
            return error.diagnostic.code;
        }
        throw error;
    }
    return undefined;
}

describe("signal", () =>
{
    it("stores and returns a value", () =>
    {
        const count = signal(1);
        expect(count.get()).toBe(1);
        count.set(2);
        expect(count.get()).toBe(2);
    });

    it("ignores writes of an equal value", () =>
    {
        const count = signal(1);
        const runs = vi.fn(() => { count.get(); });
        effect(runs);
        count.set(1);
        expect(runs).toHaveBeenCalledTimes(1);
    });

    it("uses Object.is by default and a custom equals when given", () =>
    {
        const nan = signal(Number.NaN);
        const runs = vi.fn(() => { nan.get(); });
        effect(runs);
        nan.set(Number.NaN);
        expect(runs).toHaveBeenCalledTimes(1);

        const point = signal({ x: 1 }, { equals: (a, b) => a.x === b.x });
        const pointRuns = vi.fn(() => { point.get(); });
        effect(pointRuns);
        point.set({ x: 1 });
        expect(pointRuns).toHaveBeenCalledTimes(1);
        point.set({ x: 2 });
        expect(pointRuns).toHaveBeenCalledTimes(2);
    });
});

describe("computed", () =>
{
    it("refuses a write inside its function whatever tracking the write runs under", () =>
    {
        const a = signal(1);
        const direct = computed(() => a.set(2));
        expect(codeOf(() => direct.get())).toBe("signal_written_inside_computed");
        const hidden = computed(() => untracked(() => a.set(3)));
        expect(codeOf(() => hidden.get())).toBe("signal_written_inside_computed");
        const through = computed(() =>
        {
            effect(() => a.set(4));
        });
        expect(codeOf(() => through.get())).toBe("signal_written_inside_computed");
        expect(a.get()).toBe(1);
        const reads = computed(() => untracked(() => a.get()) + 1);
        expect(reads.get()).toBe(2);
    });

    it("takes an equality option as signals do", () =>
    {
        const a = signal(1);
        const parity = computed(() => a.get() % 2, { equals: (previous, next) => previous === next });
        const seen = vi.fn(() =>
        {
            parity.get();
        });
        effect(seen);
        a.set(3);
        expect(seen).toHaveBeenCalledTimes(1);
        a.set(4);
        expect(seen).toHaveBeenCalledTimes(2);
    });

    it("is lazy and memoized", () =>
    {
        const a = signal(1);
        const fn = vi.fn(() => a.get() * 2);
        const double = computed(fn);
        expect(fn).not.toHaveBeenCalled();
        expect(double.get()).toBe(2);
        expect(double.get()).toBe(2);
        expect(fn).toHaveBeenCalledTimes(1);
        a.set(5);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(double.get()).toBe(10);
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("does not recompute when an unrelated signal changes", () =>
    {
        const a = signal(1);
        const b = signal(1);
        const fn = vi.fn(() => { a.get(); });
        const value = computed(fn);
        value.get();
        b.set(2);
        value.get();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("tracks dependencies dynamically", () =>
    {
        const useA = signal(true);
        const a = signal("a");
        const b = signal("b");
        const fn = vi.fn(() => (useA.get() ? a.get() : b.get()));
        const value = computed(fn);
        expect(value.get()).toBe("a");
        b.set("b2");
        expect(value.get()).toBe("a");
        expect(fn).toHaveBeenCalledTimes(1);
        useA.set(false);
        expect(value.get()).toBe("b2");
        a.set("a2");
        expect(value.get()).toBe("b2");
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("stops propagating when its own value does not change", () =>
    {
        const n = signal(1);
        const parity = computed(() => n.get() % 2);
        const runs = vi.fn(() => { parity.get(); });
        effect(runs);
        n.set(3);
        expect(runs).toHaveBeenCalledTimes(1);
        n.set(4);
        expect(runs).toHaveBeenCalledTimes(2);
    });

    it("evaluates a diamond once per change with no glitch", () =>
    {
        const a = signal(1);
        const left = vi.fn(() => a.get() + 1);
        const right = vi.fn(() => a.get() * 10);
        const l = computed(left);
        const r = computed(right);
        const seen: number[][] = [];
        effect(() =>
        {
            seen.push([l.get(), r.get()]);
        });
        a.set(2);
        expect(seen).toEqual([[2, 10], [3, 20]]);
        expect(left).toHaveBeenCalledTimes(2);
        expect(right).toHaveBeenCalledTimes(2);
    });

    it("throws on a cycle with a coded error", () =>
    {
        const cyclic: { get(): number } = computed((): number => cyclic.get() + 1);
        expect(codeOf(() => cyclic.get())).toBe("computed_cycle");
    });

    it("rejects writes made inside its function", () =>
    {
        const a = signal(1);
        const bad = computed(() =>
        {
            a.set(2);
            return 0;
        });
        expect(codeOf(() => bad.get())).toBe("signal_written_inside_computed");
        expect(a.get()).toBe(1);
    });

    it("rethrows errors until a dependency changes", () =>
    {
        const a = signal(0);
        const fn = vi.fn(() =>
        {
            if (a.get() === 0)
            {
                throw new Error("zero");
            }
            return a.get();
        });
        const value = computed(fn);
        expect(() => value.get()).toThrow("zero");
        expect(() => value.get()).toThrow("zero");
        expect(fn).toHaveBeenCalledTimes(1);
        a.set(1);
        expect(value.get()).toBe(1);
    });

    it("unsubscribes from its sources when its last observer is disposed", () =>
    {
        const a = signal(1);
        const fn = vi.fn(() => a.get() * 2);
        const double = computed(fn);
        const dispose = effect(() =>
        {
            double.get();
        });
        expect(fn).toHaveBeenCalledTimes(1);
        a.set(2);
        expect(fn).toHaveBeenCalledTimes(2);
        dispose();
        a.set(3);
        expect(fn).toHaveBeenCalledTimes(2);
        expect(double.get()).toBe(6);
        expect(fn).toHaveBeenCalledTimes(3);
    });
});

describe("effect", () =>
{
    it("runs immediately and again on each change", () =>
    {
        const a = signal(1);
        const seen: number[] = [];
        effect(() =>
        {
            seen.push(a.get());
        });
        a.set(2);
        a.set(3);
        expect(seen).toEqual([1, 2, 3]);
    });

    it("runs its cleanup before the next run and on dispose", () =>
    {
        const a = signal(1);
        const log: string[] = [];
        const dispose = effect(() =>
        {
            const value = a.get();
            log.push(`run ${value}`);
            return () =>
            {
                log.push(`cleanup ${value}`);
            };
        });
        a.set(2);
        dispose();
        expect(log).toEqual(["run 1", "cleanup 1", "run 2", "cleanup 2"]);
    });

    it("stops after dispose", () =>
    {
        const a = signal(1);
        const runs = vi.fn(() => { a.get(); });
        const dispose = effect(runs);
        dispose();
        a.set(2);
        expect(runs).toHaveBeenCalledTimes(1);
    });

    it("disposes nested effects when it re-runs", () =>
    {
        const outer = signal(1);
        const inner = signal(1);
        const innerRuns = vi.fn(() => { inner.get(); });
        effect(() =>
        {
            outer.get();
            effect(innerRuns);
        });
        expect(innerRuns).toHaveBeenCalledTimes(1);
        outer.set(2);
        expect(innerRuns).toHaveBeenCalledTimes(2);
        inner.set(2);
        expect(innerRuns).toHaveBeenCalledTimes(3);
    });

    it("does not track reads made inside untracked()", () =>
    {
        const a = signal(1);
        const b = signal(1);
        const runs = vi.fn(() =>
        {
            a.get();
            untracked(() => b.get());
        });
        effect(runs);
        b.set(2);
        expect(runs).toHaveBeenCalledTimes(1);
        a.set(2);
        expect(runs).toHaveBeenCalledTimes(2);
    });

    it("may write signals it does not read", () =>
    {
        const source = signal(1);
        const mirror = signal(0);
        effect(() =>
        {
            mirror.set(source.get() * 10);
        });
        expect(mirror.get()).toBe(10);
        source.set(2);
        expect(mirror.get()).toBe(20);
    });

    it("rethrows an error from the first run and disposes itself", () =>
    {
        const a = signal(1);
        const runs = vi.fn(() =>
        {
            a.get();
            throw new Error("boom");
        });
        expect(() => effect(runs)).toThrow("boom");
        a.set(2);
        expect(runs).toHaveBeenCalledTimes(1);
    });

    it("keeps running other effects when one throws, then rethrows", () =>
    {
        const a = signal(1);
        const good = vi.fn(() => { a.get(); });
        effect(() =>
        {
            if (a.get() > 1)
            {
                throw new Error("later");
            }
        });
        effect(good);
        expect(() => a.set(2)).toThrow("later");
        expect(good).toHaveBeenCalledTimes(2);
    });

    it("detects an unbounded loop with a coded error and disposes the effect", () =>
    {
        const a = signal(0);
        const runs = vi.fn(() =>
        {
            a.set(a.get() + 1);
        });
        expect(codeOf(() => effect(runs))).toBe("effect_loop");
        const calls = runs.mock.calls.length;
        a.set(-1);
        expect(runs).toHaveBeenCalledTimes(calls);
    });

    it("disposes an effect that starts looping on a later run", () =>
    {
        const a = signal(0);
        const loop = signal(false);
        const runs = vi.fn(() =>
        {
            if (loop.get())
            {
                a.set(a.get() + 1);
            }
        });
        effect(runs);
        expect(codeOf(() => loop.set(true))).toBe("effect_loop");
        const calls = runs.mock.calls.length;
        a.set(-1);
        loop.set(false);
        expect(runs).toHaveBeenCalledTimes(calls);
    });

    it("keeps a new effect whose first run only made another effect throw", () =>
    {
        const a = signal(0);
        effect(() =>
        {
            if (a.get() === 1)
            {
                throw new Error("other");
            }
        });
        const runs = vi.fn(() =>
        {
            a.set(1);
        });
        expect(() => effect(runs)).toThrow("other");
        expect(runs).toHaveBeenCalledTimes(1);
        a.set(2);
        a.set(3);
        expect(runs).toHaveBeenCalledTimes(1);
        const kept = signal(0);
        const follows = vi.fn(() =>
        {
            kept.get();
            if (untracked(() => a.get()) === 1)
            {
                return;
            }
            a.set(1);
        });
        expect(() => effect(follows)).toThrow("other");
        expect(follows).toHaveBeenCalledTimes(1);
        kept.set(1);
        expect(follows).toHaveBeenCalledTimes(2);
    });

    it("throws both errors when its own function and a triggered effect throw", () =>
    {
        const a = signal(0);
        effect(() =>
        {
            if (a.get() === 1)
            {
                throw new Error("other");
            }
        });
        let caught: unknown;
        try
        {
            effect(() =>
            {
                a.set(1);
                throw new Error("own");
            });
        }
        catch (error)
        {
            caught = error;
        }
        expect(caught).toBeInstanceOf(AggregateError);
        expect((caught as AggregateError).errors.map((error) => (error as Error).message)).toEqual(["own", "other"]);
    });

    it("warns when the effect function returns a promise", () =>
    {
        const seen: string[] = [];
        const stop = onDiagnostic((record) => seen.push(record.code));
        const a = signal(0);
        effect(asyncEffect(async () =>
        {
            a.get();
        }));
        stop();
        expect(seen).toEqual(["effect_async"]);
    });
});

describe("batch", () =>
{
    it("throws the function's error, with the flush's beside it when an effect throws too", () =>
    {
        const a = signal(0);
        effect(() =>
        {
            if (a.get() === 1)
            {
                throw new Error("effect error");
            }
        });
        expect(() =>
            batch(() =>
            {
                throw new Error("caller error");
            })).toThrow("caller error");
        let caught: unknown;
        try
        {
            batch(() =>
            {
                a.set(1);
                throw new Error("caller error");
            });
        }
        catch (error)
        {
            caught = error;
        }
        expect(caught).toBeInstanceOf(AggregateError);
        expect((caught as AggregateError).errors.map((error) => (error as Error).message)).toEqual(["caller error", "effect error"]);
    });

    it("coalesces writes into one effect run", () =>
    {
        const a = signal(1);
        const b = signal(1);
        const runs = vi.fn(() =>
        {
            a.get();
            b.get();
        });
        effect(runs);
        batch(() =>
        {
            a.set(2);
            b.set(2);
            expect(runs).toHaveBeenCalledTimes(1);
        });
        expect(runs).toHaveBeenCalledTimes(2);
    });

    it("returns the function's value and nests", () =>
    {
        const a = signal(1);
        const runs = vi.fn(() => { a.get(); });
        effect(runs);
        const result = batch(() => batch(() =>
        {
            a.set(2);
            a.set(3);
            return "done";
        }));
        expect(result).toBe("done");
        expect(runs).toHaveBeenCalledTimes(2);
    });

    it("reads inside a batch see the latest value", () =>
    {
        const a = signal(1);
        const double = computed(() => a.get() * 2);
        batch(() =>
        {
            a.set(5);
            expect(double.get()).toBe(10);
        });
    });
});

describe("scope", () =>
{
    it("disposes the effects created inside it", () =>
    {
        const a = signal(1);
        const runs = vi.fn(() => { a.get(); });
        const handle = scope(() =>
        {
            effect(runs);
            return "value";
        });
        expect(handle.value).toBe("value");
        a.set(2);
        expect(runs).toHaveBeenCalledTimes(2);
        handle.dispose();
        a.set(3);
        expect(runs).toHaveBeenCalledTimes(2);
    });

    it("runs onDispose callbacks in reverse order and nests under effects", () =>
    {
        const log: string[] = [];
        const trigger = signal(0);
        effect(() =>
        {
            trigger.get();
            scope(() =>
            {
                onDispose(() => log.push("first"));
                onDispose(() => log.push("second"));
            });
        });
        trigger.set(1);
        expect(log).toEqual(["second", "first"]);
    });

    it("rejects onDispose outside any owner", () =>
    {
        expect(codeOf(() => onDispose(() => undefined))).toBe("on_dispose_outside_scope");
    });

    it("disposes every child when a cleanup throws, then rethrows that error", () =>
    {
        const a = signal(1);
        const runs = vi.fn(() => { a.get(); });
        const handle = scope(() =>
        {
            effect(runs);
            onDispose(() => { throw new Error("cleanup failed"); });
        });
        expect(() => handle.dispose()).toThrow("cleanup failed");
        a.set(2);
        expect(runs).toHaveBeenCalledTimes(1);
    });

    it("stops an effect's children and runs its cleanup when a child's cleanup throws on a rerun", () =>
    {
        const trigger = signal(0);
        const inner = signal(0);
        const innerRuns = vi.fn(() => { inner.get(); });
        let cleanups = 0;
        const handle = scope(() =>
        {
            effect(() =>
            {
                if (trigger.get() === 0)
                {
                    effect(innerRuns);
                    onDispose(() => { throw new Error("child cleanup failed"); });
                }
                return () => { cleanups++; };
            });
        });
        expect(() => trigger.set(1)).toThrow("child cleanup failed");
        inner.set(1);
        expect(innerRuns).toHaveBeenCalledTimes(1);
        expect(cleanups).toBe(1);
        handle.dispose();
    });

    it("does not run an effect again that its own cleanup disposed", () =>
    {
        const trigger = signal(0);
        let runs = 0;
        let stop: (() => void) | undefined;
        const handle = scope(() =>
        {
            stop = effect(() =>
            {
                trigger.get();
                runs++;
                return () => stop?.();
            });
        });
        trigger.set(1);
        expect(runs).toBe(1);
        trigger.set(2);
        expect(runs).toBe(1);
        handle.dispose();
    });

    it("throws every error of one update, the first alone or all in an AggregateError", () =>
    {
        const trigger = signal(0);
        const handle = scope(() =>
        {
            effect(() =>
            {
                if (trigger.get() > 0)
                {
                    throw new Error("first");
                }
            });
            effect(() =>
            {
                if (trigger.get() > 1)
                {
                    throw new Error("second");
                }
            });
        });
        expect(() => trigger.set(1)).toThrow("first");
        let thrown: unknown;
        try
        {
            trigger.set(2);
        }
        catch (error)
        {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(AggregateError);
        expect((thrown as AggregateError).errors.map((error: Error) => error.message).toSorted()).toEqual(["first", "second"]);
        handle.dispose();
    });

    it("disposes what was created before a throwing scope function", () =>
    {
        const a = signal(1);
        const runs = vi.fn(() => { a.get(); });
        expect(() => scope(() =>
        {
            effect(runs);
            throw new Error("setup failed");
        })).toThrow("setup failed");
        a.set(2);
        expect(runs).toHaveBeenCalledTimes(1);
    });
});

describe("diagnostics", () =>
{
    it("carries a stable code, cause, fix, and URL", () =>
    {
        try
        {
            onDispose(() => undefined);
        }
        catch (error)
        {
            expect(error).toBeInstanceOf(ZerolithError);
            const { diagnostic } = error as ZerolithError;
            expect(diagnostic.code).toBe("on_dispose_outside_scope");
            expect(diagnostic.severity).toBe("error");
            expect(diagnostic.cause).toMatch(/onDispose/);
            expect(diagnostic.fix.length).toBeGreaterThan(0);
            expect(diagnostic.url).toBe("https://zerolith.dev/e/on_dispose_outside_scope/");
            expect((error as Error).message).toContain("on_dispose_outside_scope");
            return;
        }
        throw new Error("expected a ZerolithError");
    });

    it("builds the page address, with a query only for arguments it has", () =>
    {
        let record: ZerolithError | undefined;
        try
        {
            jsx();
        }
        catch (error)
        {
            record = error as ZerolithError;
        }
        expect(record?.diagnostic.url).toBe("https://zerolith.dev/e/jsx_not_lowered/");
        expect(record?.diagnostic.args).toBeUndefined();
        const empty = diagnostic("jsx_not_lowered", "warning", {});
        expect(empty.url).toBe("https://zerolith.dev/e/jsx_not_lowered/");
        expect(empty.args).toBeUndefined();
        expect(diagnostic("jsx_not_lowered", "warning", { at: "x" }).url).toBe("https://zerolith.dev/e/jsx_not_lowered/?at=x");
    });

    it("stops delivering to a listener that was stopped", () =>
    {
        const seen: string[] = [];
        const stop = onDiagnostic((record) => seen.push(record.code));
        const a = signal(0);
        effect(asyncEffect(async () =>
        {
            a.get();
        }));
        expect(seen).toEqual(["effect_async"]);
        stop();
        a.set(1);
        expect(seen).toEqual(["effect_async"]);
    });
});
