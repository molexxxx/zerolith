/**
 * Undo and redo for a signal, from explicit checkpoints, as an editor
 * keeps them.
 */
import { type ReadableSignal, type Signal, batch, hasOwner, onDispose, signal, untracked } from "zerolith";
import { onOutsideWrite } from "./stored.ts";

/** Options for `history`. */
export interface HistoryOptions
{
    /** How many checkpoints are kept; the oldest goes when one more is saved. Defaults to 50, which a value that is not a finite number keeps. */
    limit?: number;
}

/** The undo and redo of one signal. */
export interface History<T>
{
    /** Saves the signal's current value as the point `undo()` goes back to, and drops what `redo()` could have brought back. */
    checkpoint(): void;
    /** Sets the signal back to the last checkpoint, keeping the current value for `redo()`; false when there is no checkpoint. */
    undo(): boolean;
    /** Sets the signal forward to the value the last `undo()` left; false when there is none. */
    redo(): boolean;
    /** True while `undo()` has somewhere to go, for a button to follow. */
    readonly canUndo: ReadableSignal<boolean>;
    /** True while `redo()` has somewhere to go. */
    readonly canRedo: ReadableSignal<boolean>;
    /** Forgets every checkpoint and every value `redo()` could bring back; the signal keeps its value. */
    dispose(): void;
    /** The signal the history is of. */
    readonly source: Signal<T>;
}

/**
 * Undo and redo for `source` from explicit checkpoints: call
 * `checkpoint()` before a change worth undoing, as an editor does before
 * each edit, and `undo()` sets the signal back to it while `redo()` brings
 * the undone value back. A new checkpoint after an undo starts a new
 * branch, as in most editors, so what was undone is gone. `limit`
 * checkpoints are kept, 50 by default. Each move writes the signal and
 * both flags in one batch, so an effect over them runs once. Over a
 * `stored` signal, a write from another tab makes the history forget its
 * checkpoints, since going back to one would take that change back too;
 * created inside an owner, the history stops listening for those writes
 * when the owner is disposed.
 */
export function history<T>(source: Signal<T>, options: HistoryOptions = {}): History<T>
{
    const limit = Number.isFinite(options.limit) ? Math.max(1, Math.floor(options.limit as number)) : 50;
    const past: T[] = [];
    const future: T[] = [];
    const canUndo = signal(false);
    const canRedo = signal(false);
    const update = (): void =>
    {
        canUndo.set(past.length > 0);
        canRedo.set(future.length > 0);
    };
    const forget = (): void =>
    {
        past.length = 0;
        future.length = 0;
        batch(update);
    };
    const stop = onOutsideWrite(source as Signal<unknown>, forget);
    if (hasOwner())
    {
        onDispose(stop);
    }
    return {
        source,
        canUndo,
        canRedo,
        checkpoint(): void
        {
            past.push(untracked(() => source.get()));
            if (past.length > limit)
            {
                past.shift();
            }
            future.length = 0;
            batch(update);
        },
        undo(): boolean
        {
            if (past.length === 0)
            {
                return false;
            }
            const previous = past.pop() as T;
            future.push(untracked(() => source.get()));
            batch(() =>
            {
                source.set(previous);
                update();
            });
            return true;
        },
        redo(): boolean
        {
            if (future.length === 0)
            {
                return false;
            }
            const next = future.pop() as T;
            past.push(untracked(() => source.get()));
            batch(() =>
            {
                source.set(next);
                update();
            });
            return true;
        },
        dispose: forget
    };
}
