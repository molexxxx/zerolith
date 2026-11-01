/*
 * Formatting: money, dates, relative times, and lists that follow a
 * locale signal, through the browser's own Intl data. The currency
 * belongs to the amount, so it is chosen apart from the locale: a price
 * in yen stays in yen, and the locale only decides how it is written.
 *
 * Try: switch the locale, then the currency. Note that yen has no cents
 * and that ar-EG writes right to left.
 */
import { computed, html, render, signal } from "zerolith";
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

function Row({ label, value })
{
    return html`<tr><th scope="row">${label}</th><td>${value}</td></tr>`;
}

/** A row of buttons, one pressed: the value `current` holds. */
function Choice({ label, options, current, choose })
{
    return html`
        <div role="group" aria-label=${label}>
            ${options.map((option) => html`
                <button aria-pressed=${computed(() => current.get() === option)}
                    @click=${() => choose(option)}>${option}</button>`)}
        </div>`;
}

const type = (event) => amount.set(Number(event.target.value));

render(html`
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
    <label>Amount
        <input type="number" step="0.01" .value=${amount} @input=${type}>
    </label>`, "#app");
