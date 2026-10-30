/**
 * Runs in the head before the page paints: marks the page as scripted, so
 * the controls that need JavaScript show, and applies the theme the reader
 * chose last time, so a light page never flashes dark first.
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
