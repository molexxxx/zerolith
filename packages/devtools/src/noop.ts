/**
 * The production entry of @zerolith/devtools: the same surface as the
 * inspector, doing nothing.
 */

/** Options for `mountDevtools`. */
export interface DevtoolsOptions
{
    /** Start with the dock open. Defaults to false. */
    open?: boolean;
}

/** The handle returned by `mountDevtools`. */
export interface DevtoolsHandle
{
    /** Shows or hides the dock. */
    toggle(open?: boolean): void;
    /** Removes the dock. */
    dispose(): void;
}

/** Does nothing in production builds. */
export function mountDevtools(_options?: DevtoolsOptions): DevtoolsHandle
{
    return {
        toggle(): void
        {
        },
        dispose(): void
        {
        }
    };
}
