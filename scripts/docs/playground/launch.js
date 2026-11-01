/*
 * Launch control: a countdown, a climb to orbit, and a flight log, all
 * from a few signals. Every readout is a computed value, an effect runs
 * the clock only while the rocket is live, and on each tick only the
 * text that changed is touched.
 *
 * Try: press Launch, then drag the throttle during the climb. Full
 * throttle climbs fastest but burns the fuel before orbit; find the
 * setting that makes it. The console under the preview logs each stage.
 */
import {
    batch, computed, css, each, effect, html, render, signal
} from "zerolith";
import { createAnnouncer } from "@zerolith/a11y";
import { formatters } from "@zerolith/i18n";

const ORBIT = 300;
const format = formatters(navigator.language);
const announcer = createAnnouncer();

const stage = signal("ready");
const countdown = signal(5);
const altitude = signal(0);
const fuel = signal(100);
const throttle = signal(80);
const log = signal([]);

const live = computed(() =>
    stage.get() === "countdown" || stage.get() === "flight");
const ready = computed(() => stage.get() === "ready");
const idle = computed(() => !live.get());

const STAGES = {
    ready: "On the pad",
    countdown: "Counting down",
    flight: "Climbing",
    orbit: "In orbit",
    aborted: "Aborted"
};

const panel = css`
    :scope { display: grid; gap: 16px; max-width: 560px; }
    .stage {
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
    }
    .readout {
        margin: 0;
        font-family: var(--font-display);
        font-size: 64px;
        font-weight: 800;
        letter-spacing: -0.04em;
        line-height: 1;
    }
    :scope[data-stage="orbit"] .readout { color: var(--accent-text); }
    :scope[data-stage="aborted"] .readout { color: var(--danger); }
    label { display: grid; gap: 4px; }
    progress { width: 100%; height: 12px; }
    .controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; }
    ol { margin: 0; padding: 0; list-style: none; }
    li {
        padding: 6px 0;
        border-top: 2px solid var(--line);
        font-family: var(--font-mono);
        font-size: 13px;
    }
`;

/** Writes a line to the flight log, the console, and screen readers. */
function note(text)
{
    log.set([{ id: log.get().length + 1, text }, ...log.get()]);
    console.log(text);
    announcer.announce(text);
}

/** Moves the countdown on by a tenth of a second. */
function count()
{
    countdown.set(Math.max(0, countdown.get() - 0.1));
    if (countdown.get() === 0)
    {
        stage.set("flight");
        note("Liftoff");
    }
}

/** Moves the climb on by a tenth of a second, burning fuel. */
function climb()
{
    const power = throttle.get() / 100;
    altitude.set(Math.min(ORBIT, altitude.get() + power * 6));
    fuel.set(Math.max(0, fuel.get() - power * power * 2.2));
    if (altitude.get() === ORBIT)
    {
        stage.set("orbit");
        const left = format.number(fuel.get() / 100, { style: "percent" });
        note(`Orbit, with ${left} fuel left`);
    }
    else if (fuel.get() === 0)
    {
        stage.set("aborted");
        note(`Out of fuel at ${format.number(Math.round(altitude.get()))} km`);
    }
}

effect(() =>
{
    if (!live.get())
    {
        return undefined;
    }
    const clock = setInterval(
        () => (stage.get() === "countdown" ? count() : climb()), 100);
    return () => clearInterval(clock);
});

function launch()
{
    stage.set("countdown");
    note("Countdown started");
}

function abort()
{
    stage.set("aborted");
    note("Aborted by launch control");
}

function reset()
{
    batch(() =>
    {
        countdown.set(5);
        altitude.set(0);
        fuel.set(100);
        log.set([]);
        stage.set("ready");
    });
}

const tenths = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
const km = { style: "unit", unit: "kilometer", maximumFractionDigits: 0 };

const readout = computed(() =>
{
    if (stage.get() === "ready")
    {
        return "Ready";
    }
    if (stage.get() === "countdown")
    {
        return `T-${format.number(countdown.get(), tenths)}`;
    }
    return format.number(altitude.get(), km);
});

/** A button that is enabled only while the `enabled` signal is true. */
function Control(label, enabled, action, kind = "")
{
    return html`
        <button class=${kind} ?disabled=${computed(() => !enabled.get())}
            @click=${action}>${label}</button>`;
}

const steer = (event) => throttle.set(Number(event.target.value));

render(html`
    <section class=${panel} data-stage=${stage}>
        <p class="stage">${computed(() => STAGES[stage.get()])}</p>
        <p class="readout">${readout}</p>
        <label>Altitude
            <progress max=${ORBIT} value=${altitude}></progress>
        </label>
        <label>Fuel
            <progress max="100" value=${fuel}></progress>
        </label>
        <div class="controls">
            ${Control("Launch", ready, launch, "primary")}
            ${Control("Abort", live, abort)}
            ${Control("Reset", idle, reset)}
            <label>Throttle ${throttle}%
                <input type="range" min="40" max="100"
                    .value=${throttle} @input=${steer}>
            </label>
        </div>
        <ol>${each(log, (entry) => entry.id, (entry) => html`
            <li>${computed(() => entry.get().text)}</li>`)}</ol>
    </section>`, "#app");
