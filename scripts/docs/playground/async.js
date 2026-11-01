/*
 * Async data: a resource loads from a signal and loads again when the
 * signal changes, aborting the request it replaces. Its status, its
 * error, and its last value are signals too, and the last value stays
 * on screen while the next one loads.
 *
 * Try: pick another city, then Atlantis, which fails, and Try again.
 */
import { computed, html, render, resource, signal, when } from "zerolith";

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
    return value === undefined ? "" : `${value.city}: ${value.celsius} °C`;
});

function Report()
{
    return html`<p>${report}</p>`;
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
    <label>City
        <select @change=${choose}>
            <option>Lisbon</option>
            <option>Reykjavik</option>
            <option>Atlantis</option>
        </select>
    </label>
    ${when(loading, () => html`<p>Loading…</p>`)}
    ${when(failed, Failure, Report)}`, "#app");
