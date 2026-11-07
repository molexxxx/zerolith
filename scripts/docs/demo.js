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
const CLIMB = 2;
const BURN = 2.4;
const RUNNING = new Set(["countdown", "flight"]);

const stage = signal("ready");
const countdown = signal(3);
const altitude = signal(0);
const fuel = signal(100);
const throttle = signal(70);

const live = computed(() => RUNNING.has(stage.get()));
const action = computed(() => (live.get() ? "Abort" : "Launch"));

const labels = new Map([
    ["ready", "Ready"],
    ["orbit", "In orbit"],
    ["empty", "Out of fuel"],
    ["aborted", "Aborted"]
]);

const readout = computed(() =>
{
    const current = stage.get();
    if (current === "countdown")
    {
        return `T-${countdown.get().toFixed(1)}`;
    }
    if (current === "flight")
    {
        return `${Math.round(altitude.get())} km`;
    }
    return labels.get(current);
});

function tick()
{
    if (stage.get() === "countdown")
    {
        countdown.set(Math.max(0, countdown.get() - 0.1));
        if (countdown.get() === 0)
        {
            stage.set("flight");
        }
        return;
    }
    const power = throttle.get() / 100;
    altitude.set(Math.min(ORBIT, altitude.get() + CLIMB * power));
    fuel.set(Math.max(0, fuel.get() - BURN * power ** 2));
    if (altitude.get() === ORBIT)
    {
        stage.set("orbit");
    }
    else if (fuel.get() === 0)
    {
        stage.set("empty");
    }
}

function fly()
{
    countdown.set(3);
    altitude.set(0);
    fuel.set(100);
    const clock = setInterval(tick, 100);
    return () => clearInterval(clock);
}

function press()
{
    stage.set(live.get() ? "aborted" : "countdown");
}

function LaunchControl()
{
    effect(() => (live.get() ? fly() : undefined));
    /** @param {{ target: HTMLInputElement }} event */
    const steer = (event) => throttle.set(Number(event.target.value));
    return html`
        <p class="display">${readout}</p>
        <label>
            Altitude
            <progress max=${ORBIT} value=${altitude}></progress>
        </label>
        <label>
            Fuel
            <progress max="100" value=${fuel}></progress>
        </label>
        <label>
            Throttle ${throttle}%
            <input type="range" min="40"
                .value=${throttle} @input=${steer}>
        </label>
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
        <p class="cue">Press Launch: the text nodes change, and LaunchControl() still runs only once.</p>
        <dl class="readout">
            <div><dt>Text nodes changed</dt><dd>${textNodes}</dd></div>
            <div><dt>Attributes changed</dt><dd>${attributes}</dd></div>
            <div><dt>Elements created</dt><dd>${elements}</dd></div>
            <div><dt>LaunchControl() calls</dt><dd>${calls}</dd></div>
        </dl>`;
}

/** The diagram's layers, in the order a change runs through them, which set when each node and edge lights. */
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
    let before = stage.get();
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
                draw(flow, figure, seen, before);
                before = stage.get();
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
    const reads = figure?.querySelectorAll("[data-edge=\"throttle>clock\"]") ?? [];
    stops.push(effect(() =>
    {
        const reading = stage.get() === "flight";
        for (const edge of reads)
        {
            edge.toggleAttribute("data-reading", reading);
        }
    }));
    const tickLines = figure?.querySelectorAll("[data-run=\"tick\"]") ?? [];
    const pane = figure?.querySelector(".code pre");
    let ran = false;
    stops.push(effect(() =>
    {
        const running = live.get();
        for (const line of tickLines)
        {
            line.toggleAttribute("data-running", running);
        }
        const [first] = tickLines;
        if (running && !ran && pane instanceof HTMLElement && first !== undefined)
        {
            const top = first.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - pane.clientHeight / 3;
            pane.scrollTo({ top: Math.max(0, top), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        }
        ran = running;
    }));
    /**
     * Records the click before the button's handler runs, in the capture
     * phase, so the click and the changes it makes land in one round: the
     * browser drains microtasks between listeners, so a mark made while the
     * event bubbles would come a round after them.
     * @param {Event} event
     */
    const pressed = (event) =>
    {
        if (event.target instanceof Element && event.target.closest("button") !== null)
        {
            changed.add("press");
        }
    };
    const steered = () =>
    {
        changed.add("steer");
    };
    /** Draws an event that changed nothing, which no signal's change scheduled. */
    const settle = () =>
    {
        if (changed.size > 0)
        {
            schedule();
        }
    };
    output.addEventListener("click", pressed, { capture: true });
    output.addEventListener("input", steered, { capture: true });
    output.addEventListener("click", settle);
    output.addEventListener("input", settle);

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
        output.removeEventListener("click", pressed, { capture: true });
        output.removeEventListener("input", steered, { capture: true });
        output.removeEventListener("click", settle);
        output.removeEventListener("input", settle);
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
 * Draws one round of changes: outlines each node that changed, sends a small
 * square along each edge a change ran along, and flashes the lines of code
 * that ran.
 * The click writes only the stage; the clock resets the countdown,
 * altitude, and fuel when a flight starts, writes them on each tick, and
 * writes the stage when a countdown or a flight ends. The readout takes a
 * change only from what it reads in the stage the round began or ended in.
 * The throttle read, the dashed edge, is not a change, so it never lights
 * here: its dashes march while the clock reads it. It draws on whichever drawing of
 * the flow is showing, the one that runs across a wide screen or the one
 * that runs down a narrow one.
 * A change runs through the whole graph synchronously, in well under a
 * millisecond, so the drawing keeps the order as a wave: each square leaves
 * its layer 180 ms after the one before and eases along its edge in 260 ms,
 * and each node outlines as the squares reach it. A clock that ticks every
 * 100 ms sends a steady stream of squares along its paths while it runs.
 * @param {Element | null} flow
 * @param {Element | null} figure
 * @param {Set<string>} seen
 * @param {string} before the stage when the round began
 */
function draw(flow, figure, seen, before)
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
    const clicked = seen.has("press");
    const current = stage.get();
    if (clicked)
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
        if (!clicked)
        {
            node("clock");
            edge("clock", "stage");
        }
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
    const written = ["countdown", "altitude", "fuel"].filter((name) => seen.has(name));
    for (const name of written)
    {
        node("clock");
        edge("clock", name);
        node(name);
    }
    if (seen.has("action"))
    {
        edge("live", "action");
        node("action");
        edge("action", "dom-action");
        node("dom-action");
    }
    if (seen.has("throttle"))
    {
        node("throttle");
        edge("throttle", "dom-throttle");
        node("dom-throttle");
    }
    if (seen.has("readout"))
    {
        const read = { stage: true, countdown: before === "countdown" || current === "countdown", altitude: before === "flight" || current === "flight" };
        for (const source of /** @type {const} */ (["stage", "countdown", "altitude"]))
        {
            if (seen.has(source) && read[source])
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
    const shown = Array.from(flow.children).find((child) => child.getClientRects().length > 0) ?? flow;
    for (const [kind, id, layer] of hits)
    {
        const delay = (layer - first) * 180;
        if (kind === "node")
        {
            const box = shown.querySelector(`[data-node="${id}"]`);
            light(box?.querySelector("rect") ?? null, "stroke", delay, accent);
            light(box?.querySelector("text") ?? null, "fill", delay, accent);
        }
        else
        {
            travel(shown.querySelector(`[data-edge="${id}"]`), id, delay);
        }
    }
}

/**
 * Outlines one part of a node, its box or its label, in the accent color and
 * fades it back.
 * @param {Element | null} part
 * @param {"stroke" | "fill"} property
 * @param {number} delay
 * @param {string} accent
 */
function light(part, property, delay, accent)
{
    part?.animate([{ [property]: accent, offset: 0 }, { [property]: accent, offset: 0.3 }], { duration: 600, delay, easing: "ease-out" });
}

/**
 * The corners of an edge's path, which the drawing writes as one absolute
 * move followed by horizontal and vertical lines.
 * @param {string} path
 * @returns {Array<[number, number]>}
 */
function corners(path)
{
    /** @type {Array<[number, number]>} */
    const points = [];
    let x = 0;
    let y = 0;
    for (const [, command, first, second] of path.matchAll(/([MHV])(-?[\d.]+)(?:\s(-?[\d.]+))?/g))
    {
        if (command === "M")
        {
            x = Number(first);
            y = Number(second);
        }
        else if (command === "H")
        {
            x = Number(first);
        }
        else
        {
            y = Number(first);
        }
        points.push([x, y]);
    }
    return points;
}

/**
 * Sends a small square along one edge, from its source to its target, and
 * removes it when it arrives. It stays hidden while it waits its turn in the
 * wave, and it moves by transform alone, so the line under it is never
 * repainted.
 * @param {Element | null} edge
 * @param {string} id
 * @param {number} delay
 */
function travel(edge, id, delay)
{
    const points = corners(edge?.getAttribute("d") ?? "");
    if (edge === null || points.length < 2)
    {
        return;
    }
    const lengths = points.map((point, index) =>
    {
        const before = points[index - 1] ?? point;
        return Math.abs(point[0] - before[0]) + Math.abs(point[1] - before[1]);
    });
    const total = lengths.reduce((sum, length) => sum + length, 0);
    let walked = 0;
    const keyframes = points.map(([x, y], index) =>
    {
        walked += lengths[index] ?? 0;
        return { transform: `translate(${x}px, ${y}px)`, opacity: 1, offset: total === 0 ? 0 : walked / total };
    });
    const square = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    square.setAttribute("class", "pulse");
    square.setAttribute("data-for", id);
    square.setAttribute("x", "-2");
    square.setAttribute("y", "-2");
    square.setAttribute("width", "4");
    square.setAttribute("height", "4");
    square.style.opacity = "0";
    edge.parentElement?.append(square);
    const run = square.animate(keyframes, { duration: 260, delay, easing: "ease-in-out" });
    run.addEventListener("finish", () => square.remove());
    run.addEventListener("cancel", () => square.remove());
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
