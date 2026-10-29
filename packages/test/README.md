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

The guide is `docs/guide/testing.md` in the repository.

Status: pre-alpha, nothing published.

## License

Apache-2.0. See `LICENSE`.
