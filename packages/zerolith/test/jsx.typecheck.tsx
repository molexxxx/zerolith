// What the JSX namespaces accept and refuse; `tsc` is the test, so a line marked ts-expect-error must fail to compile and every other line must pass.
import { type View, signal } from "zerolith";

const focus = (element: HTMLButtonElement): void => element.focus();

/** Bindings the types accept. */
export function accepted(): View
{
    const name = signal("");
    const flag = signal(false);
    const count = signal(0);
    const field = signal<HTMLInputElement | undefined>(undefined);
    const anyElement = signal<Element | undefined>(undefined);
    const handler = { handleEvent(event: MouseEvent): void { event.preventDefault(); }, passive: true };
    return (
        <main>
            <input prop:value={name} on:input={(event) => name.set(event.currentTarget.value)} bool:disabled={flag} ref={field} />
            <input prop:value="plain" prop:checked={true} bool:required ref={anyElement} />
            <button on:click={() => count.set(count.get() + 1)} on:keydown={(event) => event.key} on:pointerdown={handler} ref={focus}>
                {count}
            </button>
            <button on:click={null} on:focus={undefined} bool:disabled={undefined}>Idle</button>
            <p id={name} title="plain" data-count={count} aria-hidden={flag} prop:textContent={name}>
                Text
            </p>
            <my-element prop:anything={count} on:custom={(event: Event) => event.type} bool:open="any value" ref="any value" />
        </main>
    );
}

/** Bindings the types refuse. */
export function refused(): View
{
    const count = signal(0);
    return (
        <main>
            {/* @ts-expect-error a number is not an input's value */}
            <input prop:value={count} />
            {/* @ts-expect-error a div has no value to read from the event's target */}
            <div on:click={(event) => event.currentTarget.value}>Go</div>
            {/* @ts-expect-error a string is not a boolean */}
            <button bool:disabled="yes">Go</button>
            {/* @ts-expect-error a ref is a function of the element or a writable signal, not a string */}
            <input ref="field" />
            {/* @ts-expect-error a click handler receives a mouse event, not a keyboard event */}
            <button on:click={(event: KeyboardEvent) => event.key}>Go</button>
        </main>
    );
}
