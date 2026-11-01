// The dashboard: the numbers that matter today, and what the team is doing,
// live. New activity arrives over server-sent events while the page is open;
// leaving the page closes the stream and stops the clock with it.
import { createAnnouncer } from "@zerolith/a11y";
import { type View, computed, css, each, html, onDispose, resource, signal, when } from "zerolith";
import { EVENTS_PATH } from "../../shared/api.ts";
import type { Activity } from "../../shared/model.ts";
import { ago, format } from "../locale.ts";
import { api, refresh, summary, user } from "../store.ts";
import { Empty } from "./ui.ts";

const page = css`
    :scope { display: grid; gap: clamp(2rem, 5vw, 3.5rem); }
    .hello { display: grid; gap: 0.75rem; }
    .hello h1 { font-size: var(--display); }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr)); gap: 2px; border: 2px solid var(--line); background: var(--line); }
    .stat { display: grid; align-content: space-between; gap: 2rem; min-height: clamp(8rem, 12vw, 11rem); padding: clamp(1rem, 2vw, 1.5rem); background: var(--surface); }
    .stat .value { font-family: var(--font-display); font-size: clamp(3rem, 5vw + 1rem, 4.75rem); font-weight: 800; letter-spacing: -0.05em; line-height: 0.9; }
    .stat.alert { background: var(--accent); color: var(--on-accent); }
    .stat.alert .eyebrow { color: var(--on-accent); }
    .feed { display: grid; gap: 1rem; }
    .feed h2 { font-size: clamp(1.5rem, 2vw + 1rem, 2.25rem); }
    ol { margin: 0; padding: 0; list-style: none; border-top: 2px solid var(--line); }
    li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.25rem 1rem; padding: 0.875rem 0.5rem; border-bottom: 2px solid var(--line); }
    li:first-child { animation: var(--enter); }
    li strong { font-weight: 700; }
    time { color: var(--muted); font-family: var(--font-mono); font-size: 0.8125rem; }
`;

/** One of the dashboard's numbers. */
function Stat({ label, value, alert = false }: { label: string; value: () => number; alert?: boolean }): View
{
    return html`
        <div class="stat ${alert ? "alert" : ""}">
            <span class="eyebrow">${label}</span>
            <span class="value">${computed(() => format.number(value()))}</span>
        </div>`;
}

export function Dashboard(): View
{
    const now = signal(Date.now());
    const clock = setInterval(() => now.set(Date.now()), 30_000);

    const recent = resource({ params: () => true, loader: ({ abort }) => api.call("listActivity", {}, { signal: abort }) });
    const live = signal<Activity[]>([]);
    const feed = computed(() =>
    {
        const arrived = live.get();
        const shown = new Set(arrived.map((entry) => entry.id));
        return [...arrived, ...(recent.get() ?? []).filter((entry) => !shown.has(entry.id))];
    });

    const announcer = createAnnouncer();
    const events = new EventSource(EVENTS_PATH);
    events.addEventListener("message", (event: MessageEvent<string>) =>
    {
        const activity = JSON.parse(event.data) as Activity;
        live.set([activity, ...live.get()]);
        announcer.announce(`${activity.who} ${activity.text}`);
        refresh();
    });
    onDispose(() =>
    {
        clearInterval(clock);
        events.close();
        announcer.dispose();
    });

    const first = computed(() => user.get()?.name.split(" ")[0] ?? "");
    return html`
        <div class=${page}>
            <section class="hello">
                <p class="eyebrow">Dashboard</p>
                <h1>Welcome back, ${first}.</h1>
            </section>
            <section class="stats" aria-label="Today">
                ${Stat({ label: "Open tasks", value: () => summary.get()?.open ?? 0 })}
                ${Stat({ label: "Due soon", value: () => summary.get()?.dueSoon ?? 0, alert: true })}
                ${Stat({ label: "Done this week", value: () => summary.get()?.doneThisWeek ?? 0 })}
                ${Stat({ label: "Projects", value: () => summary.get()?.projects ?? 0 })}
            </section>
            <section class="feed">
                <h2>Live activity</h2>
                ${when(computed(() => feed.get().length > 0), () => html`
                    <ol>${each(feed, (entry) => entry.id, (entry) => html`
                        <li>
                            <span><strong>${computed(() => entry.get().who)}</strong> ${computed(() => entry.get().text)}</span>
                            <time datetime=${computed(() => entry.get().at)}>${computed(() => ago(entry.get().at, now.get()))}</time>
                        </li>`)}
                    </ol>`, () => Empty({ text: "Nothing has happened yet today." }))}
            </section>
        </div>`;
}
