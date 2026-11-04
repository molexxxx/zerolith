/**
 * The parts bound on an element: an attribute, boolean attribute, or
 * property, a ref, and an event listener, each of the class its kind
 * needs, so a part holds only the fields that kind uses.
 */
import { URL_ATTRIBUTES, describe, join, safeUrl } from "../binding.js";
import { diagnostic, fail, report } from "../diagnostics.js";
import { type Disposable, type Signal, type Sink, createOwner, isSignal, onDispose, startBinding, startEffect, untracked } from "../signals.js";
import { ATTRIBUTE, BOOLEAN, EVENT, type PartSpec, REF } from "../template.js";
import type { BoundPart } from "./view.js";

interface HandlerObject
{
    handleEvent(event: Event): void;
    capture?: boolean;
    passive?: boolean;
    once?: boolean;
}

/** The part for a binding on an element, of the class its kind needs, so a part holds only the fields that kind uses. */
export function elementPart(element: Element, spec: PartSpec): BoundPart
{
    if (spec.kind === EVENT)
    {
        return new EventPart(element, spec);
    }
    if (spec.kind === REF)
    {
        return new RefPart(element, spec);
    }
    return new AttributePart(element, spec);
}

/** An attribute, boolean attribute, or property binding on one element. */
class AttributePart implements BoundPart, Sink
{
    readonly count: number;
    private readonly element: Element;
    private readonly spec: PartSpec;
    private owner: Disposable | undefined = undefined;

    constructor(element: Element, spec: PartSpec)
    {
        this.element = element;
        this.spec = spec;
        this.count = spec.count;
    }

    bind(values: readonly unknown[], offset: number): void
    {
        this.owner?.dispose();
        this.owner = undefined;
        if (this.count === 1)
        {
            const value = values[offset];
            if (isSignal(value))
            {
                this.owner = startBinding(value, this);
                return;
            }
            this.applyOne(value);
            return;
        }
        const own = values.slice(offset, offset + this.count);
        if (own.some(isSignal))
        {
            this.owner = startEffect(() =>
            {
                this.apply(own.map((value) => (isSignal(value) ? value.get() : value)));
            });
        }
        else
        {
            this.apply(own);
        }
    }

    /** Writes a bound signal's value to the one expression this part holds. */
    receive(value: unknown): void
    {
        this.applyOne(value);
    }

    /** Applies the values of an attribute with several expressions. */
    private apply(values: readonly unknown[]): void
    {
        this.write(join(this.spec.strings, values));
    }

    /** Applies the value of a part with one expression. */
    private applyOne(value: unknown): void
    {
        const { element, spec } = this;
        if (spec.kind === BOOLEAN)
        {
            if (value)
            {
                element.setAttribute(spec.name, "");
            }
            else
            {
                element.removeAttribute(spec.name);
            }
            return;
        }
        if (spec.kind === ATTRIBUTE)
        {
            if (value === null || value === undefined)
            {
                element.removeAttribute(spec.name);
                return;
            }
            const before = spec.strings[0] ?? "";
            const after = spec.strings[1] ?? "";
            this.write(before === "" && after === "" ? String(value) : before + String(value) + after);
            return;
        }
        if (URL_ATTRIBUTES.has(spec.name.toLowerCase()) && value !== null && value !== undefined && !safeUrl(String(value)))
        {
            element.removeAttribute(spec.name);
            report(diagnostic("unsafe_url_blocked", "warning", { attribute: `.${spec.name}`, value: String(value) }));
            return;
        }
        (element as unknown as Record<string, unknown>)[spec.name] = value;
    }

    /** Sets the attribute, or removes it and reports `unsafe_url_blocked` for a URL attribute with an unsafe scheme. */
    private write(text: string): void
    {
        const { element, spec } = this;
        if (URL_ATTRIBUTES.has(spec.name.toLowerCase()) && !safeUrl(text))
        {
            element.removeAttribute(spec.name);
            report(diagnostic("unsafe_url_blocked", "warning", { attribute: spec.name, value: text }));
            return;
        }
        element.setAttribute(spec.name, text);
    }
}

/** A ref binding on one element. */
class RefPart implements BoundPart
{
    readonly count: number;
    private readonly element: Element;
    private owner: Disposable | undefined = undefined;
    private target: unknown = undefined;

    constructor(element: Element, spec: PartSpec)
    {
        this.element = element;
        this.count = spec.count;
    }

    bind(values: readonly unknown[], offset: number): void
    {
        this.reference(values[offset]);
    }

    /**
     * Hands the element to a writable signal or a callback, or to nothing
     * for `null` or `undefined`, as a `null` handler adds no listener; the
     * signal is reset when the element's template is removed. When the owner around
     * the binding is disposed while the element stays, as when a signal
     * applies the template again, the next bind hands the element over again.
     */
    private reference(target: unknown): void
    {
        if (target === this.target)
        {
            return;
        }
        this.owner?.dispose();
        this.target = target;
        if (target === null || target === undefined)
        {
            this.owner = undefined;
            return;
        }
        const owner = createOwner();
        this.owner = owner;
        owner.run(() =>
        {
            onDispose(() =>
            {
                this.target = undefined;
            });
            const { element } = this;
            if (typeof target === "function")
            {
                (target as (element: Element) => void)(element);
                return;
            }
            if (isSignal(target) && typeof (target as Partial<Signal<unknown>>).set === "function")
            {
                const holder = target as Signal<Element | undefined>;
                holder.set(element);
                onDispose(() =>
                {
                    if (untracked(() => holder.get()) === element)
                    {
                        holder.set(undefined);
                    }
                });
                return;
            }
            throw fail("ref_not_assignable", { type: describe(target) });
        });
    }
}

/** An event binding on one element: its handler is a listener on that element, swapped when the template updates. */
class EventPart implements BoundPart
{
    readonly count: number;
    private readonly element: Element;
    private readonly spec: PartSpec;
    private listener: EventListenerOrEventListenerObject | undefined = undefined;
    private listenerOptions: AddEventListenerOptions | undefined = undefined;

    constructor(element: Element, spec: PartSpec)
    {
        this.element = element;
        this.spec = spec;
        this.count = spec.count;
    }

    bind(values: readonly unknown[], offset: number): void
    {
        this.listen(values[offset]);
    }

    private listen(handler: unknown): void
    {
        if (this.listener !== undefined)
        {
            this.element.removeEventListener(this.spec.name, this.listener, this.listenerOptions);
            this.listener = undefined;
            this.listenerOptions = undefined;
        }
        if (handler === null || handler === undefined)
        {
            return;
        }
        if (typeof handler === "function")
        {
            this.listener = handler as EventListener;
        }
        else if (typeof handler === "object" && typeof (handler as HandlerObject).handleEvent === "function")
        {
            const object = handler as HandlerObject;
            this.listener = object;
            const options: AddEventListenerOptions = {};
            if (object.capture !== undefined)
            {
                options.capture = object.capture;
            }
            if (object.passive !== undefined)
            {
                options.passive = object.passive;
            }
            if (object.once !== undefined)
            {
                options.once = object.once;
            }
            this.listenerOptions = options;
        }
        else
        {
            throw fail("event_handler_not_function", { event: this.spec.name, type: describe(handler) });
        }
        this.element.addEventListener(this.spec.name, this.listener, this.listenerOptions);
    }
}
