/**
 * The playground in the browser: the editor's code is a signal, an effect
 * keeps the highlighted copy under the text in step, and the code runs in a
 * sandboxed frame when the reader presses Run or Ctrl+Enter, picks an
 * example, or resets one. The frame has an opaque origin, loads the
 * development builds through its own import map, and reports console output
 * and errors back with postMessage. Copy link puts the code, compressed, in
 * the address's fragment, which never reaches a server.
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

/**
 * Reverses `pack`; a damaged fragment gives `undefined`.
 * @param {string} packed
 * @returns {Promise<string | undefined>}
 */
async function unpack(packed)
{
    try
    {
        const binary = atob(packed.replace(/-/g, "+").replace(/_/g, "/"));
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return await new Response(stream).text();
    }
    catch
    {
        return undefined;
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
 * theme, and the code as a module. The frame's opaque origin keeps it from
 * seeing the site's theme through `prefers-color-scheme`, so the theme
 * arrives as the root's `data-theme` and in messages when the reader
 * changes it.
 * @param {string} code
 * @param {Record<string, string>} imports
 * @param {"light" | "dark"} theme
 * @returns {string}
 */
function frameDocument(code, imports, theme)
{
    const reporter = `
        const send = (level, values) => parent.postMessage({ playground: true, level, text: values.map((value) => typeof value === "string" ? value : (() => { try { return JSON.stringify(value); } catch { return String(value); } })()).join(" ") }, "*");
        for (const level of ["log", "info", "warn", "error"])
        {
            const original = console[level].bind(console);
            console[level] = (...values) => { original(...values); send(level, values); };
        }
        addEventListener("error", (event) => send("error", [event.error?.message ?? event.message]));
        addEventListener("unhandledrejection", (event) => send("error", [event.reason?.message ?? String(event.reason)]));
        addEventListener("message", (event) =>
        {
            if (event.source === parent && (event.data?.playgroundTheme === "light" || event.data?.playgroundTheme === "dark"))
            {
                document.documentElement.setAttribute("data-theme", event.data.playgroundTheme);
            }
        });`;
    return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${new URL("fonts.css", document.baseURI).href}">
<link rel="stylesheet" href="${new URL("preview.css", document.baseURI).href}">
<style>body { padding: 24px; }</style>
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
    const frame = /** @type {HTMLIFrameElement} */ (host.querySelector("iframe"));
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
    if (named !== null && named in examples)
    {
        select.value = named;
    }
    const code = signal(examples[select.value] ?? editor.value);
    const ran = signal(code.get());
    editor.value = code.get();
    let stopped = false;

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
            if (hint !== null)
            {
                hint.textContent = stale.get() ? "Changes not run yet: press Run or Ctrl+Enter." : idle;
            }
        });
    });

    function run()
    {
        output.replaceChildren();
        ran.set(code.get());
        const theme = siteTheme();
        frame.style.colorScheme = theme;
        frame.srcdoc = frameDocument(code.get(), imports, theme);
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

    editor.addEventListener("input", () => code.set(editor.value));
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

    select.addEventListener("change", () =>
    {
        load(examples[select.value] ?? "");
        history.replaceState(history.state, "", `#example=${select.value}`);
    });

    runButton?.addEventListener("click", run);
    host.querySelector("[data-action=\"reset\"]")?.addEventListener("click", () =>
    {
        load(examples[select.value] ?? "");
        history.replaceState(history.state, "", location.pathname);
    });

    const share = host.querySelector("[data-action=\"share\"]");
    share?.addEventListener("click", async () =>
    {
        const link = new URL(location.href);
        link.hash = `code=${await pack(code.get())}`;
        history.replaceState(history.state, "", link.hash);
        try
        {
            await navigator.clipboard.writeText(link.href);
        }
        catch
        {
            return;
        }
        share.setAttribute("data-copied", "");
        setTimeout(() => share.removeAttribute("data-copied"), 1500);
    });

    /** @param {MessageEvent} event */
    const onMessage = (event) =>
    {
        if (event.source !== frame.contentWindow || typeof event.data !== "object" || event.data === null || event.data.playground !== true)
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
            if (!stopped)
            {
                load(shared ?? code.get());
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
    };
}
