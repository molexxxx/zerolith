/**
 * Runs in the head before the page paints: marks the page as scripted, so
 * the controls that need JavaScript show, applies the theme the reader chose
 * last time, so a light page never flashes dark first, and starts decoding
 * the fonts the stylesheet holds, which a browser otherwise leaves until
 * layout first asks for each one, so they are ready for the first frame.
 */
function stored()
{
    try
    {
        return localStorage.getItem("zerolith-docs-theme");
    }
    catch
    {
        return null;
    }
}

const theme = stored();
document.documentElement.classList.add("js");
if (theme === "light" || theme === "dark")
{
    document.documentElement.setAttribute("data-theme", theme);
}
for (const font of document.fonts)
{
    font.load().catch(() => undefined);
}
