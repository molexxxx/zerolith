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

The guide is `docs/guide/forms.md` in the repository.

Status: pre-alpha, nothing published.

## License

Apache-2.0. See `LICENSE`.
