<!-- Generated from docs/guide/testing.md by npm run skills. Edit the guide, then regenerate. -->

# Testing

zerolith views are plain functions that return templates, so most of a test is ordinary DOM work: render, click, read. `@zerolith/test` covers the parts worth not rewriting in every project. It depends only on `zerolith` and works in any runner that provides a DOM; the examples use Vitest's browser mode, which the starter and this repository run.

## Setting up

The starter runs its tests with Vitest in headless Chromium, through Playwright. This is the `vitest.config.ts` that `zerolith new my-app` writes:

```ts
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { zerolith } from "@zerolith/vite";

// Vitest reads the components itself, so it takes the zerolith plugin for
// JSX and stylesheets imported with ?scoped, without hot replacement.
export default defineConfig({
    plugins: zerolith({ hot: false }),
    test: {
        browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }]
        }
    }
});
```

Vitest reads each module through Vite, not through `zerolith dev`, so the plugin from `@zerolith/vite` gives it what the command line gives the browser: JSX lowered to `html` calls, and a stylesheet imported with `?scoped` turned into the styles a component binds. `hot: false` leaves out hot module replacement, which belongs to a page in development, not to a test. `npm test` runs the tests in `test/`, after `npx playwright install chromium` has run once, and `npm run check` runs the type check, the linter, the tests, and the build.

> [!NOTE]
> In the browser, Vitest runs a component's stylesheets as the page would. A test that runs in Node instead, such as a test of server rendering, gets an empty stylesheet for every CSS import unless the config sets `test.css` to `true`, so its `?scoped` rules are empty while the scope classes stay the same.

| Helper | What it does |
| --- | --- |
| `mount(view)` | Renders the view, or what a function returns, into a new container in the document, and returns its `container`, its `root`, and `unmount()` |
| `cleanup()` | Unmounts everything `mount` created, newest first; register it with `afterEach` |
| `settle()` | Waits for the asynchronous work a test started |
| `hydrationMismatches(() => view)` | Renders the view on the server, hydrates a second copy over that markup, and returns every disagreement; each pass runs inside its own owner, disposed before it returns |
| `accessibilityIssues(container)` | Returns the accessibility defects a test can see |

## Mount and interact

`mount` renders a view into a container attached to the document and remembers it; `cleanup`, registered as the after-each hook, disposes every mount in reverse order. Effects run synchronously when a signal changes, so a click shows its result at once; `settle` is for the promises a test started, such as resources and lazy routes, and anything scheduled with a timer of zero.

```ts
import { afterEach, expect, it } from "vitest";
import { cleanup, mount, settle } from "@zerolith/test";
import { Counter } from "./counter.ts";

afterEach(cleanup);

it("counts clicks", async () =>
{
    const { container } = mount(Counter());
    container.querySelector("button")?.click();
    await settle();
    expect(container.textContent).toBe("Clicked 1 times");
});
```

The container is a normal element: query it, dispatch events on it, or hand it to the runner's locator API.

> [!TIP]
> A component that registers cleanups with `onDispose`, such as a page that starts a timer, needs an owner while it runs. Pass a function, as `mount(() => Dashboard())`: `mount` hands it to `render`, which calls it inside the root's owner, and the cleanups run when the test unmounts it. Called directly, as `mount(Dashboard())`, the component runs before any owner exists and fails with `on_dispose_outside_scope`.

`mount` takes two options:

| Option | What it does |
| --- | --- |
| `container` | Renders into this element instead of a new `div` |
| `attach: false` | Keeps the new container out of the document; layout and focus need it attached, so the default is to attach it |

> [!TIP]
> Code that runs on the server, such as a form handler, needs no DOM at all: test it in Node by calling it with a `Request`, as the [forms guide's server example](forms.md#the-server) does.

## Hydration and accessibility

`hydrationMismatches` renders a view with the server renderer, hydrates a second instance over that markup, and returns every disagreement, so a component that would be rendered again on the client instead of adopted fails its test here rather than in production. `accessibilityIssues` finds the defects that need no accessibility tree to detect:

```ts
import { expect, it } from "vitest";
import {
    accessibilityIssues, hydrationMismatches, mount
} from "@zerolith/test";
import { Counter } from "./counter.ts";

it("hydrates in place and has no accessibility defects", () =>
{
    const { container } = mount(Counter());
    expect(hydrationMismatches(() => Counter())).toEqual([]);
    expect(accessibilityIssues(container)).toEqual([]);
});
```

Each issue carries a stable code and the element, so a test can assert on exactly what it expects or fail on any issue at all:

| Code | Found when |
| --- | --- |
| `image_without_alt` | An `<img>` has no `alt` attribute |
| `control_without_label` | An input, select, or textarea has no `<label>`, `aria-label`, `aria-labelledby`, or `title` |
| `button_without_name` | A button has no text, `aria-label`, `aria-labelledby`, `title`, or image with `alt`, and an input button no value |
| `link_without_name` | A link with an `href` has no name, by the same rules as a button |
| `frame_without_title` | An `<iframe>` has no `title` |

> [!NOTE]
> These are the defects the WebAIM Million finds on most home pages, and they are a floor rather than a conformance check. A full audit still needs an engine such as axe.
