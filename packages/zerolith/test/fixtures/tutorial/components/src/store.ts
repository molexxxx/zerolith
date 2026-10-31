// The packing list's state and every way it changes.
import { signal } from "zerolith";

export interface Item
{
    id: number;
    name: string;
    packed: boolean;
}

export const items = signal<Item[]>([
    { id: 1, name: "Passport", packed: true },
    { id: 2, name: "Phone charger", packed: false },
    { id: 3, name: "Rain jacket", packed: false }
], { name: "items" });

export function toggle(id: number): void
{
    items.set(items.get().map((item) => (item.id === id ? { ...item, packed: !item.packed } : item)));
}

export function add(name: string): void
{
    const id = Math.max(0, ...items.get().map((item) => item.id)) + 1;
    items.set([...items.get(), { id, name, packed: false }]);
}

export function remove(id: number): void
{
    items.set(items.get().filter((item) => item.id !== id));
}
