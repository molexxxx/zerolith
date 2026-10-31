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

- `mount` renders a view into a container attached to the document and remembers it; `cleanup` disposes everything mounted, in reverse order.
- `settle` waits for the promises a test started, such as resources and lazy routes; effects themselves run synchronously.
- `hydrationMismatches` renders a view with the server renderer, hydrates the same view over that markup, and returns every disagreement, so a component that cannot hydrate fails its test.
- `accessibilityIssues` finds the defects a test can catch without a browser engine's accessibility tree: images without alternative text, controls without a label, buttons and links without a name, frames without a title.

The guide is on the [docs site](https://molexxxx.github.io/zerolith/guide/testing/).

Status: alpha. Install with `npm install --save-dev @zerolith/test@alpha`; the API may change before 1.0.

## Documentation

- The [testing guide](https://molexxxx.github.io/zerolith/guide/testing/) explains it with examples that run as tests.
- The [reference](https://molexxxx.github.io/zerolith/reference/zerolith-test/) lists every export, generated from the source.
- New to zerolith? The [tutorial](https://molexxxx.github.io/zerolith/learn/) builds an app step by step, and the [playground](https://molexxxx.github.io/zerolith/playground/) runs code in the browser.

## License

Apache-2.0. See `LICENSE`.
