/*
 * Async data: a resource fetches a city from this site and fetches again
 * when the selected city changes, aborting the request it replaces. Its
 * status, its error, and its last value are signals too, and the last
 * value stays on screen, dimmed, while the next one loads.
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

const loading = computed(() => record.status.get() === "pending");
const failed = computed(() => record.status.get() === "error");
const reason = computed(() => record.error.get()?.message ?? "");
const place = computed(() => record.get()?.name ?? "");
const details = computed(() =>
{
    const value = record.get();
    return value === undefined ? "" : `${value.country}, ${value.timeZone}`;
});

const panel = css`
    :scope {
        display: grid;
        gap: 20px;
        max-width: 400px;
        padding: clamp(20px, 5vw, 32px);
        border: 2px solid var(--line);
        background: var(--surface);
    }
    label { display: grid; gap: 8px; justify-items: start; }
    label span {
        color: var(--muted);
        font: 12px var(--font-mono);
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }
    .record { min-height: 4.5em; }
    .record[aria-busy="true"] { opacity: 0.4; }
    .place {
        margin: 0;
        font: 600 40px/1.1 var(--font-display);
        letter-spacing: -0.03em;
    }
    .details { margin: 8px 0 0; color: var(--muted); }
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
        <div class="record" aria-busy=${loading}>
            <p class="place">${place}</p>
            <p class="details">${details}</p>
        </div>`;
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
