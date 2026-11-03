<!-- Generated from docs/guide/forms.md by npm run skills. Edit the guide, then regenerate. -->

# Forms

A form in zerolith is a native `<form>` with a method and an action, and `@zerolith/forms` submits it with `fetch` so the page stays where it is. Keeping the form native pays twice: the browser's own behavior keeps working, from Enter submitting to a button's `formaction` and the autofill a real form gets, and a page the server renders has a form that works before its script loads. Validation is one schema that runs in the browser and on the server, and a failure travels as a problem details document whose `fields` mark the inputs.

> [!NOTE]
> This is the shape SvelteKit form actions, React Router actions, and Astro Actions converged on. The difference is that nothing here assumes a particular server: anything that reads `FormData` and answers JSON fits.

## The form

`createForm` returns the enhancer for one form. Bind its `submit` to the form's `@submit`, and bind the field signals to the inputs that show their messages:

```ts
import { html, render } from "zerolith";
import { createForm } from "@zerolith/forms";
import { noteSchema } from "./note-schema.ts";

const noteForm = createForm({
    schema: noteSchema,
    reset: true,
    onSuccess: ({ result }) => console.log("created", result)
});

render(html`
    <form method="post" action="/notes" @submit=${noteForm.submit}>
        <label>Title
            <input name="title" aria-describedby="title-error"
                aria-invalid=${noteForm.field("title").invalid}>
        </label>
        <output id="title-error">${noteForm.field("title").error}</output>
        <button ?disabled=${noteForm.pending}>Save</button>
    </form>`, "#app");
```

| Binding | What it does |
| --- | --- |
| `@submit=${noteForm.submit}` | Sends the submission with `fetch` instead of loading a new page |
| `aria-invalid=${noteForm.field("title").invalid}` | Marks the input while it has a message |
| `${noteForm.field("title").error}` | Shows the field's first message |
| `?disabled=${noteForm.pending}` | Disables the button while the submission runs |

The method, action, and encoding stay on the element, where the browser reads them too. `aria-describedby` points the input at its message, so a screen reader reads the message with the field.

The enhancer keeps the state of the current submission in signals:

| Member | Holds |
| --- | --- |
| `status` | `"idle"`, then `"pending"` during a submission, then `"success"`, `"failure"`, or `"error"` |
| `pending` | `true` while a submission runs |
| `problem` | The problem from the last failed submission |
| `result` | The parsed body of the last successful submission |
| `error` | What the last submission that could not complete threw |
| `field(name)` | One input's view of the problem: `errors`, every message for it; `error`, the first; `invalid`, `true` while it has one. The same object for the same name |
| `submit(event)` | The submit handler |
| `reset()` | Aborts a submission in flight and returns to `idle` |

A new submission clears the last problem as it starts, so old messages disappear while it runs.

## Validation, written once

Validation is a Standard Schema, the interface zod, valibot, arktype, and other schema libraries implement. The schema below is written by hand to show the interface; a zod schema such as `z.object({ title: z.string().min(2) })` plugs in the same way.

```ts
import type { StandardSchema } from "@zerolith/forms";

export interface Note
{
    title: string;
}

// Any Standard Schema library works; this one is written by hand to show
// the interface.
export const noteSchema: StandardSchema<unknown, Note> = {
    "~standard": {
        version: 1,
        vendor: "notes",
        validate(value)
        {
            const title = typeof value === "object" && value !== null
                ? (value as { title?: unknown }).title
                : undefined;
            if (typeof title === "string" && title.trim().length >= 2)
            {
                return { value: { title: title.trim() } };
            }
            const message = "Give the note a title of at least two characters.";
            return { issues: [{ message, path: ["title"] }] };
        }
    }
};
```

Given to `createForm`, the schema runs in the browser before anything is sent: a failing submission becomes a problem whose `fields` come from the issues' paths, and no request is made. `validateForm` runs the same schema on the server, or anywhere `FormData` or a plain object is at hand, so both sides apply exactly the same rules.

> [!TIP]
> `validateForm` turns `FormData` into a plain object first. A name that appears once maps to its value, and a name that appears more than once, such as a group of checkboxes, maps to an array of its values in order; `formValues` does that conversion on its own.

## The server

Any server that can read `FormData` and write a `Response` fits. `validateForm` turns a submission into the parsed value or a problem, and `problemResponse` writes the problem with the `application/problem+json` media type:

```ts
import { problemResponse, validateForm } from "@zerolith/forms";
import { type Note, noteSchema } from "./note-schema.ts";

const notes: (Note & { id: number })[] = [];

async function createNote(request: Request): Promise<Response>
{
    const validation = await validateForm(noteSchema, await request.formData());
    if (validation.problem !== undefined)
    {
        return problemResponse(validation.problem);
    }
    const note = { id: notes.length + 1, ...validation.value };
    notes.push(note);
    return Response.json(note, { status: 201 });
}
```

A title that is too short gets this document, with status 400:

```json
{
    "type": "about:blank",
    "title": "The submission has invalid fields",
    "status": 400,
    "fields": { "title": ["Give the note a title of at least two characters."] }
}
```

It is the same document the enhancer builds when the schema fails in the browser, so the form shows a message the same way whichever side found it. `fields` is the extension to RFC 9457 that zerolith defines: a map from field name to its messages, where a nested path is joined with dots, as `address.city`, and an issue with no path goes to `detail`. The `Problem` type and `isProblem` live in the core, so the typed client and the forms share them, and a server written in another language answers with the same JSON and needs no schema on the client at all.

## What the enhancer does with the response

| Response | Outcome |
| --- | --- |
| `application/problem+json`, or any failing status | `failure`; `problem` holds the document, or a problem built from the status, and `field()` follows its `fields` |
| A redirect was followed | `success`, then `navigate(url)` with the final URL; `result` stays undefined |
| 2xx with a JSON body | `success`; `result` holds the parsed body |
| 2xx with another body, or none | `success`; `result` holds the text, or undefined |
| The request itself failed | `error`; `error` holds the exception |

## Options

| Option | What it does |
| --- | --- |
| `schema` | Validates in the browser before anything is sent |
| `send` | Replaces the request: it receives the submission, with its data, method, action, and abort signal, and returns a promise of the `Response` |
| `headers` | Adds headers to the default request |
| `fetch` | The `fetch` the default request uses, the global one unless given |
| `navigate` | Where a redirected response takes the page, `location.assign` unless given; pass `(url) => router.navigate(url, { reload: true })` to stay in the application, with `reload` so a redirect back to the page shown loads it again |
| `reset` | Resets the form element after a successful response |
| `onSuccess` | Runs after a successful response, with its result; an error it throws is reported as an uncaught error is, with `reportError`, and leaves `status` as it is |
| `onFailure` | Runs with the problem, from the schema or the server; an error it throws is reported the same way |
| `onError` | Runs when the request itself fails |

## The request

The default request copies what the browser would send:

- The method and action come from the form, after the submitter's `formmethod` and `formaction`, read as the browser reads them: a method it does not know, such as `put`, submits as `get`, as a native form would, so a `PUT` or `DELETE` needs a `send` of its own. The submitter's name and value are part of the data in every supported browser.
- The body follows the encoding, `enctype` or the submitter's `formenctype`: URL-encoded by default, `FormData` for `multipart/form-data`, and lines of text for `text/plain`. A `GET` puts the data in the query string instead.
- The `Accept` header asks for JSON or a problem, unless `headers` sets one, so a server can tell an enhanced submission from a native one.
- Cookies go with a request to the same origin.

A form submitted again aborts the request still in flight and discards its outcome. A form with `method="dialog"` is left to the browser.

## Serving the form without JavaScript

When a server renders the page, the form works before its script loads, and keeps working if the script fails: the browser posts the same data to the same action and shows whatever the server answers. The server tells the two kinds of request apart by their `Accept` header:

| Request | Failure | Success |
| --- | --- | --- |
| From `@zerolith/forms`, accepting JSON | `problemResponse(problem)`, which marks the fields | JSON the page reads from `result`, or a redirect the enhancer follows |
| A native submission, accepting HTML | The page rendered again with the messages | A `303 See Other` redirect to the new resource |

A redirect suits both: the browser follows it natively, and the enhancer follows it with `fetch`, then navigates to where it ended. In a client-rendered application the form exists only once the script runs, so the enhanced path is the only one, and the native form still pays off in the browser's own behavior. The [server rendering guide](server-rendering.md) covers rendering the page on the server.
