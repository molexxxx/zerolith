<!-- Generated from docs/guide/signals.md by npm run skills. Edit the guide, then regenerate. -->

# Signals

A signal holds a value and tells the graph when it changes. `computed` derives a value lazily and remembers it. `effect` runs code when the signals it read change. That is the whole model; there is no second one.

## Reading and writing

```ts
import { signal } from "zerolith";

const count = signal(0);
count.set(count.get() + 1);
console.log(count.get());               // 1

const point = signal({ x: 1 }, { equals: (a, b) => a.x === b.x });
point.set({ x: 1 });                    // ignored: equal by the custom comparison
```

`set` ignores a value equal to the current one (`Object.is` by default; pass `equals` to decide otherwise).

## Derived values

A computed value runs its function on first read and again only when a dependency changed. Dependencies are tracked from what the function actually reads, so a branch that is not taken does not subscribe.

```ts
import { computed, signal } from "zerolith";

const price = signal(10);
const quantity = signal(2);
const total = computed(() => price.get() * quantity.get());

console.log(total.get());               // 20
quantity.set(3);
console.log(total.get());               // 30
```

A computed function must not write signals. Doing so fails with `signal_written_inside_computed`.

## Effects

An effect runs immediately and again after any batch in which one of its dependencies changed. It can return a cleanup function, which runs before the next run and when the effect is disposed.

```ts
import { effect, signal } from "zerolith";

const name = signal("Ada");

const dispose = effect(() =>
{
    const current = name.get();
    console.log(`hello ${current}`);
    return () => console.log(`goodbye ${current}`);
});                                     // prints "hello Ada" right away

name.set("Grace");                      // prints "goodbye Ada", then "hello Grace"
dispose();                              // prints "goodbye Grace"
```

Effects created inside an effect are disposed when the outer effect re-runs. An effect that keeps re-triggering itself fails with `effect_loop` after 100 rounds.

## Batching

Several writes in one `batch` run the affected effects once, after the function returns. Writes inside an effect are batched automatically.

```ts
import { batch, effect, signal } from "zerolith";

const first = signal("Ada");
const last = signal("Lovelace");
effect(() => console.log(`${first.get()} ${last.get()}`)); // prints "Ada Lovelace"

batch(() =>
{
    first.set("Grace");
    last.set("Hopper");
});                                     // prints "Grace Hopper", once
```

## Ownership

`scope` owns every effect created inside it, so a part of the application can be torn down as a unit. `onDispose` registers cleanup with the enclosing effect or scope.

```ts
import { effect, onDispose, scope, signal } from "zerolith";

const tick = signal(0);

const handle = scope(() =>
{
    effect(() => console.log(`tick ${tick.get()}`));
    onDispose(() => console.log("disposed"));
});                                     // prints "tick 0"

tick.set(1);                            // prints "tick 1"
handle.dispose();                       // prints "disposed"
tick.set(2);                            // prints nothing: the effect is gone
```

## Async values

`resource` runs a loader when the signals read by `params` change, aborts the previous request, and exposes the outcome as signals. Returning `undefined` from `params` keeps the resource idle.

```ts
import { resource, signal } from "zerolith";

const userId = signal<number | undefined>(undefined);
const user = resource({
    params: () => userId.get(),
    loader: async ({ params, abort }) =>
    {
        const response = await fetch(`/api/users/${params}`, { signal: abort });
        return (await response.json()) as { id: number; name: string };
    }
});

console.log(user.status.get());         // "idle": params returned undefined
userId.set(7);
console.log(user.status.get());         // "pending"
// Once the loader settles, the status is "resolved" and user.get() is the user.
```
