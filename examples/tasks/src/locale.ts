// The locale: negotiated from the browser, switchable, with the compiled
// messages of the current locale loaded as their own module.
import { type ReadableSignal, computed, effect, signal } from "zerolith";
import { applyLocale, createLocale, formatters } from "@zerolith/i18n";
import type * as en from "./messages/en.ts";
import { loaders } from "./messages/index.ts";

export type Messages = typeof en;

export const locale = createLocale({ supported: ["en", "de"], initial: navigator.languages });
applyLocale(locale);

const loaded = signal<Messages | undefined>(undefined);

/** The messages of the current locale; undefined until the first module has loaded. */
export const messages: ReadableSignal<Messages | undefined> = computed(() => loaded.get());

/** Loads the messages for a locale and makes them current. */
export async function load(tag: string): Promise<void>
{
    const loader = loaders[tag];
    if (loader !== undefined)
    {
        loaded.set(await loader());
    }
}

effect(() =>
{
    void load(locale.locale.get());
});

export const format = formatters(locale.locale);

/** A binding that reads one message of the current locale and re-renders when the locale changes. */
export function t<T extends unknown[]>(pick: (messages: Messages, ...args: T) => string, ...args: T): ReadableSignal<string>
{
    return computed(() =>
    {
        const current = loaded.get();
        return current === undefined ? "" : pick(current, ...args);
    });
}
