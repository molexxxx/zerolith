// The packing list's state, kept in the browser's storage, with undo and redo.
import { computed, signal } from "zerolith";
import { history, stored } from "@zerolith/state";

export interface Item
{
    id: number;
    name: string;
    packed: boolean;
}

export type Filter = "all" | "left" | "packed";

export const items = stored<Item[]>("packing-list", [
    { id: 1, name: "Passport", packed: true },
    { id: 2, name: "Phone charger", packed: false },
    { id: 3, name: "Rain jacket", packed: false }
]);
export const changes = history(items);
export const filter = signal<Filter>("all", { name: "filter" });

export const packedCount = computed(() =>
    items.get().filter((item) => item.packed).length);
export const shown = computed(() =>
{
    const which = filter.get();
    return which === "all"
        ? items.get()
        : items.get().filter((item) => item.packed === (which === "packed"));
});

export function toggle(id: number): void
{
    changes.checkpoint();
    items.set(items.get().map((item) =>
        (item.id === id ? { ...item, packed: !item.packed } : item)));
}

export function add(name: string): void
{
    const id = Math.max(0, ...items.get().map((item) => item.id)) + 1;
    changes.checkpoint();
    items.set([...items.get(), { id, name, packed: false }]);
}

export function remove(id: number): void
{
    changes.checkpoint();
    items.set(items.get().filter((item) => item.id !== id));
}
