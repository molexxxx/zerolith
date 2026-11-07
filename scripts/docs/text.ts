/**
 * Plain text from the docs build's own rendered markup, for the table of
 * contents and heading ids.
 */

const ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: "\"", "#39": "'" };

/**
 * The markup with every tag removed, an unfinished tag at the end with it,
 * in one scan, so no tag can be left or formed; a `<` in the text reaches
 * the markup escaped as `&lt;`.
 */
export function stripTags(markup: string): string
{
    let text = "";
    let inTag = false;
    for (const character of markup)
    {
        if (inTag)
        {
            inTag = character !== ">";
        }
        else if (character === "<")
        {
            inTag = true;
        }
        else
        {
            text += character;
        }
    }
    return text;
}

/** A heading's text as a reader sees it: its tags removed and the entities the renderer writes decoded in one pass, so `&amp;lt;` reads `&lt;`. */
export function headingText(markup: string): string
{
    return stripTags(markup).replace(/&(amp|lt|gt|quot|#39);/g, (_match, name: string) => ENTITIES[name] ?? "");
}

/** Names as a sentence lists them: "A", "A and B", or "A, B, and C". */
export function listed(names: readonly string[]): string
{
    return names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

const counts = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const places = ["", "", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];

/** A count as running text writes it: a word up to twelve, digits past it. */
export function countWord(count: number): string
{
    return counts[count] ?? String(count);
}

/** A place in a ranking from the top, as a ranking sentence words it: "fastest", "second-fastest", and on. */
export function fastestWord(place: number): string
{
    return place === 1 ? "fastest" : `${places[place] ?? `number ${place}`}-fastest`;
}
