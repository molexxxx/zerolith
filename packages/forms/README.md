# @zerolith/forms

Forms for zerolith applications. A form stays a native `<form>` that posts `FormData` to its action and works with JavaScript disabled; `createForm` enhances it when JavaScript runs: the submission goes through `fetch` with the form's own method, action, and encoding, pending state and the outcome are signals, and a failure arrives as an RFC 9457 problem details document whose `fields` map carries the messages for each input.

```ts
import { html } from "zerolith";
import { createForm } from "@zerolith/forms";

const form = createForm({ onSuccess: () => router.navigate("/notes") });

html`<form method="post" action="/notes" @submit=${form.submit}>
    <input name="title" aria-invalid=${form.field("title").invalid}>
    <output>${form.field("title").error}</output>
    <button ?disabled=${form.pending}>Save</button>
</form>`;
```

Validation is written once as a Standard Schema and runs on both sides: `validateForm` turns the schema's issues into the same problem document the server returns, and `problemResponse` writes that document as a WinterTC `Response`, so the no-JavaScript path and the enhanced path share one handler and one wire shape. Any backend that can answer with `application/problem+json` fits.

The guide is on the [docs site](https://zerolith.dev/guide/forms/).

Install with `npm install @zerolith/forms`. The API is frozen at 1.0 and supported for 24 months under the [support policy](https://github.com/molexxxx/zerolith/blob/main/docs/policy/support.md).

## Documentation

- The [forms guide](https://zerolith.dev/guide/forms/) explains it with examples that run as tests.
- The [reference](https://zerolith.dev/reference/zerolith-forms/) lists every export, generated from the source.
- New to zerolith? The [tutorial](https://zerolith.dev/learn/) builds an app step by step, and the [playground](https://zerolith.dev/playground/) runs code in the browser.

## License

Apache-2.0. See `LICENSE`.
