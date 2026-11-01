<!-- Generated from docs/guide/routing.md by npm run skills. Edit the guide, then regenerate. -->

# Routing

`@zerolith/router` is the router of a single-page application. Pages are components, the route table maps each path to one, and a layout component places the current page. Parameters come from the path strings, so `router.href("release", { tag })` fails to type-check on a misspelled route or a missing parameter.

The examples on this page are one small application, in the files a project from `zerolith new` keeps under `src/`: the route table, a component per page, the router, and the layout.

## The route table

`src/routes.ts` maps each path to the component that renders it, with an optional loader and the page's title:

```ts
import { defineRoutes, lazy, route } from "@zerolith/router";
import { Home } from "./components/home.tsx";
import { ReleasePage, loadRelease, releaseHead } from "./components/release.tsx";

export const routes = defineRoutes({
    home: route({ path: "/", view: Home, head: { title: "Releases" } }),
    release: route({ path: "/releases/:tag", load: loadRelease, view: ReleasePage, head: releaseHead }),
    settings: route({
        path: "/settings",
        view: lazy(() => import("./components/settings.tsx").then((module) => module.Settings)),
        head: { title: "Settings" }
    })
});
```

A route's `view` takes any function of the route's context, `{ params, data, url }`, so a page component is a view as it is, and a page small enough to write in place can be, as `view: () => <h1>About</h1>`. A route's `load` and lazy view resolve before the URL changes, and `router.pending` is true meanwhile. A view declared with `lazy()` loads as a chunk of its own the first time a reader opens it, and with `@zerolith/vite` a build that also imports it statically fails with [`lazy_module_not_split`](https://molexxxx.github.io/zerolith/e/lazy_module_not_split/) instead of quietly bundling it into the page.

## Pages are components

`src/components/release.tsx` is the release page. It receives the path's parameters and the loader's data as its props, typed by the route, and keeps its loader and its title beside it:

```tsx
import { type View, computed, signal, when } from "zerolith";
import type { Head, LoadContext, RouteContext } from "@zerolith/router";
import { type Release, findRelease } from "../releases.ts";

type Props = RouteContext<{ tag: string }, Release | undefined>;

/** Loads the release the path names; the page shows once it resolves. */
export function loadRelease({ params }: LoadContext<{ tag: string }>): Promise<Release | undefined>
{
    return findRelease(params.tag);
}

/** The page title, from the loaded release. */
export function releaseHead({ data }: Props): Head
{
    return { title: data?.name ?? "Unknown release" };
}

/** One release, with its notes behind a toggle. */
export function ReleasePage({ params, data }: Props): View
{
    if (data === undefined)
    {
        return <h1>No release named {params.tag}</h1>;
    }
    const open = signal(false);
    return (
        <article>
            <h1>{data.name}</h1>
            <button on:click={() => open.set(!open.get())}>
                {computed(() => (open.get() ? "Hide notes" : "Show notes"))}
            </button>
            {when(open, () => <Notes items={data.notes} />)}
        </article>
    );
}

function Notes({ items }: { items: readonly string[] }): View
{
    return <ul>{items.map((item) => <li>{item}</li>)}</ul>;
}
```

A page composes other components as any component does, as `ReleasePage` does with `Notes`. With html templates instead of JSX, a component is called as the function it is, `${Notes({ items: data.notes })}`; the [templates guide](templates.md) shows both spellings.

Every page renders inside an owner of its own, so its signals, effects, and `onDispose` cleanups end when the reader moves to another route. The settings page starts a clock and leaves stopping it to `onDispose`, and navigates from code when the reader is done:

```tsx
import { type View, onDispose, signal } from "zerolith";
import { router } from "../router.ts";

/** Loaded the first time a reader opens it. Its clock stops when the reader leaves. */
export function Settings(): View
{
    const time = signal(new Date().toLocaleTimeString());
    const clock = setInterval(() => time.set(new Date().toLocaleTimeString()), 1000);
    onDispose(() => clearInterval(clock));
    return (
        <section>
            <h1>Settings</h1>
            <p>Opened at {time}.</p>
            <button on:click={() => router.navigate(router.href("home"))}>Done</button>
        </section>
    );
}
```

## The layout

`src/router.ts` creates the router. It is a module of its own so components can import it for their links while the route table imports the components, and its fallback renders when no route matches:

```ts
import { createRouter } from "@zerolith/router";
import { NotFound } from "./components/not-found.tsx";
import { routes } from "./routes.ts";

export const router = createRouter(routes, {
    fallback: (url) => NotFound({ path: url.pathname })
});
```

`src/layout.tsx` places the current page, `router.outlet()`, under the navigation, and `router.matches()` tells each link whether its page is the one shown:

```tsx
import { type View, computed } from "zerolith";
import { router } from "./router.ts";

/** A link that marks itself while its page is shown. */
function NavLink({ href, label }: { href: string; label: string }): View
{
    const here = router.matches(href, { exact: true });
    return <a href={href} aria-current={computed(() => (here.get() ? "page" : undefined))}>{label}</a>;
}

/** The frame around every page: the navigation and the current page. */
export function Layout({ content }: { content: View }): View
{
    return (
        <>
            <nav>
                <NavLink href={router.href("home")} label="Releases" />
                <NavLink href={router.href("settings")} label="Settings" />
            </nav>
            <main>{content}</main>
        </>
    );
}
```

`src/main.tsx` waits for the first route and renders the layout:

```tsx
import { render } from "zerolith";
import { Layout } from "./layout.tsx";
import { router } from "./router.ts";

await router.ready;
render(<Layout content={router.outlet()} />, "#app");
```

## Links and navigation

Plain anchors navigate, as the links in the layout and the home page do. One delegated listener handles same-origin links clicked without modifier keys and leaves `download`, `target`, and `rel="external"` links, and any link with a modifier key, to the browser. Code navigates with `router.navigate`, as the settings page does.

Back and forward restore the scroll position, and so does a reload, since the router keeps each position in its history entry's state; a new navigation scrolls to the top or to the hash. A link to a hash on the page shown is left to the browser, and back and forward between the entries it adds move to the hash without loading the page again. Pass `scroll: false` to keep control of scrolling.

A navigation whose loader fails calls `onError` with the error and the URL; without `onError`, `navigate` rejects. A navigation that a newer one replaces before it commits is canceled rather than failed: its loader's `abort` signal fires, and `onError` is not called for it.

## Under a base path

An application served under a path, such as `/app/`, passes it as `base`; `import.meta.env.BASE_URL` carries the base `zerolith dev`, `zerolith build`, and Vite were given, so one line follows all of them:

```ts
const router = createRouter(routes, { base: import.meta.env.BASE_URL });
```

Route paths stay relative to the base: `"/notes/:id"` matches `/app/notes/7`, and `href("note", { id: "7" })` returns `/app/notes/7`. `navigate` and `matches` take a path with the base or without it, so `navigate("/notes/8")` and `navigate("/app/notes/8")` go to the same place. A URL outside the base renders the fallback, and a link outside it is left to the browser, so the rest of the site keeps working around the application. [Building and serving](deploying.md) covers setting the base for the build and the server.

## Head metadata

`head` sets the document title and description per route, as a static object, as the home route's is, or as a function of the parameters and loaded data, as `releaseHead` is.

The same metadata is `router.head`, a signal the server renders with `renderHead` from `@zerolith/router/server` (see [Server rendering](server-rendering.md)). `router.ready` settles once the initial navigation, loader included, has committed; await it before hydrating.
