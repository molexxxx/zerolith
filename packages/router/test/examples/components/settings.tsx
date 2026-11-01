import { type View, onDispose, signal } from "zerolith";
import { router } from "../router.ts";

/** Loaded on its first visit. Its clock stops when the reader leaves. */
export function Settings(): View
{
    const now = (): string => new Date().toLocaleTimeString();
    const time = signal(now());
    const clock = setInterval(() => time.set(now()), 1000);
    onDispose(() => clearInterval(clock));
    const done = (): Promise<void> => router.navigate(router.href("home"));
    return (
        <section>
            <h1>Settings</h1>
            <p>The time is {time}.</p>
            <button on:click={done}>Done</button>
        </section>
    );
}
