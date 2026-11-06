/**
 * The home page's running figure: launch control, which the docs build
 * renders on the server and the browser hydrates from the production build.
 * The page shows the `figure` region of this file as the figure's code.
 * The readout totals what the updates since the page loaded changed in the
 * DOM, measured by a MutationObserver on the output, and how often the
 * component ran. The flow diagram beside it draws each change along the
 * signal graph: the node that changed, the edges it ran along, and the DOM
 * it reached; quick changes run side by side, and nothing moves until the
 * reader presses the button or moves the throttle.
 */
import { batch, computed, effect, html, signal } from "zerolith";

// #region figure
const ORBIT = 100;
const stage = signal("ready");
const countdown = signal(3);
const altitude = signal(0);
const fuel = signal(100);
const throttle = signal(70);

const live = computed(() =>
    stage.get() === "countdown" || stage.get() === "flight");
const action = computed(() =>
    (live.get() ? "Abort" : stage.get() === "ready" ? "Launch" : "Reset"));
const words = new Map([
    ["ready", "Ready"],
    ["orbit", "In orbit"],
    ["empty", "Out of fuel"],
    ["aborted", "Aborted"]
]);
const readout = computed(() =>
{
    if (stage.get() === "countdown")
    {
        return `T-${countdown.get().toFixed(1)}`;
    }
    return words.get(stage.get()) ?? `${Math.round(altitude.get())} km`;
});

function tick()
{
    if (stage.get() === "countdown")
    {
        countdown.set(Math.max(0, countdown.get() - 0.1));
        stage.set(countdown.get() === 0 ? "flight" : "countdown");
        return;
    }
    const power = throttle.get() / 100;
    altitude.set(Math.min(ORBIT, altitude.get() + power * 2));
    fuel.set(Math.max(0, fuel.get() - power * power * 2.4));
    stage.set(altitude.get() === ORBIT ? "orbit"
        : fuel.get() === 0 ? "empty" : "flight");
}

function press()
{
    if (live.get())
    {
        stage.set("aborted");
        return;
    }
    batch(() =>
    {
        stage.set(stage.get() === "ready" ? "countdown" : "ready");
        countdown.set(3);
        altitude.set(0);
        fuel.set(100);
    });
}

function LaunchControl()
{
    effect(() =>
    {
        if (!live.get())
        {
            return undefined;
        }
        const clock = setInterval(tick, 100);
        return () => clearInterval(clock);
    });
    /** @param {{ target: HTMLInputElement }} event */
    const steer = (event) => throttle.set(Number(event.target.value));
    return html`
        <p class="display">${readout}</p>
        <label>Altitude
            <progress max=${ORBIT} value=${altitude}></progress></label>
        <label>Fuel
            <progress max="100" value=${fuel}></progress></label>
        <label>Throttle ${throttle}%
            <input type="range" min="40" max="100"
                .value=${throttle} @input=${steer}></label>
        <button @click=${press}>${action}</button>`;
}
// #endregion figure

const calls = signal(0);
const textNodes = signal(0);
const attributes = signal(0);
const elements = signal(0);

/** LaunchControl, counted: the readout's call count comes from here. */
function counted()
{
    calls.set(calls.get() + 1);
    return LaunchControl();
}

/** Puts the rocket and the readout back where the server renders them, before the figure hydrates again on a later visit. */
export function reset()
{
    batch(() =>
    {
        stage.set("ready");
        countdown.set(3);
        altitude.set(0);
        fuel.set(100);
        throttle.set(70);
        calls.set(0);
        textNodes.set(0);
        attributes.set(0);
        elements.set(0);
    });
}

/** The figure's running half: launch control in its output pane and the readout. */
export function Figure()
{
    return html`
        <div class="output">${counted()}</div>
        <dl class="readout">
            <div><dt>Text nodes changed</dt><dd>${textNodes}</dd></div>
            <div><dt>Attributes changed</dt><dd>${attributes}</dd></div>
            <div><dt>Elements created</dt><dd>${elements}</dd></div>
            <div><dt>LaunchControl() calls</dt><dd>${calls}</dd></div>
        </dl>`;
}

/** The diagram's layers, left to right, which set when each node and edge lights. */
const layers = {
    press: 0, steer: 0,
    stage: 1, throttle: 1,
    live: 2, action: 2,
    clock: 3,
    countdown: 4, altitude: 4, fuel: 4,
    readout: 5,
    "dom-readout": 6, "dom-altitude": 6, "dom-fuel": 6, "dom-throttle": 6, "dom-action": 6
};

const still = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : undefined;

/**
 * The binding a changed DOM node belongs to, by where it sits in the output.
 * @param {Node} node
 * @param {Element} output
 * @returns {string | undefined}
 */
function bindingOf(node, output)
{
    const element = node.nodeType === Node.ELEMENT_NODE ? /** @type {Element} */ (node) : node.parentElement;
    if (element === null)
    {
        return undefined;
    }
    if (element.matches("progress"))
    {
        return [...output.querySelectorAll("progress")].indexOf(element) === 0 ? "altitude" : "fuel";
    }
    if (element.closest(".display") !== null)
    {
        return "readout";
    }
    if (element.closest("button") !== null)
    {
        return "action";
    }
    return element.closest("label") === null ? undefined : "throttle";
}

/**
 * Measures every update of the hydrated figure inside `host`, marks what it
 * changed in the output and the bound expressions in the code, and draws
 * each change along the flow diagram. Marks use the CSS Custom Highlight API
 * and are skipped where a browser lacks it, and the diagram stays still for
 * a reader who prefers reduced motion; the readout works either way.
 * @param {Element} host
 * @returns {() => void} what stops the measuring and removes the marks
 */
export function watch(host)
{
    const output = host.querySelector(".output");
    const figure = host.closest("figure");
    const flow = figure?.querySelector(".flow") ?? null;
    if (output === null)
    {
        return () => undefined;
    }
    const highlights = "highlights" in CSS && typeof Highlight === "function" ? CSS.highlights : undefined;
    const outputMarks = highlights === undefined ? undefined : new Highlight();
    const codeMarks = highlights === undefined ? undefined : new Highlight();
    if (highlights !== undefined && outputMarks !== undefined && codeMarks !== undefined)
    {
        highlights.set("live-output", outputMarks);
        highlights.set("live-code", codeMarks);
    }

    /** @type {Set<string>} */
    let changed = new Set();
    let scheduled = false;
    const schedule = () =>
    {
        if (!scheduled)
        {
            scheduled = true;
            queueMicrotask(() =>
            {
                scheduled = false;
                const seen = changed;
                changed = new Set();
                draw(flow, figure, seen);
            });
        }
    };
    const watched = { stage, countdown, altitude, fuel, throttle, live, readout, action };
    const stops = Object.entries(watched).map(([name, source]) =>
    {
        let first = true;
        return effect(() =>
        {
            source.get();
            if (first)
            {
                first = false;
                return;
            }
            changed.add(name);
            schedule();
        });
    });
    const tickLines = figure?.querySelectorAll("[data-run=\"tick\"]") ?? [];
    stops.push(effect(() =>
    {
        const running = live.get();
        for (const line of tickLines)
        {
            line.toggleAttribute("data-running", running);
        }
    }));
    /** @param {Event} event */
    const pressed = (event) =>
    {
        if (event.target instanceof Element && event.target.closest("button") !== null)
        {
            changed.add("press");
            schedule();
        }
    };
    const steered = () =>
    {
        changed.add("steer");
        schedule();
    };
    output.addEventListener("click", pressed);
    output.addEventListener("input", steered);

    const observer = new MutationObserver((records) =>
    {
        /** @type {Set<Node>} */
        const texts = new Set();
        /** @type {Set<Node>} */
        const touched = new Set();
        /** @type {Set<string>} */
        const bound = new Set();
        let created = 0;
        for (const record of records)
        {
            if (record.type === "characterData")
            {
                texts.add(record.target);
            }
            else if (record.type === "attributes")
            {
                touched.add(record.target);
                const name = bindingOf(record.target, output);
                if (name !== undefined)
                {
                    bound.add(name);
                }
            }
            for (const node of record.addedNodes)
            {
                if (node.nodeType === Node.ELEMENT_NODE)
                {
                    created++;
                }
                else if (node.nodeType === Node.TEXT_NODE)
                {
                    texts.add(node);
                }
            }
        }
        textNodes.set(textNodes.get() + texts.size);
        attributes.set(attributes.get() + touched.size);
        elements.set(elements.get() + created);
        if (outputMarks === undefined || codeMarks === undefined)
        {
            return;
        }
        outputMarks.clear();
        codeMarks.clear();
        for (const node of texts)
        {
            const name = bindingOf(node, output);
            if (name !== "action")
            {
                outputMarks.add(rangeOf(node));
            }
            if (name !== undefined)
            {
                bound.add(name);
            }
        }
        for (const name of bound)
        {
            for (const token of figure?.querySelectorAll(`[data-signal="${name}"]`) ?? [])
            {
                codeMarks.add(rangeOf(token));
            }
        }
    });
    observer.observe(output, { characterData: true, childList: true, subtree: true, attributes: true, attributeFilter: ["value"] });
    return () =>
    {
        observer.disconnect();
        output.removeEventListener("click", pressed);
        output.removeEventListener("input", steered);
        for (const stop of stops)
        {
            stop();
        }
        highlights?.delete("live-output");
        highlights?.delete("live-code");
        for (const animation of flow?.getAnimations({ subtree: true }) ?? [])
        {
            animation.cancel();
        }
    };
}

/**
 * Draws one round of changes: lights each node that changed, sends a spark
 * along each edge a change ran along, and flashes the lines of code that ran.
 * A change runs through the whole graph synchronously, in well under a
 * millisecond, so the drawing keeps the order but runs the whole path in
 * about a quarter of a second and leaves a short afterglow.
 * @param {Element | null} flow
 * @param {Element | null} figure
 * @param {Set<string>} seen
 */
function draw(flow, figure, seen)
{
    if (flow === null || still?.matches !== false)
    {
        return;
    }
    /** @type {Array<[string, string, number]>} */
    const hits = [];
    /** @param {string} id */
    const node = (id) => hits.push(["node", id, layers[/** @type {keyof typeof layers} */ (id)] ?? 0]);
    /** @param {string} from @param {string} to */
    const edge = (from, to) => hits.push(["edge", `${from}>${to}`, layers[/** @type {keyof typeof layers} */ (from)] ?? 0]);
    if (seen.has("press"))
    {
        node("press");
        edge("press", "stage");
        flash(figure, "press");
    }
    if (seen.has("steer"))
    {
        node("steer");
        edge("steer", "throttle");
        flash(figure, "steer");
    }
    if (seen.has("stage"))
    {
        node("stage");
    }
    if (seen.has("live"))
    {
        edge("stage", "live");
        node("live");
        edge("live", "clock");
        node("clock");
        flash(figure, "clock");
    }
    const ticked = ["countdown", "altitude", "fuel"].filter((name) => seen.has(name));
    if (ticked.length > 0 && !seen.has("press"))
    {
        node("clock");
        for (const name of ticked)
        {
            edge("clock", name);
        }
    }
    for (const name of ticked)
    {
        node(name);
    }
    if (seen.has("action"))
    {
        if (seen.has("live"))
        {
            edge("live", "action");
        }
        node("action");
        edge("action", "dom-action");
        node("dom-action");
    }
    if (seen.has("throttle"))
    {
        node("throttle");
        edge("throttle", "dom-throttle");
        node("dom-throttle");
        if (live.get())
        {
            edge("throttle", "clock");
        }
    }
    if (seen.has("readout"))
    {
        for (const source of ["countdown", "altitude", "stage"])
        {
            if (seen.has(source))
            {
                edge(source, "readout");
            }
        }
        node("readout");
        edge("readout", "dom-readout");
        node("dom-readout");
    }
    for (const name of ["altitude", "fuel"])
    {
        if (seen.has(name))
        {
            edge(name, `dom-${name}`);
            node(`dom-${name}`);
        }
    }
    if (hits.length === 0)
    {
        return;
    }
    const first = Math.min(...hits.map(([, , layer]) => layer));
    const accent = getComputedStyle(flow).getPropertyValue("--zl-accent-text");
    for (const [kind, id, layer] of hits)
    {
        const delay = (layer - first) * 20;
        if (kind === "node")
        {
            light(flow.querySelector(`[data-node="${id}"]`), delay + 20, accent);
        }
        else
        {
            spark(flow.querySelector(`[data-edge="${id}"]`), delay, 140);
        }
    }
}

/**
 * Outlines a node of the diagram in the accent color for a moment.
 * @param {Element | null} node
 * @param {number} delay
 * @param {string} accent
 */
function light(node, delay, accent)
{
    const timing = { duration: 500, delay, easing: "ease-out" };
    node?.querySelector("rect")?.animate([{ stroke: accent, offset: 0 }, { stroke: accent, offset: 0.4 }], timing);
    node?.querySelector("text")?.animate([{ fill: accent, offset: 0 }, { fill: accent, offset: 0.4 }], timing);
}

/**
 * Sends a spark along one edge of the diagram and removes it when it arrives.
 * @param {Element | null} edge
 * @param {number} delay
 * @param {number} duration
 */
function spark(edge, delay, duration)
{
    if (!(edge instanceof SVGPathElement))
    {
        return;
    }
    const length = edge.getTotalLength();
    const copy = /** @type {SVGPathElement} */ (edge.cloneNode());
    copy.removeAttribute("data-edge");
    copy.setAttribute("class", "spark");
    copy.style.strokeDasharray = `12 ${length + 12}`;
    copy.style.strokeDashoffset = "12";
    edge.after(copy);
    const run = copy.animate([{ strokeDashoffset: 12 }, { strokeDashoffset: -length }], { duration, delay, easing: "linear" });
    run.addEventListener("finish", () => copy.remove());
    run.addEventListener("cancel", () => copy.remove());
}

/**
 * Flashes the lines of the figure's code that a change ran.
 * @param {Element | null} figure
 * @param {string} name
 */
function flash(figure, name)
{
    for (const line of figure?.querySelectorAll(`[data-run="${name}"]`) ?? [])
    {
        const shade = getComputedStyle(line).getPropertyValue("--zl-code-selection");
        line.animate([{ backgroundColor: shade, offset: 0 }, { backgroundColor: shade, offset: 0.3 }], { duration: 900, easing: "ease-out" });
    }
}

/**
 * @param {Node} node
 * @returns {Range}
 */
function rangeOf(node)
{
    const range = new Range();
    range.selectNodeContents(node);
    return range;
}
