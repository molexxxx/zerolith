import { type View, onDispose, signal } from "zerolith";
import { router } from "../router.ts";

/** Loaded the first time a reader opens it. Its clock stops when the reader leaves. */
export function Settings(): View
{
    const time = signal(new Date().toLocaleTimeString());
    const clock = setInterval(() => time.set(new Date().toLocaleTimeString()), 1000);
    onDispose(() => clearInterval(clock));
    return (
        <section>
            <h1>Settings</h1>
            <p>Opened at {time}.</p>
            <button on:click={() => router.navigate(router.href("home"))}>Done</button>
        </section>
    );
}
