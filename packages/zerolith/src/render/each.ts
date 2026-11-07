/**
 * The keyed list directive: one row per item, updated in place while its
 * key survives, with the fewest node moves when the order changes.
 */
import { isInternal } from "../devtools.js";
import { fail } from "../diagnostics.js";
import { OwnerScope, type ReadableSignal, type Signal, createOwner, onDispose, signal, startEffect, untracked } from "../signals.js";
import { prepare } from "../template.js";
import { ChildPart, Instance } from "./instance.js";
import { isStart, matchingEnd, mismatch, removeUntil } from "./markers.js";
import { type Controller, Directive, type Renderable, TemplateResult, type View, read } from "./view.js";

/** The key function for `each()`. */
export type KeyOf<T> = (item: T, index: number) => string | number | bigint | boolean | symbol | object;

/** The row renderer for `each()`. The item is a signal that updates in place; the index is a signal too, created only when the function declares a second parameter. */
export type RowOf<T> = (item: ReadableSignal<T>, index: ReadableSignal<number>) => Renderable;

/** A row of `each`, which is also the owner of what its view creates, so a row allocates one object for both. */
class Row<T> extends OwnerScope
{
    readonly key: unknown;
    /** The row's first node, which the rows before it are inserted ahead of, set when the row is created. */
    start!: ChildNode;
    /**
     * A row that renders a template with no binding at its top level holds
     * the template's own nodes, with no markers around them; undefined
     * when that template has one node, which `start` alone holds.
     */
    nodes: readonly ChildNode[] | undefined = undefined;
    /** Any other row holds its view in a part between its start marker and the part's anchor. */
    part: ChildPart | undefined = undefined;
    readonly item: Signal<T>;
    /** Undefined when the row function declares no index parameter. */
    readonly index: Signal<number> | undefined;

    constructor(key: unknown, item: Signal<T>, index: Signal<number> | undefined)
    {
        super(isInternal());
        this.key = key;
        this.item = item;
        this.index = index;
    }
}

/** Removes a row's nodes; its owner is disposed by the caller. */
function removeRow(row: Row<unknown>): void
{
    if (row.nodes !== undefined)
    {
        for (const node of row.nodes)
        {
            node.remove();
        }
        return;
    }
    row.part?.destroy();
    row.start.remove();
}

/** Indices of one longest strictly increasing subsequence of `positions`, ignoring -1 entries. */
function longestIncreasing(positions: readonly number[]): Set<number>
{
    const tails: number[] = [];
    const previous = new Int32Array(positions.length).fill(-1);
    for (let i = 0; i < positions.length; i++)
    {
        const value = positions[i] ?? -1;
        if (value === -1)
        {
            continue;
        }
        let low = 0;
        let high = tails.length;
        while (low < high)
        {
            const middle = (low + high) >> 1;
            const index = tails[middle] ?? 0;
            if ((positions[index] ?? -1) < value)
            {
                low = middle + 1;
            }
            else
            {
                high = middle;
            }
        }
        previous[i] = low > 0 ? (tails[low - 1] ?? -1) : -1;
        tails[low] = i;
    }
    const kept = new Set<number>();
    let cursor = tails.length > 0 ? (tails[tails.length - 1] ?? -1) : -1;
    while (cursor !== -1)
    {
        kept.add(cursor);
        cursor = previous[cursor] ?? -1;
    }
    return kept;
}

/** The node right after a row's last node; the list's end marker follows every row, so there always is one. */
function nodeAfter(row: Row<unknown>): Node
{
    const last = row.part !== undefined ? row.part.marker() : row.nodes === undefined ? row.start : (row.nodes[row.nodes.length - 1] as ChildNode);
    return last.nextSibling as Node;
}

function moveRow(row: Row<unknown>, before: Node): void
{
    const parent = before.parentNode;
    if (parent === null)
    {
        return;
    }
    if (row.part === undefined)
    {
        if (row.nodes === undefined)
        {
            parent.insertBefore(row.start, before);
            return;
        }
        for (const node of row.nodes)
        {
            parent.insertBefore(node, before);
        }
        return;
    }
    let node: ChildNode | null = row.start;
    const end = row.part.marker();
    while (node !== null && node !== end)
    {
        const next: ChildNode | null = node.nextSibling;
        parent.insertBefore(node, before);
        node = next;
    }
    parent.insertBefore(end, before);
}

class Keyed<T> extends Directive
{
    readonly wrapsBranch: boolean = false;
    private readonly items: ReadableSignal<readonly T[]> | readonly T[];
    private readonly key: KeyOf<T>;
    private readonly row: RowOf<T>;

    constructor(items: ReadableSignal<readonly T[]> | readonly T[], key: KeyOf<T>, row: RowOf<T>)
    {
        super();
        this.items = items;
        this.key = key;
        this.row = row;
    }

    private keyOf(value: T, index: number, keys: Set<unknown>): unknown
    {
        const key = this.key(value, index);
        if (key === undefined)
        {
            throw fail("each_key_undefined", { index });
        }
        if (keys.has(key))
        {
            throw fail("each_key_duplicate", { key: String(key), index });
        }
        keys.add(key);
        return key;
    }

    override mount(part: ChildPart, cursor?: ChildNode): Controller
    {
        const owner = createOwner();
        const rows = new Map<unknown, Row<T>>();
        let order: Row<T>[] = [];
        const end = part.marker();
        owner.run(() =>
        {
            onDispose(() =>
            {
                for (let i = order.length - 1; i >= 0; i--)
                {
                    (order[i] as Row<T>).dispose();
                }
            });
        });

        /**
         * Creates a row in `parent` before `before`, which may be a fragment the
         * caller inserts later. A row whose view is a template with no binding
         * at its top level keeps the template's nodes; any other view, and a
         * row hydrated from markers, goes in a part between markers.
         */
        const create = (key: unknown, value: T, index: number, parent: Node, before: Node | null, adopt?: { start: Comment; end: Comment }): Row<T> =>
        {
            const row = new Row<T>(key, signal(value), this.row.length > 1 ? signal(index) : undefined);
            row.run(() =>
            {
                const view = this.row(row.item, row.index as ReadableSignal<number>);
                if (adopt === undefined && view instanceof TemplateResult)
                {
                    const prepared = prepare(view.strings);
                    if (prepared.content.firstChild !== null && !prepared.edges)
                    {
                        const instance = Instance.create(view.strings, prepared);
                        instance.update(view.values);
                        parent.insertBefore(instance.content as Node, before);
                        row.start = (instance.nodes === undefined ? instance.content : instance.nodes[0]) as ChildNode;
                        row.nodes = instance.nodes;
                        return;
                    }
                }
                row.start = adopt?.start ?? parent.insertBefore(document.createComment(""), before);
                const rowPart = new ChildPart(adopt?.end ?? parent.insertBefore(document.createComment(""), before));
                row.part = rowPart;
                rowPart.set(view, adopt === undefined ? undefined : adopt.start.nextSibling ?? adopt.end);
            });
            rows.set(key, row);
            return row;
        };

        /** Removes every current row at once when the list owns all of its parent's children, as a table body usually does. */
        const clearAll = (parent: ParentNode & Node): boolean =>
        {
            if (parent.firstChild !== order[0]?.start || parent.lastChild !== end)
            {
                return false;
            }
            for (let i = order.length - 1; i >= 0; i--)
            {
                (order[i] as Row<T>).dispose();
            }
            parent.textContent = "";
            parent.appendChild(end);
            rows.clear();
            order = [];
            return true;
        };

        /** Whether the new items between `head` and `tail` are the old rows with only the first and last exchanged. */
        const swapped = (list: readonly T[], old: readonly Row<T>[], head: number, tail: number): boolean =>
        {
            if (this.key(list[head] as T, head) !== (old[tail - 1] as Row<T>).key || this.key(list[tail - 1] as T, tail - 1) !== (old[head] as Row<T>).key)
            {
                return false;
            }
            for (let i = head + 1; i < tail - 1; i++)
            {
                if (this.key(list[i] as T, i) !== (old[i] as Row<T>).key)
                {
                    return false;
                }
            }
            return true;
        };

        const reconcile = (list: readonly T[]): void =>
        {
            const parent = end.parentNode;
            if (parent === null)
            {
                return;
            }
            const old = order;
            if (list.length === 0)
            {
                if (old.length > 0 && !clearAll(parent))
                {
                    for (const row of old)
                    {
                        row.dispose();
                        removeRow(row);
                    }
                    rows.clear();
                    order = [];
                }
                return;
            }
            let head = 0;
            while (head < list.length && head < old.length && this.key(list[head] as T, head) === (old[head] as Row<T>).key)
            {
                head++;
            }
            let newTail = list.length;
            let oldTail = old.length;
            while (newTail > head && oldTail > head && this.key(list[newTail - 1] as T, newTail - 1) === (old[oldTail - 1] as Row<T>).key)
            {
                newTail--;
                oldTail--;
            }
            /** Gives the rows kept at the start and at the end their new values, once nothing left to check can fail the update. */
            const keepEnds = (): void =>
            {
                for (let i = 0; i < head; i++)
                {
                    (old[i] as Row<T>).item.set(list[i] as T);
                }
                for (let i = newTail, j = oldTail; i < list.length; i++, j++)
                {
                    const row = old[j] as Row<T>;
                    row.item.set(list[i] as T);
                    row.index?.set(i);
                }
            };
            if (head === list.length && head === old.length)
            {
                keepEnds();
                return;
            }
            if (newTail - head > 1 && newTail === oldTail && swapped(list, old, head, newTail))
            {
                keepEnds();
                const first = old[head] as Row<T>;
                const last = old[newTail - 1] as Row<T>;
                for (let i = head + 1; i < newTail - 1; i++)
                {
                    (old[i] as Row<T>).item.set(list[i] as T);
                }
                first.item.set(list[newTail - 1] as T);
                first.index?.set(newTail - 1);
                last.item.set(list[head] as T);
                last.index?.set(head);
                const after = nodeAfter(last);
                moveRow(last, first.start);
                moveRow(first, after);
                const next = old.slice();
                next[head] = last;
                next[newTail - 1] = first;
                order = next;
                return;
            }
            if (newTail === head)
            {
                keepEnds();
                for (let i = head; i < oldTail; i++)
                {
                    const row = old[i] as Row<T>;
                    row.dispose();
                    removeRow(row);
                    rows.delete(row.key);
                }
                order = old.slice(0, head).concat(old.slice(oldTail));
                return;
            }
            const keys = new Set<unknown>();
            for (let i = 0; i < head; i++)
            {
                keys.add((old[i] as Row<T>).key);
            }
            for (let i = oldTail; i < old.length; i++)
            {
                keys.add((old[i] as Row<T>).key);
            }
            const fresh = new Array<unknown>(newTail - head);
            for (let i = head; i < newTail; i++)
            {
                fresh[i - head] = this.keyOf(list[i] as T, i, keys);
            }
            keepEnds();
            if (head === oldTail)
            {
                const before = oldTail < old.length ? (old[oldTail] as Row<T>).start : end;
                const added = new Array<Row<T>>(newTail - head);
                for (let i = head; i < newTail; i++)
                {
                    added[i - head] = create(fresh[i - head], list[i] as T, i, parent, before);
                }
                order = old.length === 0 ? added : old.slice(0, head).concat(added, old.slice(oldTail));
                return;
            }
            const middle: Row<T>[] = [];
            const created = new Map<Row<T>, DocumentFragment>();
            let fragment: DocumentFragment | undefined;
            let survivors = head + old.length - oldTail;
            for (let i = head; i < newTail; i++)
            {
                const value = list[i] as T;
                const key = fresh[i - head];
                const existing = rows.get(key);
                if (existing !== undefined)
                {
                    existing.item.set(value);
                    existing.index?.set(i);
                    middle.push(existing);
                    survivors++;
                    fragment = undefined;
                }
                else
                {
                    fragment ??= document.createDocumentFragment();
                    const row = create(key, value, i, fragment, null);
                    created.set(row, fragment);
                    middle.push(row);
                }
            }
            if (survivors === 0 && clearAll(parent))
            {
                for (const row of middle)
                {
                    rows.set(row.key, row);
                }
                parent.insertBefore(fragment as DocumentFragment, end);
                order = middle;
                return;
            }
            else
            {
                for (let i = head; i < oldTail; i++)
                {
                    const row = old[i] as Row<T>;
                    if (!keys.has(row.key))
                    {
                        row.dispose();
                        removeRow(row);
                        rows.delete(row.key);
                    }
                }
            }
            const previousIndex = new Map<Row<T>, number>();
            for (let i = head; i < oldTail; i++)
            {
                previousIndex.set(old[i] as Row<T>, i);
            }
            const kept = longestIncreasing(middle.map((row) => previousIndex.get(row) ?? -1));
            let before: Node = oldTail < old.length ? (old[oldTail] as Row<T>).start : end;
            for (let i = middle.length - 1; i >= 0; i--)
            {
                const row = middle[i] as Row<T>;
                const run = created.get(row);
                if (run !== undefined)
                {
                    if (run.firstChild !== null)
                    {
                        parent.insertBefore(run, before);
                    }
                }
                else if (!kept.has(i))
                {
                    moveRow(row, before);
                }
                before = row.start;
            }
            order = old.slice(0, head).concat(middle, old.slice(oldTail));
        };

        if (cursor !== undefined)
        {
            owner.run(() =>
            {
                const list = untracked(() => read(this.items));
                const keys = new Set<unknown>();
                let node: ChildNode = cursor;
                const adopted: Row<T>[] = [];
                for (let i = 0; i < list.length; i++)
                {
                    const value = list[i] as T;
                    const key = this.keyOf(value, i, keys);
                    const rowStart = isStart(node) ? node : undefined;
                    const rowEnd = rowStart === undefined ? undefined : matchingEnd(rowStart);
                    if (rowStart === undefined || rowEnd === undefined)
                    {
                        mismatch("missing", "row", node === end ? "" : node.nodeName);
                        if (node !== end)
                        {
                            mismatch("extra", "", node.nodeName);
                            removeUntil(node, end);
                            node = end;
                        }
                        adopted.push(create(key, value, i, end.parentNode as Node, end));
                        continue;
                    }
                    adopted.push(create(key, value, i, end.parentNode as Node, end, { start: rowStart, end: rowEnd }));
                    node = rowEnd.nextSibling ?? end;
                }
                if (node !== end)
                {
                    mismatch("extra", "", node.nodeName);
                    removeUntil(node, end);
                }
                order = adopted;
            });
        }

        let initial = cursor !== undefined;
        owner.run(() =>
        {
            startEffect(() =>
            {
                const list = read(this.items);
                if (initial)
                {
                    initial = false;
                    return;
                }
                owner.run(() =>
                {
                    reconcile(list);
                });
            });
        });

        return {
            dispose(): void
            {
                owner.dispose();
                for (const row of order)
                {
                    removeRow(row);
                }
                rows.clear();
                order = [];
            }
        };
    }

    override resolve(): unknown
    {
        const list = read(this.items);
        const keys = new Set<unknown>();
        return list.map((value, index) =>
        {
            this.keyOf(value, index, keys);
            return this.row(signal(value), (this.row.length > 1 ? signal(index) : undefined) as ReadableSignal<number>);
        });
    }
}

/**
 * Renders one row per item, keyed, updating rows in place when their key
 * survives and moving the fewest nodes when the order changes. The row
 * function receives the item as a signal and, when it declares a second
 * parameter, the position as a signal.
 */
export function each<T>(items: ReadableSignal<readonly T[]> | readonly T[], key: KeyOf<T>, row: RowOf<T>): View
{
    if (typeof items === "function")
    {
        throw fail("each_items_function");
    }
    return new Keyed(items, key, row);
}
