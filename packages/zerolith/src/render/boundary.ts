/**
 * The boundary directive: its content, or a fallback in the content's
 * place once the content, or anything it created, has thrown.
 */
import { diagnostic, report } from "../diagnostics.js";
import { type Owner, batch, createOwner, guard, onDispose, signal, startEffect, untracked } from "../signals.js";
import { ChildPart } from "./instance.js";
import { anchorBefore, isStart, matchingEnd, mismatch, removeUntil } from "./markers.js";
import { type Controller, Directive, RawHtml, type Renderable, type View } from "./view.js";

/** What `boundary()` shows in place of its content: given what the content threw, and a function that renders the content again. */
export type Fallback = (error: unknown, retry: () => void) => Renderable;

/**
 * Reports an error a boundary caught as `boundary_caught`, and logs the
 * error itself, with its stack, through `console.error`, in production
 * too, as a handled error rather than a crash: the fallback, which gets
 * the error, is where an application sends it to its error monitoring.
 */
function reportCaught(error: unknown): void
{
    report(diagnostic("boundary_caught", "warning", { message: error instanceof Error ? error.message : String(error) }));
    console.error(error);
}

class Boundary extends Directive
{
    readonly wrapsBranch: boolean = true;
    private readonly content: () => Renderable;
    private readonly fallback: Fallback;

    constructor(content: () => Renderable, fallback: Fallback)
    {
        super();
        this.content = content;
        this.fallback = fallback;
    }

    override mount(part: ChildPart, cursor?: ChildNode): Controller
    {
        const end = part.marker();
        const owner = createOwner();
        const version = signal(0);
        let failed: { error: unknown } | undefined;
        let rendering = false;
        let branch: Owner | undefined;
        let adopt: ChildNode | undefined;
        let inner: ChildPart;
        const innerEnd = cursor !== undefined && isStart(cursor) ? matchingEnd(cursor) : undefined;
        if (cursor !== undefined && innerEnd !== undefined)
        {
            inner = new ChildPart(innerEnd);
            adopt = cursor.nextSibling ?? innerEnd;
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
        const rerun = (): void =>
        {
            version.set(untracked(() => version.get()) + 1);
        };
        const caught = (error: unknown): void =>
        {
            reportCaught(error);
            failed ??= { error };
            if (!rendering)
            {
                rerun();
            }
        };
        const retry = (): void =>
        {
            failed = undefined;
            rerun();
        };
        const show = (): void =>
        {
            branch?.dispose();
            branch = createOwner(true);
            const from = adopt;
            adopt = undefined;
            if (failed === undefined)
            {
                const current = branch;
                rendering = true;
                try
                {
                    batch(() => current.run(() => guard(caught, () => inner.set(this.content(), from))));
                }
                catch (error)
                {
                    reportCaught(error);
                    failed ??= { error };
                }
                finally
                {
                    rendering = false;
                }
                if (failed === undefined)
                {
                    return;
                }
                branch.dispose();
                branch = createOwner(true);
                if (from !== undefined && cursor !== undefined && innerEnd !== undefined)
                {
                    inner.set(undefined);
                    if (cursor.nextSibling !== innerEnd)
                    {
                        removeUntil(cursor.nextSibling as ChildNode, innerEnd);
                    }
                }
            }
            const { error } = failed;
            branch.run(() => inner.set(this.fallback(error, retry)));
        };
        owner.run(() =>
        {
            onDispose(() => branch?.dispose());
            startEffect(() =>
            {
                version.get();
                untracked(show);
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

    override resolve(render: (value: unknown) => string): unknown
    {
        try
        {
            return new RawHtml(render(this.content()));
        }
        catch (error)
        {
            reportCaught(error);
            return this.fallback(error, () => undefined);
        }
    }
}

/**
 * Shows `content()`, and in its place `fallback(error, retry)` once the
 * content throws as it renders, or once an effect, a binding, a row, or a
 * branch it created throws as it runs; the error reaches the fallback in
 * place of the code that caused the run, is logged with `console.error`,
 * and is reported as `boundary_caught`. `retry` renders the content again. An event handler
 * that throws is not caught: it throws to the browser, as any listener does.
 * On the server, the fallback is rendered when the content throws.
 */
export function boundary(content: () => Renderable, fallback: Fallback): View
{
    return new Boundary(content, fallback);
}
