/*
 * Browser signals: what the browser knows about the page, as signals
 * from @zerolith/browser. online and visible follow the browser's own
 * events, windowSize the preview's size, size the box's, and inView
 * whether all of the badge at the end of the box shows. Each readout
 * binds its signal, so a change rewrites one text node.
 *
 * Try: resize your browser window, drag the corner of the box, and
 * scroll the box down to the badge. Switch to another tab and back: the
 * clock stood still while the page was hidden, and the console says
 * when. To go offline, use your browser's developer tools.
 */
import { computed, css, effect, html, render, signal } from "zerolith";
import {
    inView, online, size, visible, windowSize
} from "@zerolith/browser";

const panel = css`
    :scope {
        display: grid;
        gap: 20px;
        max-width: 560px;
        padding: clamp(20px, 5vw, 32px);
        border: 2px solid var(--line);
        background: var(--surface);
    }
    h2 { font-size: 28px; }
    dl {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 16px 24px;
        margin: 0;
    }
    dt {
        color: var(--muted);
        font: 12px var(--font-mono);
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }
    dd { margin: 4px 0 0; font-variant-numeric: tabular-nums; }
    [data-alert="true"] dd { color: var(--danger); }
    .box {
        height: 160px;
        max-width: 100%;
        padding: 16px;
        overflow: auto;
        resize: both;
        border: 2px solid var(--control);
    }
    .box p { margin: 0; color: var(--muted); }
    .box .badge {
        display: inline-block;
        margin-top: 320px;
        padding: 8px 12px;
        border: 2px solid var(--accent-text);
        color: var(--accent-text);
        font: 600 14px var(--font-mono);
    }
`;

/** A size as its width by its height, in whole pixels. */
function pixels({ width, height })
{
    return `${Math.round(width)} × ${Math.round(height)} px`;
}

/** A readout: what it is, the signal it shows, and when that is bad news. */
function Reading({ label, value, alert })
{
    return html`
        <div data-alert=${alert}><dt>${label}</dt><dd>${value}</dd></div>`;
}

function Page()
{
    const isOnline = online();
    const isVisible = visible();
    const viewport = windowSize();
    const box = signal(undefined);
    const badge = signal(undefined);
    const inside = size(box);
    const found = inView(badge, { threshold: 1 });
    const seconds = signal(0);

    effect(() =>
    {
        const state = isVisible.get() ? "Shown" : "Hidden";
        console.log(`${state} at ${new Date().toLocaleTimeString()}`);
        if (!isVisible.get())
        {
            return undefined;
        }
        const clock = setInterval(() => seconds.set(seconds.get() + 1), 1000);
        return () => clearInterval(clock);
    });

    const network = computed(() => (isOnline.get() ? "Online" : "Offline"));
    const offline = computed(() => !isOnline.get());
    const page = computed(() =>
        (isVisible.get() ? `Shown for ${seconds.get()} s` : "Hidden"));
    const windowText = computed(() => pixels(viewport.get()));
    const boxText = computed(() => pixels(inside.get()));
    const badgeText = computed(() =>
        (found.get() ? "In view" : "Out of view"));

    return html`
        <section class=${panel}>
            <h2>Browser signals</h2>
            <dl>
                ${Reading({ label: "Network", value: network, alert: offline })}
                ${Reading({ label: "Page", value: page })}
                ${Reading({ label: "Window", value: windowText })}
                ${Reading({ label: "Box", value: boxText })}
                ${Reading({ label: "Badge", value: badgeText })}
            </dl>
            <div class="box" ref=${box}>
                <p>Drag the corner to resize this box, then scroll it down
                    to the badge.</p>
                <p class="badge" ref=${badge}>Badge</p>
            </div>
        </section>`;
}

render(() => Page(), "#app");
