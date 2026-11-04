/**
 * The conditional directive: one branch rendered while the condition
 * holds and the other while it does not, each created when first shown
 * and disposed when hidden.
 */
import { fail } from "../diagnostics.js";
import { type Owner, createOwner, onDispose, startEffect, untracked } from "../signals.js";
import { ChildPart } from "./instance.js";
import { anchorBefore, isStart, matchingEnd, mismatch, removeUntil } from "./markers.js";
import { type Controller, Directive, type Renderable, type View, read } from "./view.js";

class Conditional extends Directive
{
    readonly wrapsBranch: boolean = true;
    private readonly condition: unknown;
    private readonly whenTrue: () => unknown;
    private readonly whenFalse: (() => unknown) | undefined;

    constructor(condition: unknown, whenTrue: () => unknown, whenFalse: (() => unknown) | undefined)
    {
        super();
        this.condition = condition;
        this.whenTrue = whenTrue;
        this.whenFalse = whenFalse;
    }

    override mount(part: ChildPart, cursor?: ChildNode): Controller
    {
        const end = part.marker();
        const owner = createOwner();
        let inner: ChildPart;
        let shown: boolean | undefined;
        let branch: Owner | undefined;
        owner.run(() =>
        {
            onDispose(() => branch?.dispose());
        });
        const innerEnd = cursor !== undefined && isStart(cursor) ? matchingEnd(cursor) : undefined;
        if (cursor !== undefined && innerEnd !== undefined)
        {
            inner = new ChildPart(innerEnd);
            owner.run(() =>
            {
                shown = Boolean(untracked(() => read(this.condition)));
                branch = createOwner(true);
                branch.run(() =>
                {
                    inner.set(shown ? this.whenTrue() : this.whenFalse?.(), cursor.nextSibling ?? innerEnd);
                });
            });
            if (innerEnd.nextSibling !== end)
            {
                mismatch("extra", "", innerEnd.nextSibling?.nodeName ?? "");
                removeUntil(innerEnd.nextSibling as ChildNode, end);
            }
        }
        else
        {
            if (cursor !== undefined)
            {
                mismatch("missing", "branch", cursor === end ? "" : cursor.nodeName);
                removeUntil(cursor, end);
            }
            inner = new ChildPart(anchorBefore(end));
        }
        owner.run(() =>
        {
            startEffect(() =>
            {
                const next = Boolean(read(this.condition));
                if (next === shown)
                {
                    return;
                }
                shown = next;
                owner.run(() =>
                {
                    branch?.dispose();
                    branch = createOwner(true);
                    branch.run(() =>
                    {
                        inner.set(next ? this.whenTrue() : this.whenFalse?.());
                    });
                });
            });
        });
        return {
            dispose(): void
            {
                owner.dispose();
                inner.destroy();
            }
        };
    }

    override resolve(): unknown
    {
        return read(this.condition) ? this.whenTrue() : this.whenFalse?.();
    }
}

/**
 * Renders `then()` while the condition is truthy and `otherwise()` while
 * it is not. The condition is a signal, such as a computed value, or a
 * plain value; a function fails with `when_condition_function`, since it
 * would always count as true. Branches are created lazily and disposed
 * when hidden.
 */
export function when(condition: unknown, then: () => Renderable, otherwise?: () => Renderable): View
{
    if (typeof condition === "function")
    {
        throw fail("when_condition_function");
    }
    return new Conditional(condition, then, otherwise);
}
