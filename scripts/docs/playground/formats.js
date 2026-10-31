import { computed, html, render, signal } from "zerolith";
import { createLocale, formatters } from "@zerolith/i18n";

const languages = ["en", "de", "ja", "ar"];
const locale = createLocale({ supported: languages, initial: "en" });
const format = formatters(locale.locale);
const amount = signal(1234.5);
const departure = new Date(Date.UTC(2026, 9, 28, 9, 30));

const price = computed(() => format.number(amount.get(), { style: "currency", currency: "EUR" }));
const day = computed(() => format.date(departure, { dateStyle: "long" }));

render(html`
    <p dir=${locale.direction}>${price}, ${day}</p>
    <div role="group" aria-label="Language">
        ${languages.map((code) => html`
            <button aria-pressed=${computed(() => locale.locale.get() === code)} @click=${() => locale.set(code)}>${code}</button>`)}
    </div>
    <label>Amount <input type="number" .value=${computed(() => String(amount.get()))} @input=${(event) => amount.set(Number(event.target.value))}></label>`, "#app");
