/*
 * Formatting: money, dates, relative times, and lists that follow a
 * locale signal, through the browser's own Intl data. The currency
 * belongs to the amount, so it is chosen apart from the locale: a price
 * in yen stays in yen, and the locale only decides how it is written.
 *
 * Try: switch the locale, then the currency. Note that yen has no cents
 * and that ar-EG writes right to left.
 */
import { computed, css, html, render, signal } from "zerolith";
import { createLocale, formatters } from "@zerolith/i18n";

const locales = ["en-US", "de-DE", "ja-JP", "ar-EG"];
const currencies = ["EUR", "USD", "JPY"];
const locale = createLocale({ supported: locales, initial: "en-US" });
const format = formatters(locale.locale);
const currency = signal("EUR");
const amount = signal(1234.5);
const departure = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

const price = computed(() => format.number(amount.get(), {
    style: "currency",
    currency: currency.get()
}));
const date = computed(() => format.date(departure, { dateStyle: "full" }));
const soon = computed(() => format.relative(3, "day", { numeric: "auto" }));
const bags = computed(() => format.list(["Passport", "Charger", "Jacket"]));

const panel = css`
    :scope {
        display: grid;
        gap: 24px;
        max-width: 520px;
        padding: clamp(20px, 5vw, 32px);
        border: 2px solid var(--line);
        background: var(--surface);
    }
    table { border-collapse: collapse; border-top: 2px solid var(--line); }
    th, td {
        padding: 12px 0;
        border-bottom: 2px solid var(--line);
        vertical-align: baseline;
    }
    th, .label {
        color: var(--muted);
        font-family: var(--font-mono);
        font-size: 12px;
        font-weight: 400;
        letter-spacing: 0.06em;
        text-align: start;
        text-transform: uppercase;
    }
    th { width: 112px; padding-inline-end: 16px; }
    td { font-variant-numeric: tabular-nums; }
    fieldset { display: flex; flex-wrap: wrap; padding: 0; border: 0; }
    legend { margin-bottom: 8px; padding: 0; }
    fieldset button { padding: 0 12px; }
    fieldset button + button { margin-inline-start: -2px; }
    label { display: grid; gap: 8px; justify-items: start; }
`;

function Row({ label, value })
{
    return html`<tr><th scope="row">${label}</th><td>${value}</td></tr>`;
}

/** A row of buttons, one pressed: the value `current` holds. */
function Choice({ label, options, current, choose })
{
    return html`
        <fieldset>
            <legend>${label}</legend>
            ${options.map((option) => html`
                <button type="button"
                    aria-pressed=${computed(() => current.get() === option)}
                    @click=${() => choose(option)}>${option}</button>`)}
        </fieldset>`;
}

const type = (event) => amount.set(Number(event.target.value));

render(html`
    <section class=${panel}>
        <table dir=${locale.direction}>
            ${Row({ label: "Price", value: price })}
            ${Row({ label: "Departure", value: date })}
            ${Row({ label: "In", value: soon })}
            ${Row({ label: "Packed", value: bags })}
        </table>
        ${Choice({
            label: "Locale",
            options: locales,
            current: locale.locale,
            choose: (tag) => locale.set(tag)
        })}
        ${Choice({
            label: "Currency",
            options: currencies,
            current: currency,
            choose: (code) => currency.set(code)
        })}
        <label>
            <span class="label">Amount</span>
            <input type="number" step="0.01" .value=${amount} @input=${type}>
        </label>
    </section>`, "#app");
