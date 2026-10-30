// The live-reload client the dev server injects into HTML pages. A changed
// stylesheet, linked or imported from a module, is swapped in place; any
// other change reloads the page after saving the values of named signals,
// which the development build of zerolith restores on the next load.
const STORAGE_KEY = "zerolith:restore";
const source = new EventSource("/__zerolith/client.js".replace("client.js", "events"));
let timer = 0;

source.addEventListener("change", (event) =>
{
    const { path } = JSON.parse(event.data);
    if (path.endsWith(".css") && swapStylesheet(path))
    {
        return;
    }
    clearTimeout(timer);
    timer = setTimeout(reload, 60);
});

function swapStylesheet(path)
{
    let swapped = false;
    for (const link of document.querySelectorAll("link[rel='stylesheet']"))
    {
        const url = new URL(link.href, location.href);
        if (url.origin === location.origin && url.pathname === path)
        {
            url.searchParams.set("t", String(Date.now()));
            link.href = url.href;
            swapped = true;
        }
    }
    for (const style of document.querySelectorAll("style[data-zerolith-css]"))
    {
        if (style.dataset.zerolithCss === path)
        {
            import(`${path}?import&t=${Date.now()}`);
            swapped = true;
        }
    }
    return swapped;
}

function reload()
{
    const hook = globalThis.__ZEROLITH_DEVTOOLS__;
    if (hook !== undefined)
    {
        const state = {};
        for (const node of hook.nodes())
        {
            if (node.kind === "state" && node.name !== undefined && !node.internal)
            {
                try
                {
                    JSON.stringify(node.value);
                    state[node.name] = node.value;
                }
                catch
                {
                    // Values that cannot be serialized start fresh after the reload.
                }
            }
        }
        try
        {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }
        catch
        {
            // Without storage the page still reloads; state starts fresh.
        }
    }
    location.reload();
}
