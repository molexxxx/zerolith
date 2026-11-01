/*
 * Async data: a resource loads from a signal and loads again when the
 * signal changes, aborting the request it replaces. Its status, its
 * error, and its last value are signals too, and the last value stays
 * on screen, dimmed, while the next one loads.
 *
 * Try: pick another city, then Atlantis, which fails, and Try again.
 */
import { computed, css, html, render, resource, signal, when } from "zerolith";

/** A stand-in for fetch: the preview has no backend, so this waits. */
function fetchWeather(city, abort)
{
    return new Promise((resolve, reject) =>
    {
        const timer = setTimeout(() =>
        {
            if (city === "Atlantis")
            {
                reject(new Error("No station in Atlantis."));
            }
            else
            {
                resolve({ city, celsius: 12 + city.length });
            }
        }, 600);
        abort.addEventListener("abort", () => clearTimeout(timer));
    });
}

const city = signal("Lisbon");
const weather = resource({
    params: () => city.get(),
    loader: ({ params, abort }) => fetchWeather(params, abort)
});

const loading = computed(() => weather.status.get() === "pending");
const failed = computed(() => weather.status.get() === "error");
const reason = computed(() => weather.error.get()?.message ?? "");
const report = computed(() =>
{
    const value = weather.get();
    return value === undefined ? "" : `${value.city} ${value.celsius} °C`;
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
    .reading {
        min-height: 1.1em;
        margin: 0;
        font: 600 40px/1.1 var(--font-display);
        letter-spacing: -0.03em;
    }
    .reading[aria-busy="true"] { opacity: 0.4; }
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

function Report()
{
    return html`<p class="reading" aria-busy=${loading}>${report}</p>`;
}

function Failure()
{
    return html`
        <p role="alert">${reason}
            <button @click=${() => weather.reload()}>Try again</button>
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
                <option>Atlantis</option>
            </select>
        </label>
        ${when(failed, Failure, Report)}
        <p class="status">status: ${weather.status}</p>
    </section>`, "#app");
