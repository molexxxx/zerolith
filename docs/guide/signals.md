---
title: Signals
description: State, derived values, effects, batching, ownership, and async values in the reactive graph.
order: 1
---

# Signals

A signal holds a value and tells the graph when it changes. `computed` derives a value lazily and remembers it. `effect` runs code when the signals it read change. That is the whole model; there is no second one.

## Reading and writing

@include packages/zerolith/test/examples/signals.example.test.ts#basics

`set` ignores a value equal to the current one (`Object.is` by default; pass `equals` to decide otherwise).

## Derived values

A computed value runs its function on first read and again only when a dependency changed. Dependencies are tracked from what the function actually reads, so a branch that is not taken does not subscribe.

@include packages/zerolith/test/examples/signals.example.test.ts#computed

A computed function must not write signals. Doing so fails with `signal_written_inside_computed`.

## Effects

An effect runs immediately and again after any batch in which one of its dependencies changed. It can return a cleanup function, which runs before the next run and when the effect is disposed.

@include packages/zerolith/test/examples/signals.example.test.ts#effects

Effects created inside an effect are disposed when the outer effect re-runs. An effect that keeps re-triggering itself fails with `effect_loop` after 100 rounds.

## Batching

Several writes in one `batch` run the affected effects once, after the function returns. Writes inside an effect are batched automatically.

@include packages/zerolith/test/examples/signals.example.test.ts#batch

## Ownership

`scope` owns every effect created inside it, so a part of the application can be torn down as a unit. `onDispose` registers cleanup with the enclosing effect or scope.

@include packages/zerolith/test/examples/signals.example.test.ts#scope

## Async values

`resource` runs a loader when the signals read by `params` change, aborts the previous request, and exposes the outcome as signals. Returning `undefined` from `params` keeps the resource idle.

@include packages/zerolith/test/examples/signals.example.test.ts#resource
