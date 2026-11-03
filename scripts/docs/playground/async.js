/*
 * Async data: a resource fetches a city's record from this site and
 * fetches again when the selected city changes, aborting the request it
 * replaces. Its status, its error, and its last value are signals too, so
 * the card dims while the next city loads, and every fact is a computed
 * value of the record, formatted for your locale. The clock is a signal
 * of its own, so only the local time changes each second.
 *
 * Try: pick another city, then Atlantis, which the site has no record of,
 * and Try again. To watch the loading state, slow the network down in
 * your browser's developer tools.
 */
import { computed, css, html, render, resource, signal, when } from "zerolith";

/** Fetches a city's record, a JSON file the site serves beside this page. */
async function fetchCity(name, abort)
{
    const url = `cities/${name.toLowerCase()}.json`;
    const response = await fetch(url, { signal: abort });
    if (!response.ok)
    {
        throw new Error(`No record of ${name} (HTTP ${response.status}).`);
    }
    return response.json();
}

const city = signal("Lisbon");
const record = resource({
    params: () => city.get(),
    loader: ({ params, abort }) => fetchCity(params, abort)
});

const now = signal(Date.now());
setInterval(() => now.set(Date.now()), 1000);

const loading = computed(() => record.status.get() === "pending");
const failed = computed(() => record.status.get() === "error");
const reason = computed(() => record.error.get()?.message ?? "");

const numbers = new Intl.NumberFormat();
const currencies = new Intl.DisplayNames(undefined, { type: "currency" });
const languages = new Intl.DisplayNames(undefined, { type: "language" });
const lists = new Intl.ListFormat();

/** A text computed from the record, empty until one has loaded. */
function fact(format)
{
    return computed(() =>
    {
        const value = record.get();
        return value === undefined ? "" : format(value);
    });
}

/** A latitude or longitude in degrees, with its hemisphere. */
function degrees(value, positive, negative)
{
    const side = value < 0 ? negative : positive;
    return `${Math.abs(value).toFixed(2)}° ${side}`;
}

const place = fact((value) => value.name);
const country = fact((value) => value.country);
const zone = fact((value) => value.timeZone.replaceAll("_", " "));
const population = fact((value) =>
    `${numbers.format(value.population)} (${value.populationYear})`);
const area = fact((value) => `${numbers.format(value.area)} km²`);
const density = fact((value) =>
    `${numbers.format(Math.round(value.population / value.area))} per km²`);
const position = fact((value) => [
    degrees(value.latitude, "N", "S"),
    degrees(value.longitude, "E", "W")
].join(", "));
const money = fact((value) =>
    `${currencies.of(value.currency)} (${value.currency})`);
const speech = fact((value) =>
    lists.format(value.languages.map((code) => languages.of(code))));
const dialing = fact((value) => value.callingCode);
const source = fact((value) => `Source: ${value.source}`);

const clock = computed(() =>
{
    const value = record.get();
    return value === undefined ? undefined : new Intl.DateTimeFormat(
        undefined, { timeStyle: "medium", timeZone: value.timeZone });
});
const time = computed(() => clock.get()?.format(now.get()) ?? "");

const panel = css`
    :scope {
        display: grid;
        gap: 20px;
        max-width: 560px;
        padding: clamp(20px, 5vw, 32px);
        border: 2px solid var(--line);
        background: var(--surface);
    }
    label { display: grid; gap: 8px; justify-items: start; }
    label span, dt {
        color: var(--muted);
        font: 12px var(--font-mono);
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }
    .record[aria-busy="true"] { opacity: 0.4; }
    .place {
        margin: 0;
        font: 600 40px/1.1 var(--font-display);
        letter-spacing: -0.03em;
    }
    .country { margin: 4px 0 0; color: var(--muted); }
    dl {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 16px 24px;
        margin: 20px 0 0;
        padding-top: 20px;
        border-top: 2px solid var(--line);
    }
    dd { margin: 4px 0 0; font-variant-numeric: tabular-nums; }
    .source { margin: 20px 0 0; color: var(--muted); font-size: 12px; }
    .status { margin: 0; color: var(--muted); font-family: var(--font-mono); }
    [role="alert"] {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
        margin: 0;
        color: var(--danger);
    }
`;

function Record()
{
    return html`
        <article class="record" aria-busy=${loading}>
            <h2 class="place">${place}</h2>
            <p class="country">${country}</p>
            <dl>
                <div><dt>Local time</dt><dd>${time}</dd></div>
                <div><dt>Time zone</dt><dd>${zone}</dd></div>
                <div><dt>Population</dt><dd>${population}</dd></div>
                <div><dt>Area</dt><dd>${area}</dd></div>
                <div><dt>Density</dt><dd>${density}</dd></div>
                <div><dt>Coordinates</dt><dd>${position}</dd></div>
                <div><dt>Currency</dt><dd>${money}</dd></div>
                <div><dt>Languages</dt><dd>${speech}</dd></div>
                <div><dt>Calling code</dt><dd>${dialing}</dd></div>
            </dl>
            <p class="source">${source}</p>
        </article>`;
}

function Failure()
{
    return html`
        <p role="alert">${reason}
            <button @click=${() => record.reload()}>Try again</button>
        </p>`;
}

const choose = (event) => city.set(event.target.value);

render(html`
    <section class=${panel}>
        <label>
            <span>City</span>
            <select @change=${choose}>
                <option>Lisbon</option>
                <option>Reykjavik</option>
                <option>Nairobi</option>
                <option>Atlantis</option>
            </select>
        </label>
        ${when(failed, Failure, Record)}
        <p class="status">status: ${record.status}</p>
    </section>`, "#app");
