// Shared by the browser package's tests: pretending what the page reports, undone after each test.

const restores: (() => void)[] = [];

/** Makes `property` of `target` read `value` until `restorePretended` runs. */
export function pretend(target: object, property: string, value: unknown): void
{
    const original = Object.getOwnPropertyDescriptor(target, property);
    Object.defineProperty(target, property, { configurable: true, get: () => value });
    restores.push(() =>
    {
        if (original === undefined)
        {
            delete (target as Record<string, unknown>)[property];
        }
        else
        {
            Object.defineProperty(target, property, original);
        }
    });
}

/** Puts back every property `pretend` changed, newest first. */
export function restorePretended(): void
{
    for (const restore of restores.splice(0).toReversed())
    {
        restore();
    }
}
