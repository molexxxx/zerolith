/**
 * @zerolith/router/server: the server side of routing, kept out of the
 * browser entry so an import map never has to resolve the server renderer.
 */
import { escapeAttribute, escapeText } from "zerolith/ssr";
import type { Head } from "./router.js";

/** Renders head metadata as the `<title>` and `<meta name="description">` elements of a server-rendered document. */
export function renderHead(head: Head): string
{
    const parts: string[] = [];
    if (head.title !== undefined)
    {
        parts.push(`<title>${escapeText(head.title)}</title>`);
    }
    if (head.description !== undefined)
    {
        parts.push(`<meta name="description" content="${escapeAttribute(head.description)}">`);
    }
    return parts.join("");
}
