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

/** Loads the messages for a locale and makes them current, unless another locale was picked while they loaded. */
export async function load(tag: string): Promise<void>
{
    const loader = loaders[tag];
    if (loader === undefined)
    {
        return;
    }
    const module = await loader();
    if (locale.locale.get() === tag)
    {
        loaded.set(module);
    }
}

effect(() =>
{
    void load(locale.locale.get());
});

export const format = formatters(locale.locale);

/** A binding that reads one message of the current locale, and any signal `pick` reads, and re-renders when either changes. */
export function t(pick: (messages: Messages) => string): ReadableSignal<string>
{
    return computed(() =>
    {
        const current = loaded.get();
        return current === undefined ? "" : pick(current);
    });
}
