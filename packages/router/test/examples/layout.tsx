import { type View, computed } from "zerolith";
import { router } from "./router.ts";

/** A link that marks itself while its page is shown. */
function NavLink({ href, label }: { href: string; label: string }): View
{
    const here = router.matches(href, { exact: true });
    return <a href={href} aria-current={computed(() => (here.get() ? "page" : undefined))}>{label}</a>;
}

/** The frame around every page: the navigation and the current page. */
export function Layout({ content }: { content: View }): View
{
    return (
        <>
            <nav>
                <NavLink href={router.href("home")} label="Releases" />
                <NavLink href={router.href("settings")} label="Settings" />
            </nav>
            <main>{content}</main>
        </>
    );
}
