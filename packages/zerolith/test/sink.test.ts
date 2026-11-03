import { describe, expect, it } from "vitest";
import { batch, effect, signal } from "zerolith";
import { type Sink, createOwner, startBinding } from "../src/signals.ts";

/** A sink that keeps every value it receives. */
function keeping(values: unknown[]): Sink
{
    return { receive: (value) => values.push(value) };
}

describe("startBinding", () =>
{
    it("gives its sink the signal's value now, then once for each change or batch of changes, until it is disposed", () =>
    {
        const values: unknown[] = [];
        const source = signal(1);
        const binding = startBinding(source, keeping(values));
        source.set(2);
        batch(() =>
        {
            source.set(3);
            source.set(4);
        });
        expect(values).toEqual([1, 2, 4]);
        binding.dispose();
        source.set(5);
        expect(values).toEqual([1, 2, 4]);
    });

    it("owns what its sink creates, disposing it before the next value, and is disposed with the owner it started under", () =>
    {
        const cleaned: unknown[] = [];
        const source = signal(1);
        const owner = createOwner();
        owner.run(() => startBinding(source, {
            receive: (value) =>
            {
                effect(() => () =>
                {
                    cleaned.push(value);
                });
            }
        }));
        source.set(2);
        expect(cleaned).toEqual([1]);
        owner.dispose();
        expect(cleaned).toEqual([1, 2]);
        source.set(3);
        expect(cleaned).toEqual([1, 2]);
    });

    it("tracks what its sink reads, as an effect's function does", () =>
    {
        const values: unknown[] = [];
        const source = signal(1);
        const suffix = signal("a");
        startBinding(source, { receive: (value) => values.push(`${String(value)}${suffix.get()}`) });
        suffix.set("b");
        expect(values).toEqual(["1a", "1b"]);
    });

    it("throws what its sink throws from the write that caused it, and keeps receiving afterward", () =>
    {
        const values: unknown[] = [];
        const source = signal(1);
        startBinding(source, {
            receive: (value) =>
            {
                if (value === 2)
                {
                    throw new Error("cannot show 2");
                }
                values.push(value);
            }
        });
        expect(() => source.set(2)).toThrow("cannot show 2");
        source.set(3);
        expect(values).toEqual([1, 3]);
    });
});
