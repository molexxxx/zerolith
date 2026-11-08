/**
 * The docs site's home page: the headline and the create command over
 * launch control, which runs on the page beside its code and draws each
 * change along its signal graph, then a tour of the core patterns in code
 * that runs as tests, the benchmark scores, a coded diagnostic as the
 * command line prints it, the packages, the numbers the build checks, the
 * ways in, and the create command again with the two commands after it.
 * The Markdown twin says the same for agents.
 */
import { type View, html, unsafeHtml } from "zerolith";
import { Figure } from "./demo.js";
import { diagnosticIcon, icon } from "./layout.ts";
import { countWord, fastestWord, listed } from "./text.ts";

export interface Characteristic
{
    name: string;
    value: string;
    check: string;
}

/** A measured value the home page sets large, with the check that holds it. */
export interface Measure
{
    name: string;
    value: string;
    unit: string;
    check: string;
}

/** One pattern of the tour: a guide's tested example and the guide it comes from. */
export interface TourStep
{
    id: "signals" | "templates" | "routing" | "forms" | "state" | "browser" | "server-rendering";
    title: string;
    guide: string;
    /** The title of the guide at `guide`, which the link under the result names. */
    guideTitle: string;
    /** The example as highlighted HTML. */
    code: string;
}

/** One framework's score in the newest benchmark run. */
export interface Score
{
    name: string;
    entry: string;
    version: string;
    score: number;
}

/** A coded finding as `zerolith doctor` prints it, and the source it reports on. */
export interface DoctorSample
{
    file: string;
    /** The source as highlighted HTML, the reported expression wrapped in `.frozen`. */
    source: string;
    code: string;
    line: number;
    column: number;
    message: string;
}

export interface HomeData
{
    version: string;
    /** The figure's code as highlighted HTML, its bound expressions marked with `data-signal`. */
    figureCode: string;
    characteristics: Characteristic[];
    measures: Measure[];
    /** Each runtime package's own code, minified and gzipped, in bytes, keyed by its folder under packages/. */
    sizes: Record<string, number>;
    facts: string[];
    tour: TourStep[];
    scores: { date: string; rows: Score[] };
    doctor: DoctorSample;
    diagnosticCount: number;
}

export const createCommand = "npx @zerolith/cli new my-app";
const startCode = `${createCommand}\ncd my-app\nnpm run dev`;

/** Text with `code` spans, as the characteristics write it. */
function inline(text: string)
{
    return text.split("`").map((part, index) => (index % 2 === 1 ? html`<code>${part}</code>` : part));
}

const features = [
    { href: "/guide/signals/", name: "Fine-grained signals", text: "an update reaches only its bindings." },
    { href: "/guide/templates/", name: "HTML templates", text: "they run in the browser with no compiler." },
    { href: "/guide/routing/", name: "A typed router", text: "loaders, head tags, and plain anchors." },
    { href: "/guide/forms/", name: "Native forms", text: "fetch, pending state, and field errors." },
    { href: "/guide/server-rendering/", name: "Server rendering and hydration", text: "on Request and Response." },
    { href: "/e/", name: "Coded diagnostics", text: "every error names its cause and fix." },
    { href: "/guide/command-line/", name: "One command line", text: "start, develop, bundle, and preview." },
    { href: "/guide/agents/", name: "Ready for coding agents", text: "every new project holds an AGENTS.md and the zerolith skill." }
];

/** A package as the home page lists it: where it runs in place of a size, for a tool that never reaches a page. */
interface Part
{
    name: string;
    href: string;
    text: string;
    runs?: string;
}

const libraries: Part[] = [
    { name: "@zerolith/router", href: "/guide/routing/", text: "Route table, loaders, head tags" },
    { name: "@zerolith/forms", href: "/guide/forms/", text: "Fetch, pending state, field errors" },
    { name: "@zerolith/client", href: "/guide/client/", text: "Typed calls from OpenAPI" },
    { name: "@zerolith/i18n", href: "/guide/i18n/", text: "Locales and compiled messages" },
    { name: "@zerolith/a11y", href: "/guide/accessibility/", text: "Focus, announcer, preferences" },
    { name: "@zerolith/state", href: "/guide/state/", text: "Storage, undo, debounce, selection" },
    { name: "@zerolith/browser", href: "/guide/browser/", text: "Online, visible, sizes, in view" },
    { name: "@zerolith/otel", href: "/guide/observability/", text: "Spans for navigation and requests" }
];

const core: Part = { name: "zerolith", href: "/guide/", text: "Signals, html and css templates, rendering, hydration, server rendering, custom elements, and coded diagnostics" };

const tools: Part[] = [
    { name: "@zerolith/cli", href: "/guide/command-line/", text: "new, dev, build, preview, doctor, skill", runs: "Native binary" },
    { name: "@zerolith/vite", href: "/guide/vite/", text: "The build passes and hot replacement", runs: "Build only" },
    { name: "@zerolith/test", href: "/guide/testing/", text: "Mount, settle, hydration checks", runs: "Tests only" },
    { name: "@zerolith/devtools", href: "/guide/dev-tools/", text: "Inspector and Performance tracks", runs: "Development only" }
];

const ways = [
    { href: "/learn/", name: "Tutorials", text: "A packing list, a sign-up form, a release notes reader, and a widget for any backend, each from an empty folder to a build, one idea per step. Then a short one on working with a coding agent." },
    { href: "/guide/", name: "Guide", text: "Every concept with its one pattern and an example that runs as a test." },
    { href: "/playground/", name: "Playground", text: "Edit zerolith in the browser, see it run, and share a link to what you made." },
    { href: "/reference/zerolith/", name: "Reference", text: "Every export of every package, generated from the source." },
    { href: "/guide/agents/", name: "Coding agents", text: "What an agent reads in a zerolith app, the AGENTS.md and the zerolith skill, and when." }
];

const consoleLines = [20, 30];
const tasks = ["test", "write, edited"];
const routeTable = [
    { name: "home", path: "/", source: "home: route({ path: \"/\"", note: "" },
    { name: "release", path: "/releases/:tag", source: "load: loadRelease", note: "load" },
    { name: "settings", path: "/settings", source: "view: lazy(", note: "lazy" }
];
const fieldError = "Give the note a title of at least two characters.";
const draftKey = "draft";
const typed = ["hello", "hello world"];
const undone = "hello";
const draftWrites = [...typed.map((text) => ({ text, note: "" })), { text: undone, note: "undo" }];
const panelWidth = 720;
const columnWidth = 240;
const columnsFit = Math.floor(panelWidth / columnWidth);
const measured = `${columnsFit} columns fit in ${panelWidth}px.`;
const clicks = 1;

/** Lines that follow one another in an example's source, as one check: each line after the first indented `indent` spaces, as the source writes it. */
function consecutive(indent: number, ...lines: string[]): string
{
    return lines.join(`\n${" ".repeat(indent)}`);
}

/** The draft test's assertion that storage holds `text` under the draft's key, as JSON. */
function draftHolds(text: string): string
{
    return `expect(localStorage.getItem("${draftKey}")).toBe(${JSON.stringify(JSON.stringify(text))});`;
}

/**
 * What each pattern's example produces, drawn as the page or console it ends
 * on, with the lines of its source that hold what the drawing shows: the
 * test's own assertions where the example is a test. Each drawing and its
 * checks read the same values, and the docs build fails when a check is
 * missing from the source or found in it more than once, so a drawing
 * cannot outlive its example or lean on a neighboring test's lines.
 */
const results: Record<TourStep["id"], { label: string; checks: string[]; view: () => View }> = {
    "signals": {
        label: `The console prints ${consoleLines.join(", then ")}`,
        checks: [`expect(printed).toEqual([${consoleLines.map((value) => `[${value}]`).join(", ")}]);`],
        view: () => html`
            <span class="pane-label">Console</span>
            <samp class="console">${consoleLines.map((value) => html`<span>${value}</span>`)}</samp>
            <p>A computed value reads its sources when something asks for it, and only after one of them changed.</p>`
    },
    "templates": {
        label: `A list of ${tasks.join(", then ")}`,
        checks: [`tasks.set([{ id: 2, text: "${tasks[0]}" }, { id: 1, text: "${tasks[1]}" }]);`, `expect(write?.textContent).toBe("${tasks[1]}");`],
        view: () => html`
            <span class="pane-label">#app</span>
            <ul class="rendered">${tasks.map((task, index) => html`<li class=${index === tasks.length - 1 ? "moved" : null}>${task}</li>`)}</ul>
            <p>The row with id 1 moves to the end and keeps its element; only its text node changes.</p>`
    },
    "routing": {
        label: `${routeTable.length} paths, each mapped to its route`,
        checks: routeTable.flatMap((row) => [`path: "${row.path}"`, `${row.name}: route(`, row.source]),
        view: () => html`
            <span class="pane-label">Route table</span>
            <ol class="routes">${routeTable.map((row) => html`<li><code>${row.path}</code><span class="to">${row.name}</span>${row.note === "" ? null : html`<span class="note">${row.note}</span>`}</li>`)}</ol>
            <p>Plain anchors navigate. A loader runs before its page shows, and a lazy view loads on the first visit.</p>`
    },
    "forms": {
        label: "The form showing a field error under the title",
        checks: [`toBe("${fieldError}")`],
        view: () => html`
            <span class="pane-label">#app</span>
            <span class="rendered-form">
                <span class="mock-label">Title</span>
                <span class="mock-field" data-invalid>a</span>
                <span class="mock-error">${unsafeHtml(diagnosticIcon("error"))}<span>${fieldError}</span></span>
                <span class="mock-button">Save</span>
            </span>
            <p>The browser checks the schema first; the server's field errors land in the same place.</p>`
    },
    "state": {
        label: `The field back at ${undone} after an undo, and each write the draft made to localStorage`,
        checks: [
            `stored("${draftKey}", "")`,
            consecutive(12, "<textarea .value=${draft} @input=${type}></textarea>", "<button ?disabled=${noUndo} @click=${edits.undo}>Undo</button>`, \"#app\");"),
            ...typed.map((text) => consecutive(8, `typeInto(area, "${text}");`, "await settle();", draftHolds(text))),
            consecutive(8, "undo.click();", "await settle();", `expect(area.value).toBe("${undone}");`, draftHolds(undone), "expect(undo.disabled).toBe(false);")
        ],
        view: () => html`
            <span class="pane-label">#app</span>
            <span class="rendered-form">
                <span class="mock-field mock-area">${undone}</span>
                <span class="mock-button">Undo</span>
            </span>
            <span class="pane-label">localStorage writes</span>
            <ol class="rendered writes">${draftWrites.map((write) => html`<li><code>${draftKey}</code><span>${JSON.stringify(write.text)}</span>${write.note === "" ? null : html`<span class="note">${write.note}</span>`}</li>`)}</ol>
            <p>The draft is saved on every edit and every undo, so a reload or another tab shows the same text.</p>`
    },
    "browser": {
        label: `A section ${panelWidth} pixels wide that reads: ${measured}`,
        checks: [`style="width: ${panelWidth}px"`, `Math.floor(width.get() / ${columnWidth})`, `await shows("${measured}");`],
        view: () => html`
            <span class="pane-label">#app</span>
            <span class="measured">
                <span class="ruler"><span>${`${panelWidth}px`}</span><span class="ticks">${Array.from({ length: columnsFit }, () => html`<span></span>`)}</span></span>
                <span class="panel">${measured}</span>
            </span>
            <p>The section measures its own content box, kept current by one ResizeObserver that every measured element shares.</p>`
    },
    "server-rendering": {
        label: "The server's markup, then the same button adopted in the browser",
        checks: [`const count = signal(${clicks});`, "<button @click=${add}>Clicked ${count} times</button>", "expect(app.mismatches).toEqual([]);"],
        view: () => html`
            <span class="pane-label">Server</span>
            <samp class="console"><span>${`<button>Clicked ${clicks} times</button>`}</span></samp>
            <span class="pane-label">Browser</span>
            <span class="adopted"><span class="mock-button">${`Clicked ${clicks} times`}</span><span class="note">0 mismatches</span></span>
            <p>The same view renders to a string on the server and adopts those nodes in the browser.</p>`
    }
};

/** The lines of a pattern's source that must hold what the home page draws as its result. */
export function resultChecks(id: TourStep["id"]): readonly string[]
{
    return results[id].checks;
}

/** One node of the launch figure's flow diagram: its id in demo.js, its label, its kind, and its column and row in the wide drawing. */
interface FlowNode
{
    id: string;
    label: string;
    kind: "event" | "signal" | "computed" | "effect" | "dom";
    column: number;
    row: number;
}

const flowColumns = ["event", "signal", "computed", "effect", "signal", "computed", "panel"];
const flowX = [72, 232, 392, 552, 712, 872, 1048];
const flowY = [58, 92, 126, 160, 194];
const nodeHeight = 24;

const flowNodes: FlowNode[] = [
    { id: "press", label: "Launch click", kind: "event", column: 0, row: 0 },
    { id: "steer", label: "Throttle input", kind: "event", column: 0, row: 2 },
    { id: "stage", label: "stage", kind: "signal", column: 1, row: 0 },
    { id: "throttle", label: "throttle", kind: "signal", column: 1, row: 2 },
    { id: "live", label: "live", kind: "computed", column: 2, row: 0 },
    { id: "action", label: "action", kind: "computed", column: 2, row: 4 },
    { id: "clock", label: "clock", kind: "effect", column: 3, row: 1 },
    { id: "countdown", label: "countdown", kind: "signal", column: 4, row: 0 },
    { id: "altitude", label: "altitude", kind: "signal", column: 4, row: 1 },
    { id: "fuel", label: "fuel", kind: "signal", column: 4, row: 2 },
    { id: "readout", label: "readout", kind: "computed", column: 5, row: 0 },
    { id: "dom-readout", label: "Display", kind: "dom", column: 6, row: 0 },
    { id: "dom-altitude", label: "Altitude bar", kind: "dom", column: 6, row: 1 },
    { id: "dom-fuel", label: "Fuel bar", kind: "dom", column: 6, row: 2 },
    { id: "dom-throttle", label: "Throttle label", kind: "dom", column: 6, row: 3 },
    { id: "dom-action", label: "Button label", kind: "dom", column: 6, row: 4 }
];

/** The half width of a node's box in the wide drawing: the panel's parts and the events that name a control are wider than a signal's name. */
function halfWidth(node: FlowNode): number
{
    return node.kind === "dom" ? 80 : node.kind === "event" ? 64 : 56;
}

/** A node's box in the drawing that runs across a wide screen: its center and half its width. */
function widePlace(node: FlowNode): { x: number; y: number; half: number }
{
    return { x: flowX[node.column] ?? 0, y: flowY[node.row] ?? 0, half: halfWidth(node) };
}

/** The point on a node's edge an arrow leaves from or arrives at, in the drawing `place` lays out. */
function port(id: string, side: "left" | "right" | "top" | "bottom", place = widePlace): [number, number]
{
    const node = flowNodes.find((item) => item.id === id);
    if (node === undefined)
    {
        throw new Error(`the launch figure's flow has no node ${id}`);
    }
    const { x, y, half } = place(node);
    return side === "left" ? [x - half, y] : side === "right" ? [x + half, y] : side === "top" ? [x, y - nodeHeight / 2] : [x, y + nodeHeight / 2];
}

/** The edges of the flow, each an orthogonal path between two nodes; a dashed edge is a read inside a function rather than a tracked dependency. */
function flowEdges(): Array<{ id: string; d: string; dashed: boolean }>
{
    const straight = (from: string, to: string) =>
    {
        const [x0, y0] = port(from, "right");
        const [x1] = port(to, "left");
        return `M${x0} ${y0}H${x1}`;
    };
    const elbow = (from: string, to: string, turn: number) =>
    {
        const [x0, y0] = port(from, "right");
        const [x1, y1] = port(to, "left");
        return `M${x0} ${y0}H${turn}V${y1}H${x1}`;
    };
    const [stageTopX, stageTopY] = port("stage", "top");
    const [stageBottomX, stageBottomY] = port("stage", "bottom");
    const [readoutTopX, readoutTopY] = port("readout", "top");
    const [liveRightX, liveRightY] = port("live", "right");
    const [liveBottomX, liveBottomY] = port("live", "bottom");
    const [, actionTopY] = port("action", "top");
    const [throttleRightX, throttleRightY] = port("throttle", "right");
    const [throttleBottomX, throttleBottomY] = port("throttle", "bottom");
    const [domThrottleX, domThrottleY] = port("dom-throttle", "left");
    const [clockTopX, clockTopY] = port("clock", "top");
    const [, clockBottomY] = port("clock", "bottom");
    const [clockLeftX, clockLeftY] = port("clock", "left");
    const [altitudeRightX, altitudeRightY] = port("altitude", "right");
    const [readoutBottomX, readoutBottomY] = port("readout", "bottom");
    return [
        { id: "press>stage", d: straight("press", "stage"), dashed: false },
        { id: "stage>live", d: straight("stage", "live"), dashed: false },
        { id: "live>clock", d: `M${liveRightX} ${liveRightY}H${clockTopX}V${clockTopY}`, dashed: false },
        { id: "live>action", d: `M${liveBottomX} ${liveBottomY}V${actionTopY}`, dashed: false },
        { id: "steer>throttle", d: straight("steer", "throttle"), dashed: false },
        { id: "throttle>clock", d: `M${throttleRightX} ${throttleRightY}H${clockTopX}V${clockBottomY}`, dashed: true },
        { id: "throttle>dom-throttle", d: `M${throttleBottomX} ${throttleBottomY}V${domThrottleY}H${domThrottleX}`, dashed: false },
        { id: "clock>stage", d: `M${clockLeftX} ${clockLeftY}H${stageBottomX}V${stageBottomY}`, dashed: false },
        { id: "clock>countdown", d: elbow("clock", "countdown", 632), dashed: false },
        { id: "clock>altitude", d: straight("clock", "altitude"), dashed: false },
        { id: "clock>fuel", d: elbow("clock", "fuel", 632), dashed: false },
        { id: "stage>readout", d: `M${stageTopX} ${stageTopY}V37H${readoutTopX}V${readoutTopY}`, dashed: false },
        { id: "countdown>readout", d: straight("countdown", "readout"), dashed: false },
        { id: "altitude>readout", d: `M${altitudeRightX} ${altitudeRightY}H${readoutBottomX}V${readoutBottomY}`, dashed: false },
        { id: "readout>dom-readout", d: straight("readout", "dom-readout"), dashed: false },
        { id: "altitude>dom-altitude", d: straight("altitude", "dom-altitude"), dashed: false },
        { id: "fuel>dom-fuel", d: straight("fuel", "dom-fuel"), dashed: false },
        { id: "action>dom-action", d: straight("action", "dom-action"), dashed: false }
    ];
}

/** A node's label as markup. */
function flowLabel(node: FlowNode): string
{
    return node.label.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}

/** One drawing of the flow as SVG markup: the column heads, the edges under the nodes, then each node's box where `place` puts it. */
function flowDrawing(shape: string, size: string, heads: string, edges: Array<{ id: string; d: string; dashed: boolean }>, place: (node: FlowNode) => { x: number; y: number; half: number }): string
{
    const paths = edges.map((edge) => `<path class="${edge.dashed ? "edge read" : "edge"}" data-edge="${edge.id}" d="${edge.d}"/>`).join("");
    const boxes = flowNodes.map((node) =>
    {
        const { x, y, half } = place(node);
        return `<g class="node ${node.kind}" data-node="${node.id}"><rect x="${x - half}" y="${y - nodeHeight / 2}" width="${half * 2}" height="${nodeHeight}"/><text x="${x}" y="${y}">${flowLabel(node)}</text></g>`;
    }).join("");
    return `<svg class="${shape}" viewBox="0 0 ${size}" aria-hidden="true" focusable="false">${heads}<g class="edges">${paths}</g>${boxes}</svg>`;
}

/** The launch figure's flow diagram as SVG markup, running across a wide screen. */
function flowSvg(): string
{
    const heads = flowColumns.map((head, column) => `<text class="head" x="${flowX[column] ?? 0}" y="12">${head}</text>`).join("");
    return flowDrawing("landscape", "1152 208", heads, flowEdges(), widePlace);
}

/** Martian Mono's advance at the diagram's 11 px, so a box in the tall drawing fits its label. */
const monoAdvance = 7.7;

/**
 * Each node's center when the flow runs down a narrow screen: the main
 * chain in the left lane, the clock and its signals beside it, the throttle
 * on the right with the action past it, and the DOM bindings stacked under
 * the main chain, where each lane turns into its own. A binding's place is
 * its left edge, so the stack lines up on the left.
 */
const tallPlaces = new Map<string, [number, number]>([
    ["press", [126, 20]],
    ["steer", [300, 20]],
    ["stage", [126, 70]],
    ["throttle", [300, 70]],
    ["live", [126, 120]],
    ["action", [344, 120]],
    ["clock", [228, 170]],
    ["countdown", [126, 220]],
    ["altitude", [228, 220]],
    ["fuel", [300, 220]],
    ["readout", [126, 270]],
    ["dom-readout", [70, 322]],
    ["dom-altitude", [70, 356]],
    ["dom-fuel", [70, 390]],
    ["dom-action", [70, 424]],
    ["dom-throttle", [70, 458]]
]);

/** Where each column's head sits in the tall drawing, level with the first row of its nodes. */
const tallHeads = [20, 70, 120, 170, 220, 270, 322];

/** A node's box in the drawing that runs down a narrow screen, as wide as its label. */
function tallPlace(node: FlowNode): { x: number; y: number; half: number }
{
    const [x, y] = tallPlaces.get(node.id) ?? [0, 0];
    const half = Math.ceil((node.label.length * monoAdvance + 16) / 2);
    return { x: node.kind === "dom" ? x + half : x, y, half };
}

/** The point on a node's edge in the tall drawing that an edge leaves from or arrives at. */
function tallPort(id: string, side: "left" | "right" | "top" | "bottom"): [number, number]
{
    return port(id, side, tallPlace);
}

/** The edges of the tall drawing: the wide drawing's edges turned to run downward. The binding under the main chain takes its line from above; the others take their lanes in from the right. */
function tallEdges(): Array<{ id: string; d: string; dashed: boolean }>
{
    const down = (from: string, to: string) =>
    {
        const [x0, y0] = tallPort(from, "bottom");
        const [, y1] = tallPort(to, "top");
        return `M${x0} ${y0}V${y1}`;
    };
    const elbow = (from: string, to: string, turn: number) =>
    {
        const [x0, y0] = tallPort(from, "bottom");
        const [x1, y1] = tallPort(to, "top");
        return `M${x0} ${y0}V${turn}H${x1}V${y1}`;
    };
    const into = (from: string, to: string) =>
    {
        const [x0, y0] = tallPort(from, "bottom");
        const [x1, y1] = tallPort(to, "right");
        return `M${x0} ${y0}V${y1}H${x1}`;
    };
    const [liveRightX, liveRightY] = tallPort("live", "right");
    const [actionLeftX] = tallPort("action", "left");
    const [throttleRightX, throttleRightY] = tallPort("throttle", "right");
    const [domThrottleRightX, domThrottleRightY] = tallPort("dom-throttle", "right");
    const [stageLeftX, stageLeftY] = tallPort("stage", "left");
    const [stageRightX, stageRightY] = tallPort("stage", "right");
    const [readoutLeftX, readoutLeftY] = tallPort("readout", "left");
    const [clockLeftX, clockLeftY] = tallPort("clock", "left");
    const [altitudeBottomX, altitudeBottomY] = tallPort("altitude", "bottom");
    const [readoutRightX, readoutRightY] = tallPort("readout", "right");
    return [
        { id: "press>stage", d: down("press", "stage"), dashed: false },
        { id: "stage>live", d: down("stage", "live"), dashed: false },
        { id: "live>clock", d: elbow("live", "clock", 145), dashed: false },
        { id: "live>action", d: `M${liveRightX} ${liveRightY}H${actionLeftX}`, dashed: false },
        { id: "steer>throttle", d: down("steer", "throttle"), dashed: false },
        { id: "throttle>clock", d: elbow("throttle", "clock", 141), dashed: true },
        { id: "throttle>dom-throttle", d: `M${throttleRightX} ${throttleRightY}H388V${domThrottleRightY}H${domThrottleRightX}`, dashed: false },
        { id: "clock>stage", d: `M${clockLeftX} ${clockLeftY}H170V${stageRightY}H${stageRightX}`, dashed: false },
        { id: "clock>countdown", d: elbow("clock", "countdown", 196), dashed: false },
        { id: "clock>altitude", d: down("clock", "altitude"), dashed: false },
        { id: "clock>fuel", d: elbow("clock", "fuel", 196), dashed: false },
        { id: "stage>readout", d: `M${stageLeftX} ${stageLeftY}H70V${readoutLeftY}H${readoutLeftX}`, dashed: false },
        { id: "countdown>readout", d: down("countdown", "readout"), dashed: false },
        { id: "altitude>readout", d: `M${altitudeBottomX} ${altitudeBottomY}V${readoutRightY}H${readoutRightX}`, dashed: false },
        { id: "readout>dom-readout", d: down("readout", "dom-readout"), dashed: false },
        { id: "altitude>dom-altitude", d: into("altitude", "dom-altitude"), dashed: false },
        { id: "fuel>dom-fuel", d: into("fuel", "dom-fuel"), dashed: false },
        { id: "action>dom-action", d: into("action", "dom-action"), dashed: false }
    ];
}

/** The flow diagram drawn down a narrow screen, where the wide drawing would scroll inside its panel. */
function flowSvgTall(): string
{
    const heads = flowColumns.map((head, column) => `<text class="head" x="62" y="${tallHeads[column] ?? 0}">${head}</text>`).join("");
    return flowDrawing("portrait", "400 480", heads, tallEdges(), tallPlace);
}

/** The create command with its copy button, as the hero and the closing section show it. */
function Command()
{
    return html`
        <div class="command">
            <code>${createCommand.split(" ").map((word, index) => html`${index === 0 ? "" : " "}<span>${word}</span>`)}</code>
            <button class="copy button primary" type="button" data-copy=${createCommand} aria-label="Copy the command"><span class="idle">${unsafeHtml(icon("copy"))}Copy</span><span class="done">${unsafeHtml(icon("check"))}Copied</span><span class="failed">Press Ctrl+C</span></button>
        </div>`;
}

/** The tour: one tab per pattern, each showing the guide's tested example beside what it produces. */
function Tour(steps: TourStep[])
{
    return html`
        <section class="band tour">
            <h2>Every example here runs as a test</h2>
            <p>Each one comes from its guide, and CI runs it on every change, so the code you see is code that works.</p>
            <div class="tabs" role="tablist" aria-label="Patterns">
                ${steps.map((step, index) => html`<button type="button" role="tab" id=${`tour-${step.id}`} aria-controls=${`tour-${step.id}-panel`} aria-selected=${String(index === 0)} tabindex=${index === 0 ? "0" : "-1"}>${step.title}</button>`)}
            </div>
            ${steps.map((step, index) => html`
                <div class="pair" role="tabpanel" id=${`tour-${step.id}-panel`} aria-labelledby=${`tour-${step.id}`} ?hidden=${index !== 0}>
                    <div class="code" data-language="ts"><pre><code>${unsafeHtml(step.code)}</code></pre></div>
                    <div class="result">
                        <div class="shown" role="img" aria-label=${results[step.id].label}>${results[step.id].view()}</div>
                        <a class="more" href=${step.guide}>${`Read the ${step.guideTitle.toLowerCase()} guide`}${unsafeHtml(icon("arrow-right"))}</a>
                    </div>
                </div>`)}
        </section>`;
}

/** A score as the page prints it, to two decimals, so its bar never disagrees with its number. */
function printed(score: number): number
{
    return Number(score.toFixed(2));
}

/**
 * The sentence under the speed heading. It names the release the run
 * measured, which trails the site's own version until the benchmarks
 * workflow measures a new release.
 */
export function speedLine(scores: HomeData["scores"]): string
{
    const ours = scores.rows.find((row) => row.name === "zerolith");
    const others = scores.rows.filter((row) => row.name !== "vanilla" && row.name !== "zerolith");
    const close = " Lower is faster. These are this project's runs, not the official results.";
    if (ours === undefined)
    {
        return `zerolith on js-framework-benchmark, next to hand-written JavaScript and ${countWord(others.length)} other frameworks, measured on ${scores.date}.${close}`;
    }
    const score = printed(ours.score);
    const extra = Math.round((score - 1) * 100);
    const pace = extra <= 0 ? "it keeps pace with hand-written code" : `it takes about ${extra} percent longer`;
    const tied = others.filter((row) => printed(row.score) === score).map((row) => row.name);
    const tie = tied.length === 0 ? "" : ` and ties with ${listed(tied)}`;
    return `zerolith ${ours.version} scores ${score.toFixed(2)} on js-framework-benchmark, where hand-written JavaScript scores 1.00, so ${pace}. It ran next to ${countWord(others.length)} other frameworks on ${scores.date}${tie}.${close}`;
}

/**
 * The speed heading: zerolith's place among the frameworks other than
 * hand-written JavaScript, counted by the scores as the bars print them, so
 * a framework that prints the same score is a tie.
 */
export function speedHeading(scores: HomeData["scores"]): string
{
    const ours = scores.rows.find((row) => row.name === "zerolith");
    if (ours === undefined)
    {
        return "Benchmark scores";
    }
    const field = scores.rows.filter((row) => row.name !== "vanilla");
    const score = printed(ours.score);
    const place = field.filter((row) => printed(row.score) < score).length + 1;
    const tied = field.some((row) => row !== ours && printed(row.score) === score);
    const standing = `${fastestWord(place)} of ${countWord(field.length)} frameworks`;
    return tied ? `Tied for ${standing}` : `The ${standing}`;
}

/** The benchmark scores as ranked bars, each the extra time over hand-written JavaScript. */
function Speed(scores: HomeData["scores"])
{
    const slowest = Math.max(...scores.rows.map((row) => printed(row.score)));
    return html`
        <section class="band speed">
            <div class="split">
                <div class="copy-column">
                    <h2>${speedHeading(scores)}</h2>
                    <p>${speedLine(scores)}</p>
                    <a class="more" href="/benchmarks/">See every operation and the method${unsafeHtml(icon("arrow-right"))}</a>
                </div>
                <ol class="bars">
                    ${scores.rows.map((row) => html`
                        <li class=${row.name === "zerolith" ? "ours" : null}>
                            <span class="name">${row.name}<span class="entry">${`${row.entry} ${row.version}`}</span></span>
                            <span class="track" aria-hidden="true">${printed(row.score) > 1 ? html`<span class="fill" style=${`--length: ${slowest <= 1 ? 0 : (((printed(row.score) - 1) / (slowest - 1)) * 100).toFixed(2)}%`}></span>` : null}</span>
                            <span class="score">${printed(row.score).toFixed(2)}</span>
                        </li>`)}
                </ol>
            </div>
        </section>`;
}

/** A coded diagnostic: the source with the read it reports, and the command line's report of it. */
function Diagnostics(doctor: DoctorSample, count: number)
{
    const page = `/e/${doctor.code}/`;
    return html`
        <section class="band errors">
            <h2>Errors that name the fix</h2>
            <p>Every warning and error carries a code, its cause, and the fix, and every code has a page. Here <code>zerolith doctor</code> catches a read that would never update.</p>
            <div class="pair">
                <div class="source">
                    <span class="bar">${doctor.file}</span>
                    <div class="code" data-language="js"><pre><code>${unsafeHtml(doctor.source)}</code></pre></div>
                </div>
                <div class="terminal">
                    <span class="bar">Terminal</span>
                    <samp class="screen">
                        <span class="line"><span class="prompt">$</span> zerolith doctor</span>
                        <span class="line gap"><span class="badge">zerolith</span> <b>doctor</b> <span class="dim">~/my-app</span></span>
                        <span class="line row"><span class="warn">warning</span><span><b>${doctor.code}</b>${`: ${doctor.file}:${doctor.line}:${doctor.column}: ${doctor.message}`}</span></span>
                        <span class="line row"><span></span><span><span class="hint">fix:</span> See <a href=${page}>${`https://zerolith.dev${page}`}</a></span></span>
                        <span class="line gap">0 errors, 1 warning</span>
                        <span class="line"><span class="prompt">$</span> <span class="cursor"></span></span>
                    </samp>
                </div>
            </div>
            <a class="more" href="/e/">${`Browse all ${count} diagnostic codes`}${unsafeHtml(icon("arrow-right"))}</a>
        </section>`;
}

/** A size in kilobytes as the package list sets it, the unit smaller. */
function kilobytes(bytes: number)
{
    return html`${(bytes / 1000).toFixed(1)}<span class="unit">kB</span>`;
}

/** One package in the list: its name and guide, what it gives, and its gzipped size, or where it runs for a tool. */
function PackageRow(part: Part, sizes: Record<string, number>)
{
    const size = sizes[part.name.replace("@zerolith/", "")];
    if (size === undefined && part.runs === undefined)
    {
        throw new Error(`The home page lists ${part.name} with neither a measured size nor where it runs`);
    }
    return html`
        <tr>
            <th scope="row"><a href=${part.href}>${part.name}</a></th>
            <td class="check">${part.text}</td>
            <td class="value">${size === undefined ? part.runs : kilobytes(size)}</td>
        </tr>`;
}

/**
 * The core and every package as a ruled list, each with what it gives and
 * what it adds to a page, gzipped and measured on every build, then the
 * counts and facts the build holds.
 */
function Packages(measures: Measure[], facts: string[], sizes: Record<string, number>)
{
    const [size, ...counts] = measures;
    return html`
        <section class="band packages">
            <h2>${`One core and ${libraries.length + tools.length} packages`}</h2>
            <p>Each package is optional, has its own guide, and shares the core's signals, so nothing needs an adapter. Sizes are each package's own code, minified and gzipped on every build${size === undefined ? "." : html`: the core is ${inline(size.check)}.`}</p>
            <table class="datasheet sizes">
                <thead>
                    <tr><th scope="col">Package</th><th scope="col">What it gives you</th><th scope="col" class="value">Gzip</th></tr>
                </thead>
                <tbody class="core">
                    <tr>
                        <th scope="row"><a href=${core.href}>${core.name}</a></th>
                        <td class="check">${core.text}</td>
                        <td class="value">${size === undefined ? null : html`${size.value}<span class="unit">${size.unit}</span>`}</td>
                    </tr>
                </tbody>
                <tbody>
                    <tr class="group"><th scope="colgroup" colspan="3">Libraries</th></tr>
                    ${libraries.map((part) => PackageRow(part, sizes))}
                </tbody>
                <tbody>
                    <tr class="group"><th scope="colgroup" colspan="3">Tools</th></tr>
                    ${tools.map((part) => PackageRow(part, sizes))}
                </tbody>
            </table>
            <ul class="facts">${[...counts.map((count) => `${count.value} ${count.name.toLowerCase()}`), ...facts].map((fact) => html`<li>${inline(fact)}</li>`)}</ul>
        </section>`;
}

/** The closing band: the ways to learn zerolith beside a terminal with the create command and the two after it, each with its own copy button. */
function Start()
{
    return html`
        <section class="band start stage">
            <div class="start-copy">
                <h2>Start a zerolith project</h2>
                <p>Node 24 or newer is required. The create command writes a starter that asks for the language, the build tool, and the inspector; <code>--yes</code> takes every default. To skip the build step, <a href="/guide/command-line/#importmap">serve it with an import map</a>.</p>
            </div>
            <div class="shell">
                <div class="bar">Terminal</div>
                <samp class="screen">${startCode.split("\n").map((line) => html`<span class="line"><span class="text"><span class="prompt">$ </span><span class="typed">${line.split(" ").map((word, index) => html`${index === 0 ? "" : " "}<span>${word}</span>`)}</span></span><button class="copy" type="button" data-copy=${line} aria-label=${`Copy ${line}`}><span class="idle">${unsafeHtml(icon("copy"))}</span><span class="done">${unsafeHtml(icon("check"))}</span></button></span>`)}</samp>
            </div>
            <ul class="index">${ways.map((way) => html`<li><a href=${way.href}><span class="name">${way.name}</span><span class="text">${way.text}</span>${unsafeHtml(icon("arrow-right"))}</a></li>`)}</ul>
        </section>`;
}

/** The home page's main content. */
export function Home(data: HomeData): View
{
    return html`
        <section class="hero stage">
            <div class="title">
                <h1>A web framework <span>built on signals</span></h1>
                <p class="lead">Routing, forms, rendering, and i18n, with clear patterns for you and your agent.</p>
                <div class="get">
                    ${Command()}
                    <p class="ways-in"><a href="/learn/">Start the tutorial</a><a href="/playground/">Open the playground</a></p>
                </div>
            </div>
            <figure class="figure" aria-label="Launch control running on this page: its code, the panel its template draws, the counters that measure the panel, and the signal graph a change runs along to reach it">
                <p class="cue">LaunchControl() runs on this page. Press Launch, then follow the same change through its code, the counters, and the signal graph. Point at a part of the panel to find it in each.</p>
                <div class="code" data-language="js"><p class="part">Its code · the template draws the panel</p><pre tabindex="0" role="region" aria-label="Launch control's code" data-scroll-on-focus><code>${unsafeHtml(data.figureCode)}</code></pre></div>
                <div class="run" data-island="figure">${Figure()}</div>
                <div class="flow"><p class="part">How a change reaches the panel</p><p class="visually-hidden">Pressing Launch writes the stage. While the stage is live, the clock effect writes the countdown, the altitude, and the fuel on each tick; the readout follows them into the panel's display, the bars take the altitude and the fuel, and the button's label follows whether the stage is live.</p>${unsafeHtml(flowSvg())}${unsafeHtml(flowSvgTall())}<p class="flow-key">Solid: a change runs along it. Dashed: read on each tick, not tracked; it moves while the clock reads it.</p></div>
            </figure>
        </section>
        ${Tour(data.tour)}
        ${Speed(data.scores)}
        ${Diagnostics(data.doctor, data.diagnosticCount)}
        ${Packages(data.measures, data.facts, data.sizes)}
        ${Start()}`;
}

/** The page a missing address shows. */
export function NotFound(): View
{
    return html`
        <section class="hero page-head missing">
            <div class="title">
                <h1>Page not found</h1>
                <p class="lead">Nothing lives at this address. One of these will get you back on track.</p>
                <p class="ways-in"><a href="/">Home</a><a href="/learn/">Tutorial</a><a href="/guide/">Guide</a><a href="/reference/zerolith/">Reference</a></p>
            </div>
        </section>`;
}

/** The home page as Markdown, for agents and the llms indexes. */
export function homeMarkdown(data: HomeData): string
{
    const ours = data.scores.rows.find((row) => row.name === "zerolith");
    return [
        "# zerolith",
        "",
        "A web framework built on signals. Routing, forms, rendering, and i18n, with clear patterns for you and your agent.",
        "",
        "## Start",
        "",
        "```sh",
        startCode,
        "```",
        "",
        "## Features",
        "",
        ...features.map((feature) => `- [${feature.name}](${feature.href}): ${feature.text}`),
        "",
        "## Patterns",
        "",
        "Each pattern has a guide, and each guide's examples run as tests in CI:",
        "",
        ...data.tour.map((step) => `- [${step.title}](${step.guide})`),
        "",
        "## Benchmarks",
        "",
        `${ours === undefined ? "zerolith" : `zerolith scores ${printed(ours.score).toFixed(2)}`} on js-framework-benchmark, where hand-written JavaScript is 1.00 and lower is faster, in this project's run of ${data.scores.date}; these are not the official results. [Benchmarks](/benchmarks/) has every operation and the method.`,
        "",
        "| Framework | Entry | Score |",
        "| --- | --- | --- |",
        ...data.scores.rows.map((row) => `| ${row.name} | ${row.entry} ${row.version} | ${printed(row.score).toFixed(2)} |`),
        "",
        "## Diagnostics",
        "",
        `Every warning and error carries a code, its cause, and the fix, and each of the ${data.diagnosticCount} codes has a page under [/e/](/e/). For example, \`zerolith doctor\` reports a \`.get()\` read bound in a template as [${data.doctor.code}](/e/${data.doctor.code}/).`,
        "",
        "## Packages",
        "",
        ...[core, ...libraries, ...tools].map((part) => `- [${part.name}](${part.href}): ${part.text}`),
        "",
        "## Characteristics",
        "",
        "| Characteristic | Value | How it is checked |",
        "| --- | --- | --- |",
        ...data.characteristics.map((row) => `| ${row.name} | ${row.value} | ${row.check} |`),
        "",
        "## Learn",
        "",
        ...ways.map((way) => `- [${way.name}](${way.href}): ${way.text}`)
    ].join("\n");
}
