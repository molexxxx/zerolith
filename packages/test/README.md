# @zerolith/test

Test helpers for zerolith applications, independent of the test runner.

```ts
import { afterEach, expect, it } from "vitest";
import { accessibilityIssues, cleanup, hydrationMismatches, mount, settle } from "@zerolith/test";

afterEach(cleanup);

it("renders and hydrates", async () =>
{
    const { container } = mount(Counter());
    container.querySelector("button")?.click();
    await settle();
    expect(container.textContent).toContain("1");
    expect(hydrationMismatches(() => Counter())).toEqual([]);
    expect(accessibilityIssues(container)).toEqual([]);
});
```

- `mount` renders a view into a container attached to the document and remembers it; given a function, as in `mount(() => Dashboard())`, it calls it inside an owner of its own, so a component that registers cleanups with `onDispose` mounts as it is. `cleanup` disposes everything mounted, in reverse order.
- `settle` waits for the promises a test started, such as resources and lazy routes; effects themselves run synchronously.
- `hydrationMismatches` renders a view with the server renderer, hydrates the same view over that markup, and returns every disagreement, so a component that cannot hydrate fails its test.
- `accessibilityIssues` finds the defects a test can catch without a browser engine's accessibility tree: images without alternative text, controls without a label, buttons and links without a name, frames without a title.

Under Vitest, which reads the components itself, add the plugin from `@zerolith/vite` as `zerolith({ hot: false })` so a test reads JSX and stylesheets imported with `?scoped` as the app does; a project from `zerolith new` has it in `vitest.config.ts`. The guide is on the [docs site](https://zerolith.dev/guide/testing/).

Install with `npm install --save-dev @zerolith/test`. The API is frozen at 1.0 and supported for 24 months under the [support policy](https://github.com/molexxxx/zerolith/blob/main/docs/policy/support.md).

## Documentation

- The [testing guide](https://zerolith.dev/guide/testing/) explains it with examples that run as tests.
- The [reference](https://zerolith.dev/reference/zerolith-test/) lists every export, generated from the source.
- New to zerolith? The [tutorial](https://zerolith.dev/learn/) builds an app step by step, and the [playground](https://zerolith.dev/playground/) runs code in the browser.

## License

Apache-2.0. See `LICENSE`.
