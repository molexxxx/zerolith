/**
 * Async values in the reactive graph. A resource re-runs its loader when
 * the signals read by `params` change, aborts the previous request, ignores
 * stale results, and exposes the outcome as signals.
 */
import { type ReadableSignal, batch, computed, effect, signal, untracked } from "./signals.js";

/** The lifecycle of a resource's current request. */
export type ResourceStatus = "idle" | "pending" | "resolved" | "error";

/** What the loader receives. */
export interface LoaderContext<P>
{
    /** The value `params` returned; never undefined, because undefined skips loading. */
    params: P;
    /** Aborted when the params change, on reload, and when the owning scope is disposed. */
    abort: AbortSignal;
}

/** What `resource()` takes: a tracked params function and an untracked loader. */
export interface ResourceOptions<P, T>
{
    /** Tracked: the signals it reads decide when the loader re-runs. Returning undefined puts the resource in the idle state. */
    params: () => P | undefined;
    /** Untracked: fetches the value for the given params. */
    loader: (context: LoaderContext<P>) => Promise<T>;
}

/** An async value and its request state. */
export interface Resource<T> extends ReadableSignal<T | undefined>
{
    /** The last resolved value; kept while a newer request is pending. */
    get(): T | undefined;
    readonly status: ReadableSignal<ResourceStatus>;
    /** True while a request is in flight. */
    readonly pending: ReadableSignal<boolean>;
    /** The rejection of the latest request, or undefined. */
    readonly error: ReadableSignal<unknown>;
    /** Runs the loader again with the current params. */
    reload(): void;
}

/** Creates a resource owned by the current effect or scope. */
export function resource<P, T>(options: ResourceOptions<P, T>): Resource<T>
{
    const value = signal<T | undefined>(undefined);
    const error = signal<unknown>(undefined);
    const status = signal<ResourceStatus>("idle");
    let controller: AbortController | undefined;
    let generation = 0;
    let current: P | undefined;

    const load = (params: P | undefined): void =>
    {
        controller?.abort();
        controller = undefined;
        generation++;
        if (params === undefined)
        {
            batch(() =>
            {
                status.set("idle");
                error.set(undefined);
            });
            return;
        }
        const run = generation;
        const abort = new AbortController();
        controller = abort;
        batch(() =>
        {
            status.set("pending");
            error.set(undefined);
        });
        options.loader({ params, abort: abort.signal }).then(
            (result) =>
            {
                if (run !== generation)
                {
                    return;
                }
                batch(() =>
                {
                    value.set(result);
                    status.set("resolved");
                });
            },
            (reason: unknown) =>
            {
                if (run !== generation)
                {
                    return;
                }
                batch(() =>
                {
                    error.set(reason);
                    status.set("error");
                });
            }
        );
    };

    effect(() =>
    {
        const params = options.params();
        current = params;
        untracked(() =>
        {
            load(params);
        });
        return () =>
        {
            generation++;
            controller?.abort();
            controller = undefined;
        };
    });

    return {
        get: () => value.get(),
        status,
        pending: computed(() => status.get() === "pending"),
        error,
        reload: () =>
        {
            load(current);
        }
    };
}
