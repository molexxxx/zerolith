/*
 * Routes from @zerolith/router: a table of named paths, a parameter
 * in a path, a loader that runs before its page shows, links that
 * know when they lead to the page shown, and a page for no match.
 *
 * The preview runs in a sandboxed frame with no address of its own,
 * so this router is made with window: null and each link calls
 * router.navigate(). In an app, createRouter(routes) follows the
 * address bar, and plain links navigate with no handler at all.
 *
 * Try: open a planet and watch the console, which logs each
 * navigation as it starts and ends. Open one planet, then another
 * before the first has loaded: the first is canceled. Moons has no
 * route, so the fallback shows.
 */
import { computed, css, html, render, when } from "zerolith";
import { createRouter, defineRoutes, route } from "@zerolith/router";

const PLANETS = {
    mercury: { name: "Mercury", order: "first", moons: 0 },
    venus: { name: "Venus", order: "second", moons: 0 },
    earth: { name: "Earth", order: "third", moons: 1 },
    mars: { name: "Mars", order: "fourth", moons: 2 }
};

const moons = (count) => (count === 1 ? "one moon" : `${count} moons`);

/** Waits as a request would, and gives up when a newer navigation starts. */
function delay(ms, abort)
{
    return new Promise((resolve, reject) =>
    {
        const timer = setTimeout(resolve, ms);
        abort.addEventListener("abort", () =>
        {
            clearTimeout(timer);
            reject(abort.reason);
        }, { once: true });
    });
}

const routes = defineRoutes({
    home: route({
        path: "/",
        view: () => html`<p>Pick a planet.</p>`
    }),
    planet: route({
        path: "/planets/:id",
        load: async ({ params, abort }) =>
        {
            await delay(600, abort);
            return Object.hasOwn(PLANETS, params.id)
                ? PLANETS[params.id]
                : undefined;
        },
        view: ({ params, data }) => data === undefined
            ? html`<p>No planet is named ${params.id}.</p>`
            : html`
                <h2>${data.name}</h2>
                <p>The ${data.order} planet from the Sun, with
                    ${moons(data.moons)}.</p>`
    })
});

const router = createRouter(routes, {
    window: null,
    fallback: (url) => html`<p>Nothing is at ${url.pathname}.</p>`,
    observe: (event) => console.log(
        `${event.type} ${event.url.pathname}`
        + (event.name === undefined ? "" : `, route ${event.name}`))
});

const panel = css`
    :scope {
        display: grid;
        gap: 16px;
        max-width: 460px;
        padding: clamp(20px, 5vw, 32px);
        border: 2px solid var(--line);
        background: var(--surface);
    }
    nav { display: flex; flex-wrap: wrap; gap: 8px 16px; }
    a[aria-current="page"] { font-weight: 600; text-decoration: none; }
    .page { min-height: 96px; border-top: 2px solid var(--line); }
    h2 { margin: 16px 0 0; }
    .loading { margin: 0; color: var(--muted); font-family: var(--font-mono); }
`;

/** A link to a path: router.href() builds it, and matches() marks it. */
function Link(path, label)
{
    const here = router.matches(path, { exact: true });
    const current = computed(() => (here.get() ? "page" : null));
    const go = (event) =>
    {
        event.preventDefault();
        void router.navigate(path);
    };
    return html`
        <a href=${path} @click=${go} aria-current=${current}>${label}</a>`;
}

render(html`
    <section class=${panel}>
        <nav aria-label="Planets">
            ${Link(router.href("home"), "Home")}
            ${Object.keys(PLANETS).map((id) =>
                Link(router.href("planet", { id }), PLANETS[id].name))}
            ${Link("/moons", "Moons")}
        </nav>
        ${when(router.pending, () => html`<p class="loading">Loading...</p>`)}
        <div class="page">${router.outlet()}</div>
    </section>`, "#app");

/* A router with no window has no address to start from: open a page. */
void router.navigate("/");
