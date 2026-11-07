// Release dates, written the way the reader's browser language writes them.
import { formatters } from "@zerolith/i18n";

const format = formatters(navigator.language);

/**
 * A day such as "2026-10-20", as "October 20, 2026" in American English or
 * "20. Oktober 2026" in German.
 */
export function releaseDate(day: string): string
{
    return format.date(Date.parse(day), { dateStyle: "long", timeZone: "UTC" });
}
