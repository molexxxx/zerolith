/**
 * The playground in the browser: the editor's code is a signal, an effect
 * keeps the highlighted copy under the text in step, and the code runs in a
 * sandboxed frame when the reader presses Run or Ctrl+Enter, picks an
 * example, or resets one. The frame has an opaque origin, loads the
 * development builds through its own import map, and reports console output
 * and errors back with postMessage. The page keeps what the code stores in
 * `localStorage` and `sessionStorage` for the tab, so it lasts through each
 * run and a reload until Reset. Copy link puts the code, compressed, in the
 * address's fragment, which never reaches a server.
 */
import { computed, effect, scope, signal } from "zerolith";
import { highlight } from "./highlight.js";

/**
 * Compresses text into a URL-safe string.
 * @param {string} text
 * @returns {Promise<string>}
 */
async function pack(text)
{
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = "";
    for (const byte of bytes)
    {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The most bytes a shared link's code may unpack to, so a crafted link cannot exhaust the reader's tab. */
const SHARED_LIMIT = 256 * 1024;

/**
 * Reverses `pack`; a damaged fragment, or one that unpacks to more than
 * `SHARED_LIMIT` bytes, gives `undefined`.
 * @param {string} packed
 * @returns {Promise<string | undefined>}
 */
async function unpack(packed)
{
    try
    {
        const binary = atob(packed.replace(/-/g, "+").replace(/_/g, "/"));
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        let size = 0;
        const limited = new TransformStream({
            transform(chunk, controller)
            {
                size += chunk.byteLength;
                if (size > SHARED_LIMIT)
                {
                    controller.error(new RangeError(`The shared code is over ${SHARED_LIMIT} bytes.`));
                    return;
                }
                controller.enqueue(chunk);
            }
        });
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")).pipeThrough(limited);
        return await new Response(stream).text();
    }
    catch
    {
        return undefined;
    }
}

/** The most characters of keys and values the preview's storage holds, local and session together, as a browser caps an origin's storage. */
const STORAGE_LIMIT = 256 * 1024;

/** The key under which this tab's sessionStorage keeps the preview's storage. */
const STORAGE_KEY = "zerolith-playground-storage";

/**
 * What the preview's code keeps in `localStorage` and `sessionStorage`,
 * each as its pairs of a key and a value.
 * @typedef {{ local: Array<[string, string]>, session: Array<[string, string]> }} Kept
 */

/**
 * Whether `list` holds pairs of strings, as a storage's entries do.
 * @param {unknown} list
 * @returns {list is Array<[string, string]>}
 */
function isEntries(list)
{
    return Array.isArray(list) && list.every((pair) => Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "string" && typeof pair[1] === "string");
}

/**
 * The preview's storage in `value`, as the frame sends it and this tab
 * keeps it: entries for local and session storage, within
 * `STORAGE_LIMIT` together. Anything else gives `undefined`, since the
 * frame runs whatever code a link holds.
 * @param {unknown} value
 * @returns {Kept | undefined}
 */
function keptFrom(value)
{
    if (typeof value !== "object" || value === null)
    {
        return undefined;
    }
    const { local, session } = /** @type {{ local?: unknown, session?: unknown }} */ (value);
    if (!isEntries(local) || !isEntries(session))
    {
        return undefined;
    }
    const size = [...local, ...session].reduce((total, [key, text]) => total + key.length + text.length, 0);
    return size > STORAGE_LIMIT ? undefined : { local, session };
}

/**
 * The preview's storage this tab kept, or empty storage when it kept none
 * or refuses storage.
 * @returns {Kept}
 */
function keptInTab()
{
    try
    {
        return keptFrom(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null")) ?? { local: [], session: [] };
    }
    catch
    {
        return { local: [], session: [] };
    }
}

/**
 * Keeps the preview's storage in this tab for the next run and a reload,
 * or forgets it for `undefined`; a tab that refuses storage keeps it for
 * this visit alone.
 * @param {Kept | undefined} kept
 * @returns {boolean}
 */
function keepInTab(kept)
{
    try
    {
        if (kept === undefined)
        {
            sessionStorage.removeItem(STORAGE_KEY);
        }
        else
        {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
        }
        return true;
    }
    catch
    {
        return false;
    }
}

/**
 * The site's theme: the reader's choice, or the system's preference.
 * @returns {"light" | "dark"}
 */
function siteTheme()
{
    const chosen = document.documentElement.getAttribute("data-theme");
    if (chosen === "light" || chosen === "dark")
    {
        return chosen;
    }
    return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * The document the preview frame runs: an import map for the packages, a
 * reporter for console output and errors, a listener that takes the site's
 * theme, storage, and the code as a module. The frame's opaque origin keeps
 * it from seeing the site's theme through `prefers-color-scheme`, so the
 * theme arrives as the root's `data-theme` and in messages when the reader
 * changes it. That origin has no storage either, and reading
 * `localStorage` there throws, so the frame gets a `localStorage` and a
 * `sessionStorage` of its own, filled with what `kept` holds, which send
 * the page their entries after each change and refuse a write past
 * `STORAGE_LIMIT` with a `QuotaExceededError`, as a full storage does.
 * The app stays hidden until the brand's fonts have loaded, or for a
 * second and a half at most, so it never shows first in a fallback face.
 * @param {string} code
 * @param {Record<string, string>} imports
 * @param {"light" | "dark"} theme
 * @param {Kept} kept
 * @returns {string}
 */
function frameDocument(code, imports, theme, kept)
{
    const reporter = `
        const plain = (_, item) => item instanceof Error ? item.name + ": " + item.message : item instanceof Map || item instanceof Set ? [...item] : item;
        const shown = (value) =>
        {
            if (typeof value === "string")
            {
                return value;
            }
            if (typeof value === "function")
            {
                return "function " + (value.name || "anonymous") + "()";
            }
            if (value instanceof Error)
            {
                return value.name + ": " + value.message;
            }
            const label = value instanceof Map || value instanceof Set ? value.constructor.name + " " : "";
            try
            {
                return label + (JSON.stringify(value, plain) ?? String(value));
            }
            catch
            {
                return String(value);
            }
        };
        const send = (level, values) => parent.postMessage({ playground: true, level, text: values.map(shown).join(" ") }, "*");
        for (const level of ["log", "info", "warn", "error"])
        {
            const original = console[level].bind(console);
            console[level] = (...values) => { original(...values); send(level, values); };
        }
        addEventListener("error", (event) => send("error", [event.error?.message ?? event.message]));
        addEventListener("unhandledrejection", (event) => send("error", [event.reason?.message ?? String(event.reason)]));
        {
            const kept = ${JSON.stringify(kept).replace(/</g, "\\u003c")};
            const areas = { local: new Map(kept.local), session: new Map(kept.session) };
            const used = () => [...areas.local, ...areas.session].reduce((total, [key, value]) => total + key.length + value.length, 0);
            const save = () => parent.postMessage({ playgroundStorage: { local: [...areas.local], session: [...areas.session] } }, "*");
            const storage = (entries) => ({
                get length()
                {
                    return entries.size;
                },
                key: (index) => [...entries.keys()][index] ?? null,
                getItem: (key) => entries.get(String(key)) ?? null,
                setItem: (key, value) =>
                {
                    const name = String(key);
                    const text = String(value);
                    const before = entries.get(name);
                    if (used() + text.length + (before === undefined ? name.length : -before.length) > ${STORAGE_LIMIT})
                    {
                        throw new DOMException("Setting the value of '" + name + "' exceeded the quota.", "QuotaExceededError");
                    }
                    entries.set(name, text);
                    save();
                },
                removeItem: (key) =>
                {
                    entries.delete(String(key));
                    save();
                },
                clear: () =>
                {
                    entries.clear();
                    save();
                }
            });
            Object.defineProperty(window, "localStorage", { value: storage(areas.local), configurable: true, enumerable: true });
            Object.defineProperty(window, "sessionStorage", { value: storage(areas.session), configurable: true, enumerable: true });
        }
        addEventListener("message", (event) =>
        {
            if (event.source === parent && (event.data?.playgroundTheme === "light" || event.data?.playgroundTheme === "dark"))
            {
                document.documentElement.setAttribute("data-theme", event.data.playgroundTheme);
            }
        });
        const reveal = () => document.documentElement.setAttribute("data-fonts", "");
        Promise.all(["600 1em Unbounded", "1em Onest", '1em "Martian Mono"'].map((font) => document.fonts.load(font))).finally(reveal);
        setTimeout(reveal, 1500);`;
    return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${new URL("fonts.css", document.baseURI).href}">
<link rel="stylesheet" href="${new URL("preview.css", document.baseURI).href}">
<style>body { padding: clamp(16px, 4vw, 24px); } html:not([data-fonts]) #app { visibility: hidden; }</style>
<script type="importmap">${JSON.stringify({ imports })}</script>
<script>${reporter}</script>
</head>
<body>
<main id="app"></main>
<script type="module">${code.replace(/<\/script/gi, "<\\/script")}</script>
</body>
</html>`;
}

/**
 * Wires the playground inside `host` and returns what stops it, for the
 * site's router to call when the reader leaves the page. While the editor
 * holds changes that have not run, the Run button carries `data-stale` and
 * the hint says so.
 * @param {HTMLElement} host
 * @returns {() => void}
 */
export function start(host)
{
    const select = /** @type {HTMLSelectElement} */ (host.querySelector("select[name=\"example\"]"));
    const editor = /** @type {HTMLTextAreaElement} */ (host.querySelector("textarea[name=\"code\"]"));
    const shadow = /** @type {HTMLElement} */ (host.querySelector(".editor code"));
    const shadowFrame = /** @type {HTMLElement} */ (host.querySelector(".editor pre"));
    let frame = /** @type {HTMLIFrameElement} */ (host.querySelector("iframe"));
    const output = /** @type {HTMLElement} */ (host.querySelector(".console"));
    const runButton = host.querySelector("[data-action=\"run\"]");
    const hint = host.querySelector(".hint");
    const idle = hint?.textContent ?? "";
    /** @type {Record<string, string>} */
    const examples = JSON.parse(host.getAttribute("data-examples") ?? "{}");
    /** @type {Record<string, string>} */
    const relative = JSON.parse(host.getAttribute("data-imports") ?? "{}");
    const imports = Object.fromEntries(Object.entries(relative).map(([specifier, path]) => [specifier, new URL(path, document.baseURI).href]));

    const fragment = new URLSearchParams(location.hash.slice(1));
    const named = fragment.get("example");
    if (named !== null && Object.hasOwn(examples, named))
    {
        select.value = named;
    }
    const code = signal(examples[select.value] ?? editor.value);
    const ran = signal(code.get());
    const notice = signal("");
    editor.value = code.get();
    let stopped = false;
    let kept = keptInTab();

    const owner = scope(() =>
    {
        effect(() =>
        {
            shadow.innerHTML = highlight(code.get() + "\n", "js");
        });
        const stale = computed(() => code.get() !== ran.get());
        effect(() =>
        {
            runButton?.toggleAttribute("data-stale", stale.get());
            if (hint === null)
            {
                return;
            }
            if (notice.get() === "")
            {
                hint.textContent = stale.get() ? "Changes not run yet: press Run or Ctrl+Enter." : idle;
            }
            else
            {
                hint.textContent = notice.get();
            }
        });
    });

    /**
     * Runs the code in a fresh frame. A new frame's first document replaces
     * its blank one, where a new document in the same frame would add a
     * history entry, so Back would step through runs instead of leaving.
     */
    function run()
    {
        output.replaceChildren();
        notice.set("");
        ran.set(code.get());
        const theme = siteTheme();
        const next = /** @type {HTMLIFrameElement} */ (frame.cloneNode(false));
        next.style.colorScheme = theme;
        next.srcdoc = frameDocument(code.get(), imports, theme, kept);
        frame.replaceWith(next);
        frame = next;
    }
    /** @param {string} text */
    function load(text)
    {
        editor.value = text;
        code.set(text);
        run();
    }
    function followTheme()
    {
        const theme = siteTheme();
        frame.style.colorScheme = theme;
        frame.contentWindow?.postMessage({ playgroundTheme: theme }, "*");
    }
    const themes = new MutationObserver(followTheme);
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const preference = matchMedia("(prefers-color-scheme: light)");
    preference.addEventListener("change", followTheme);

    editor.addEventListener("input", () =>
    {
        notice.set("");
        code.set(editor.value);
    });
    editor.addEventListener("scroll", () =>
    {
        shadowFrame.scrollTop = editor.scrollTop;
        shadowFrame.scrollLeft = editor.scrollLeft;
    });

    let escaped = false;
    editor.addEventListener("keydown", (event) =>
    {
        if (event.key === "Escape")
        {
            escaped = true;
            return;
        }
        if (event.key === "Tab" && !escaped && !event.shiftKey)
        {
            event.preventDefault();
            editor.setRangeText("    ", editor.selectionStart, editor.selectionEnd, "end");
            code.set(editor.value);
        }
        else if ((event.ctrlKey || event.metaKey) && event.key === "Enter")
        {
            event.preventDefault();
            run();
        }
        escaped = false;
    });

    const stopPicker = picker(host, select);
    select.addEventListener("change", () =>
    {
        load(examples[select.value] ?? "");
        history.replaceState(history.state, "", `#example=${select.value}`);
    });

    runButton?.addEventListener("click", run);
    host.querySelector("[data-action=\"reset\"]")?.addEventListener("click", () =>
    {
        kept = { local: [], session: [] };
        keepInTab(undefined);
        load(examples[select.value] ?? "");
        history.replaceState(history.state, "", location.pathname);
    });

    const share = host.querySelector("[data-action=\"share\"]");
    share?.addEventListener("click", () =>
    {
        const href = pack(code.get()).then((packed) =>
        {
            const link = new URL(location.href);
            link.hash = `code=${packed}`;
            history.replaceState(history.state, "", link.hash);
            return link.href;
        });
        const copied = typeof ClipboardItem === "function" && typeof navigator.clipboard?.write === "function"
            ? navigator.clipboard.write([new ClipboardItem({ "text/plain": href.then((text) => new Blob([text], { type: "text/plain" })) })])
            : href.then((text) => navigator.clipboard.writeText(text));
        copied.then(() =>
        {
            share.setAttribute("data-copied", "");
            setTimeout(() => share.removeAttribute("data-copied"), 1500);
        }, () => notice.set("The browser did not allow copying here, so copy the link from the address bar."));
    });

    /** @param {MessageEvent} event */
    const onMessage = (event) =>
    {
        if (event.source !== frame.contentWindow || typeof event.data !== "object" || event.data === null)
        {
            return;
        }
        if (Object.hasOwn(event.data, "playgroundStorage"))
        {
            const next = keptFrom(event.data.playgroundStorage);
            if (next !== undefined)
            {
                kept = next;
                keepInTab(next);
            }
            return;
        }
        if (event.data.playground !== true)
        {
            return;
        }
        const line = document.createElement("p");
        line.className = String(event.data.level);
        line.textContent = String(event.data.text);
        output.append(line);
    };
    addEventListener("message", onMessage);

    if (fragment.has("code"))
    {
        void unpack(fragment.get("code") ?? "").then((shared) =>
        {
            if (stopped)
            {
                return;
            }
            load(shared ?? code.get());
            if (shared === undefined)
            {
                const line = document.createElement("p");
                line.className = "error";
                line.textContent = "The code in this link could not be read, so the editor shows an example instead.";
                output.append(line);
            }
        });
    }
    else
    {
        run();
    }

    return () =>
    {
        stopped = true;
        owner.dispose();
        themes.disconnect();
        preference.removeEventListener("change", followTheme);
        removeEventListener("message", onMessage);
        stopPicker();
    };
}

/**
 * Drives the example picker: a button that opens a listbox of the examples,
 * each with its summary, over the native select, which stays the source of
 * the value and what a page without JavaScript shows. Choosing an option
 * sets the select and fires its change event; a change made elsewhere, as
 * from the address, is mirrored back. The list follows the listbox pattern:
 * the arrow keys, Home, and End move, Enter and Space choose, and Escape or
 * a press outside closes it. Each time it opens, and as the window resizes,
 * the list takes the header row's width, 640 px at most, under the button
 * where it fits and moved left as far as it must to end inside the row, so
 * it never widens the page, and every option takes the height of the
 * tallest, so the rows line up whatever their summaries hold.
 * @param {HTMLElement} host
 * @param {HTMLSelectElement} select
 * @returns {() => void}
 */
function picker(host, select)
{
    const root = host.querySelector("[data-picker]");
    const trigger = root?.querySelector(".picker-button");
    const list = root?.querySelector("[role=\"listbox\"]");
    const current = root?.querySelector("#example-current");
    if (!(root instanceof HTMLElement) || !(trigger instanceof HTMLButtonElement) || !(list instanceof HTMLElement))
    {
        return () => undefined;
    }
    const options = /** @type {HTMLElement[]} */ (Array.from(list.querySelectorAll("[role=\"option\"]")));
    let active = 0;

    const sync = () =>
    {
        for (const option of options)
        {
            const chosen = option.getAttribute("data-value") === select.value;
            option.setAttribute("aria-selected", String(chosen));
            if (chosen && current !== null)
            {
                current.textContent = option.querySelector(".name")?.textContent ?? "";
            }
        }
    };
    /** @param {number} index */
    const point = (index) =>
    {
        active = (index + options.length) % options.length;
        options.forEach((option, at) => option.toggleAttribute("data-active", at === active));
        const option = options[active];
        if (option !== undefined)
        {
            list.setAttribute("aria-activedescendant", option.id);
            option.scrollIntoView({ block: "nearest" });
        }
    };
    const fit = () =>
    {
        if (list.hidden)
        {
            return;
        }
        const row = root.closest(".head-row")?.getBoundingClientRect();
        const rowLeft = row?.left ?? 0;
        const rowRight = row?.right ?? document.documentElement.clientWidth;
        const width = Math.floor(Math.min(640, rowRight - rowLeft));
        list.style.setProperty("--picker-width", `${width}px`);
        list.style.setProperty("--picker-shift", "0px");
        list.style.setProperty("--picker-shift", `${Math.min(0, Math.floor(rowRight - width - list.getBoundingClientRect().left))}px`);
        list.style.removeProperty("--picker-row");
        list.style.setProperty("--picker-row", `${Math.max(...options.map((option) => option.offsetHeight))}px`);
    };
    const open = () =>
    {
        list.hidden = false;
        fit();
        trigger.setAttribute("aria-expanded", "true");
        point(Math.max(0, options.findIndex((option) => option.getAttribute("data-value") === select.value)));
        list.focus();
    };
    /** @param {boolean} refocus */
    const close = (refocus) =>
    {
        list.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        if (refocus)
        {
            trigger.focus();
        }
    };
    /** @param {number} index */
    const choose = (index) =>
    {
        const value = options[index]?.getAttribute("data-value");
        if (value !== undefined && value !== null && value !== select.value)
        {
            select.value = value;
            select.dispatchEvent(new Event("change"));
        }
        close(true);
    };

    trigger.addEventListener("click", () => (list.hidden ? open() : close(false)));
    trigger.addEventListener("keydown", (event) =>
    {
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key))
        {
            event.preventDefault();
            open();
        }
    });
    list.addEventListener("keydown", (event) =>
    {
        const moves = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: options.length - 1 };
        if (event.key in moves)
        {
            event.preventDefault();
            point(moves[/** @type {keyof typeof moves} */ (event.key)]);
        }
        else if (event.key === "Enter" || event.key === " ")
        {
            event.preventDefault();
            choose(active);
        }
        else if (event.key === "Escape")
        {
            event.preventDefault();
            close(true);
        }
        else if (event.key === "Tab")
        {
            close(false);
        }
    });
    options.forEach((option, index) =>
    {
        option.addEventListener("click", () => choose(index));
        option.addEventListener("pointermove", () => point(index));
    });
    /** @param {PointerEvent} event */
    const outside = (event) =>
    {
        if (!list.hidden && event.target instanceof Node && !root.contains(event.target))
        {
            close(false);
        }
    };
    document.addEventListener("pointerdown", outside);
    addEventListener("resize", fit);
    select.addEventListener("change", sync);
    sync();
    return () =>
    {
        document.removeEventListener("pointerdown", outside);
        removeEventListener("resize", fit);
        select.removeEventListener("change", sync);
    };
}
