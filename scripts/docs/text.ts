/**
 * Plain text from the docs build's own rendered markup, for the table of
 * contents and heading ids.
 */

const ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: "\"", "#39": "'" };

/**
 * The markup with every tag removed, and with any `<` an unfinished tag
 * leaves behind, since a `<` in the text reaches the markup escaped as
 * `&lt;`. No tag can be left or formed.
 */
export function stripTags(markup: string): string
{
    return markup.replace(/<[^>]*>/g, "").replaceAll("<", "");
}

/** A heading's text as a reader sees it: its tags removed and the entities the renderer writes decoded in one pass, so `&amp;lt;` reads `&lt;`. */
export function headingText(markup: string): string
{
    return stripTags(markup).replace(/&(amp|lt|gt|quot|#39);/g, (_match, name: string) => ENTITIES[name] ?? "");
}
