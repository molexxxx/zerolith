import { computed, html, render, resource, signal, when } from "zerolith";

// A stand-in for fetch: the preview has no backend, so this answers after a pause.
function fetchWeather(city, abort)
{
    return new Promise((resolve, reject) =>
    {
        const timer = setTimeout(() =>
        {
            if (city === "Atlantis")
            {
                reject(new Error("No station in Atlantis"));
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

const pending = computed(() => weather.status.get() === "pending");
const failed = computed(() => weather.status.get() === "error");
const summary = computed(() => `${weather.get()?.city ?? ""}: ${weather.get()?.celsius ?? ""} °C`);
const reason = computed(() => String(weather.error.get()?.message ?? ""));

render(html`
    <label>City
        <select @change=${(event) => city.set(event.target.value)}>
            <option>Lisbon</option>
            <option>Reykjavik</option>
            <option>Atlantis</option>
        </select>
    </label>
    ${when(pending, () => html`<p>Loading…</p>`)}
    ${when(failed, () => html`<p role="alert">${reason} <button @click=${() => weather.reload()}>Try again</button></p>`, () => html`<p>${summary}</p>`)}`, "#app");
