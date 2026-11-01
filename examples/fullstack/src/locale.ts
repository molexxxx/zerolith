// Dates and numbers in the reader's own format. The interface is English;
// the format follows the browser's languages until the reader picks another
// in the header, and every formatted value follows the choice at once.
import { createLocale, formatters } from "@zerolith/i18n";

/** The formats on offer, negotiated against the browser's languages. */
export const locale = createLocale({ supported: ["en-US", "de-DE", "ja-JP"], initial: navigator.languages });

/** Formatters that read the locale signal, so what they format updates with it. */
export const format = formatters(locale.locale);

const units: [Intl.RelativeTimeFormatUnit, number][] = [["day", 86_400], ["hour", 3_600], ["minute", 60], ["second", 1]];

/** How long ago a moment was, as "5 minutes ago" or "yesterday", measured from `now`. */
export function ago(at: string, now: number): string
{
    const seconds = (Date.parse(at) - now) / 1000;
    const [unit, size] = units.find(([, length]) => Math.abs(seconds) >= length) ?? ["second", 1];
    return format.relative(Math.round(seconds / size), unit, { numeric: "auto" });
}

/** A due date relative to today, as "tomorrow" or "in 3 days", and whether it has passed. */
export function due(date: string, today: Date = new Date()): { label: string; late: boolean }
{
    const days = Math.round((Date.parse(date) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000);
    return { label: format.relative(days, "day", { numeric: "auto" }), late: days < 0 };
}
