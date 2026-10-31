// The packing list's state: one signal holding every item.
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
