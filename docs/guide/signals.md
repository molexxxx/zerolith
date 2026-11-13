---
title: Signals
description: "The reactive graph: signals for state, computed values, effects, untracked reads, batching, ownership, and async values with resource."
order: 2
group: Basics
---

# Signals

Everything that changes in a zerolith application is a signal, and everything that follows a change reads one. The graph has three kinds of node, and the rest of the library is built from them:

| Node | Holds | Runs |
| --- | --- | --- |
| `signal(value)` | State: a value you set | Never; it notifies what read it |
| `computed(fn)` | A value derived from other nodes | When read after one of its sources changed |
| `effect(fn)` | Nothing; it acts on the outside world | At once, then again after each change to what it read |

A template binding is an effect too: `${count}` in a template is an effect that writes one text node. That is why a page stays current without its components running again.

## Reading and writing

`get()` reads a signal and `set()` writes it. A read inside a computed value or an effect subscribes it; a read anywhere else is a plain read.

@include packages/zerolith/test/examples/signals.example.test.ts#basics

`set` ignores a value equal to the current one, by `Object.is` unless the signal was given its own `equals`. An ignored write notifies nothing, so a write that changes nothing costs nothing downstream.

`signal` and `computed` take the same options:

| Option | Default | What it does |
| --- | --- | --- |
| `name` | None | Labels the signal in the inspector; `zerolith dev` and the Vite plugin keep the value of a named `signal` across an edit, while a computed value is computed again |
| `equals` | `Object.is` | Decides whether a new value counts as a change; a value it calls equal notifies nothing |

> [!TIP]
> Give state a name, as `signal(0, { name: "count" })`. The inspector lists the signal under that name, and hot replacement in `zerolith dev` and the Vite plugin keeps its value when you edit the module that created it.

## Derived values

A computed value runs its function the first time it is read, remembers the result, and runs again only when a signal it read has changed and something reads it again:

@include packages/zerolith/test/examples/signals.example.test.ts#computed

Dependencies come from what the function actually read on its last run, so a branch it did not take subscribes to nothing, and a computed value nobody reads costs nothing at all.

> [!WARNING]
> A computed function only reads. Writing a signal inside one fails with `signal_written_inside_computed`; a value that has to change in response to another belongs in an effect, or is better written as a second computed value.

## Effects

An effect runs its function at once, then again after any change to a signal it read. It can return a cleanup function, which runs before its next run and when it is disposed:

@include packages/zerolith/test/examples/signals.example.test.ts#effects

Effects are for the world outside the graph: the document title, storage, a timer, a socket, a third-party widget. An effect created inside another effect belongs to it and is disposed when the outer effect runs again.

> [!NOTE]
> The page itself rarely needs one. A template binding already follows its signal, so an effect that copies a signal into the DOM duplicates what `${signal}` does.

An effect that keeps changing what it reads would run forever; after 100 rounds it fails with `effect_loop` and is disposed, whichever run looped. An effect whose function throws on its first run is disposed, and the error reaches the caller of `effect`; one that throws on a later run keeps running, and the error reaches whoever wrote the signal, after the other effects of that update ran. When a function and an effect its writes triggered both throw, the two arrive together as one `AggregateError`, as several effects throwing in one update already do. Cleanup runs newest first: the effects and scopes an effect created, then the function it returned.

An effect function is synchronous. One written `async` is tracked only up to its first `await`, and the promise it returns is not a cleanup, which `effect_async` warns about; start the asynchronous work inside the function and return what stops it.

## Reading without subscribing

`untracked` reads signals without making the running effect or computed value depend on them, for a value that should be current when the effect runs but should not make it run:

@include packages/zerolith/test/examples/signals.example.test.ts#untracked

## Batching

Writes inside `batch` are applied together, and the effects they affect run once, after the function returns. Writes inside an effect are batched the same way without asking.

@include packages/zerolith/test/examples/signals.example.test.ts#batch

## Ownership

Every effect belongs to an owner, and disposing the owner stops all of its effects at once. `render` owns what a view creates, each row of an `each` and each branch of a `when` owns what it creates, and each page of the router owns its own. `scope` makes an owner by hand, and `onDispose` adds cleanup to the owner that is running:

@include packages/zerolith/test/examples/signals.example.test.ts#scope

> [!TIP]
> A component that starts something, such as an interval or a listener on `window`, stops it with `onDispose`. It then cleans up wherever the component goes away: when its row leaves a list, its branch hides, its page changes, or its root is disposed. A component rendered at the top of the page needs the root's owner while it runs, so pass `render` a function that returns the view, as `render(() => App(), "#app")`: called directly, as `render(App(), "#app")`, it runs before the root exists and fails with `on_dispose_outside_scope`. `hydrate` and `renderToString` take a function the same way. A component passed by name, as `render(Counter, "#app")`, runs only when it takes no props; one that takes props fails with `mount_component_uncalled` rather than running without them.

## Async values

`resource` loads data from signals. Its `params` function reads the signals the request depends on, and its `loader` receives those params and an abort signal. Whenever the params change, the previous request is aborted and the loader runs again; when `params` returns `undefined`, the resource waits, idle. `params` runs as an effect's function does: once when the resource is created, and again whenever a signal it read changes, whatever it returns.

Params that read no signal load once; params that read a flag the component sets later, as `() => (ready.get() ? { id } : undefined)`, wait idle and load on the first change. A `params` function that throws fails the load as a loader does: `status` is `error` and `error` holds what it threw, until the signals it read change. `reload()` after the resource's owner is disposed does nothing.

@include packages/zerolith/test/examples/signals.example.test.ts#resource

A resource is itself a signal of its value, with its state beside it:

| Member | Holds |
| --- | --- |
| `get()` | The value the last successful load returned, or `undefined` before one has. It stays while the next load runs and after a load fails. |
| `status` | `"idle"`, `"pending"` while the loader runs or waits to retry, `"resolved"`, or `"error"` |
| `pending` | `true` while a load runs or waits to retry |
| `error` | What the last failed load threw, until the next load starts |
| `attempt` | The number of the current request's latest run: 1 for the first, one more as each retry starts, and 0 while idle or while `params` throws |
| `reload()` | Runs the loader again with the current params |

A result that arrives after newer params have started a load is dropped, so a slow first request never overwrites a fast second one. The abort signal fires when the params change, on `reload()`, and when the resource's owner is disposed; passing it to `fetch`, as above, cancels the request itself.

A loader that fails runs again when `retry` says so: `retry: 2` runs it twice more, the first time `backoff` milliseconds after the failure, 250 by default, and each wait after that twice the one before, until it reaches 30 seconds. `Infinity` keeps trying. `retryIf` decides which failures are worth another run: it gets what the run threw and the run's number, so below a response outside 2xx stops at once unless it is a server error, while a dropped connection or a timeout is tried again.

The resource stays pending through the retries, with `error` empty until the last failure, and a retry still waiting is dropped when the params change, on `reload()`, and when the owner is disposed. `timeout` bounds each run: a run that takes longer fails with `resource_timed_out`, its abort signal fires with that error as the reason, and a retry covers it like any failure. A run's abort signal stays live after the run settles, until the params change, a reload, or disposal, so a body still streaming ends with the request:

@include packages/zerolith/test/examples/signals.example.test.ts#resource-retry

## Which to use

| You hold | Use | An update costs |
| --- | --- | --- |
| One value | `signal` | The bindings that read it |
| A value derived from others | `computed` | A run when an input changed and something reads it, and nothing otherwise |
| A list replaced whole, as from a fetch | A signal of an array with [`each`](templates.md#lists) | One key comparison per row, with nodes touched only where rows changed |
| A list whose rows change one at a time | [A signal per changing field](templates.md#a-list-edited-a-row-at-a-time) in each row, set in one `batch` | Only the edited fields' bindings |
| Nested data edited a field at a time | A [store](state.md#nested-data-edited-in-place) from `@zerolith/state` | Only what reads the edited field, with no key comparison for an edit inside a row |
| Which row of a list is selected | [`selector`](state.md#a-selection-among-many) from `@zerolith/state` | Two rows, whatever the list's length |

## The functions at a glance

| Function | Takes | Returns |
| --- | --- | --- |
| `signal(value, options)` | The starting value, and `name` and `equals` | A signal, with `get()` and `set(value)` |
| `computed(fn, options)` | A function that reads signals, and `name` and `equals` | A read-only signal of what `fn` returns |
| `effect(fn)` | A function that may return a cleanup | A function that disposes the effect |
| `untracked(fn)` | A function whose reads subscribe nothing | What `fn` returns |
| `batch(fn)` | A function whose writes apply together | What `fn` returns |
| `scope(fn)` | A function whose effects belong to a new owner | The owner, with `value`, what `fn` returned, and `dispose()` |
| `onDispose(fn)` | A cleanup | Nothing; the running owner calls `fn` when it is disposed |
| `hasOwner()` | Nothing | True while an owner is running, so `onDispose` has one to register with; false in plain code |
| `isTracking()` | Nothing | True while a computed value, an effect, or a binding runs, where a signal read subscribes it; false in plain code, a component's setup, and `untracked` |
| `resource({ params, loader, timeout, retry, backoff, retryIf })` | A tracked `params` function, a `loader` that receives `{ params, abort }`, and how patient to be: a `timeout` per run, how many times to `retry`, the `backoff` before the first retry, and `retryIf`, which says whether a failure is worth another run | A resource, as the table above describes |
