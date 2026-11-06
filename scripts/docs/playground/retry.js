/*
 * Retry and timeout: a resource that gives a flaky service three tries.
 * The stand-in below fails the same way on every request: the first
 * call gets a 503, the second no answer at all, which the timeout ends,
 * and the third goes through to this site. Through the retries the
 * resource stays pending, the wait before each retry doubles, and
 * attempt counts the runs.
 *
 * Try: watch the attempts climb, and the console for when each call
 * went out, then press Reload. Set RETRIES to 1 and press Run: the
 * timeout is then the last failure, so the error shows. Set STATUS to
 * 404, and retryIf gives up at once, since asking again will not find
 * a record that is missing.
 */
import {
    ZerolithError, computed, css, html, render, resource, when
} from "zerolith";

const RETRIES = 2;
const STATUS = 503;
const OUTCOMES = [`gets a ${STATUS}`, "gets no answer", "goes through"];

/** A response outside 2xx, as an error that keeps its status. */
class HttpError extends Error
{
    constructor(status)
    {
        super(`The service answered ${status}.`);
        this.status = status;
    }
}

let calls = 0;

/**
 * A stand-in for fetch over a flaky link, which fails the same way on
 * every request: of every three calls, the first is answered with
 * STATUS and the second not at all until it is aborted, while the third
 * goes through.
 */
function flakyFetch(url, { signal })
{
    const turn = calls % 3;
    calls += 1;
    const time = (performance.now() / 1000).toFixed(1);
    console.log(`${time} s: call ${calls} ${OUTCOMES[turn]}`);
    if (turn === 2)
    {
        return fetch(url, { signal });
    }
    return new Promise((resolve, reject) =>
    {
        signal.addEventListener("abort", () => reject(signal.reason));
        if (turn === 0)
        {
            const answer = new Response(null, { status: STATUS });
            setTimeout(() => resolve(answer), 200);
        }
    });
}

const city = resource({
    params: () => "lisbon",
    loader: async ({ params, abort }) =>
    {
        const response = await flakyFetch(`cities/${params}.json`, {
            signal: abort
        });
        if (!response.ok)
        {
            throw new HttpError(response.status);
        }
        return response.json();
    },
    timeout: 1000,
    retry: RETRIES,
    backoff: 500,
    retryIf: (error) => !(error instanceof HttpError) || error.status >= 500
});

const failed = computed(() => city.status.get() === "error");
const runs = computed(() => `${city.attempt.get()} of ${RETRIES + 1}`);
const place = computed(() =>
{
    const value = city.get();
    return value === undefined ? "Waiting" : `${value.name}, ${value.country}`;
});
const reason = computed(() =>
{
    const error = city.error.get();
    if (error instanceof ZerolithError
        && error.diagnostic.code === "resource_timed_out")
    {
        return "The service did not answer within a second.";
    }
    return error?.message ?? "";
});

const panel = css`
    :scope {
        display: grid;
        gap: 16px;
        max-width: 480px;
        padding: clamp(20px, 5vw, 32px);
        border: 2px solid var(--line);
        background: var(--surface);
    }
    .label, .status {
        margin: 0;
        color: var(--muted);
        font: 12px var(--font-mono);
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }
    .runs {
        margin: 0;
        font: 600 clamp(44px, 12vw, 72px)/1 var(--font-display);
        letter-spacing: -0.04em;
    }
    .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 0;
    }
    .place { margin: 0; font-size: 20px; }
    .place[aria-busy="true"] { color: var(--muted); }
    [role="alert"] { color: var(--danger); }
`;

/** Starts a new request, with the stand-in back at its first call. */
function reload()
{
    calls = 0;
    city.reload();
}

function Failure()
{
    return html`
        <p class="row" role="alert">${reason}
            <button @click=${reload}>Try again</button>
        </p>`;
}

function Place()
{
    return html`
        <div class="row">
            <p class="place" aria-busy=${city.pending}>${place}</p>
            <button @click=${reload}>Reload</button>
        </div>`;
}

render(html`
    <section class=${panel}>
        <p class="label">Attempt</p>
        <p class="runs">${runs}</p>
        <progress max=${RETRIES + 1} value=${city.attempt}></progress>
        ${when(failed, Failure, Place)}
        <p class="status">status: ${city.status}</p>
    </section>`, "#app");
