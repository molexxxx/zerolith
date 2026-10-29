---
title: Forms
description: Native forms that post FormData and work without JavaScript, enhanced with fetch, pending state, and RFC 9457 field errors, with validation written once for the browser and the server.
order: 6
---

# Forms

A form in zerolith is a `<form>` element with a method and an action. It posts `FormData` to the route that rendered it, the server validates and either redirects on success or answers with the fields that failed, and all of that works before any script has loaded. `@zerolith/forms` adds what JavaScript can add on top: the same request goes through `fetch` so the page stays put, pending state and the outcome are signals, and a failure arrives as a problem details document whose `fields` map lights up the inputs. This is the shape SvelteKit form actions, React Router actions, and Astro Actions converged on; the difference is that nothing here assumes a particular server.

## The form

`createForm` returns the enhancer for one form. Bind its `submit` to the form's `@submit`, and bind the field signals to the inputs that show their messages.

@include packages/forms/test/examples/forms.example.browser.test.ts#form

The method, action, and encoding stay on the element. If the script has not run yet, or is blocked, the browser submits the form natively to the same place with the same data. `pending` is true while a submission is in flight, `field(name).invalid` and `field(name).error` follow the problem for that input, and `status` moves through `idle`, `pending`, and then `success`, `failure`, or `error`.

## Validation, written once

Validation is a Standard Schema, the interface that zod, valibot, arktype, and the other schema libraries implement. The guide's schema is written by hand to show the interface; `z.object({ title: z.string().min(2) })` works the same way.

@include packages/forms/test/examples/note-schema.ts#schema

Pass the schema to `createForm` and it runs in the browser before anything is sent: a failing submission becomes a problem whose `fields` come from the issue paths, and no request is made. `validateForm` runs the same schema anywhere `FormData` or a plain object is available, so the server runs exactly the validation the client ran.

## The server

Any server that can read `FormData` and write a `Response` fits. `validateForm` turns a submission into the parsed value or a problem, and `problemResponse` writes the problem with the `application/problem+json` media type.

@include packages/forms/test/examples/server.example.test.ts#server

The response for a failed submission is the same document the client built for itself, so the handler serves both the no-JavaScript path and the enhanced one. The `fields` member is the RFC 9457 extension zerolith defines, a map from field name to an array of messages; the `Problem` type and `isProblem` live in the core so the typed client and the forms share them. A server written in another language answers with the same JSON and the form reads it without a client-side schema at all.

## What the enhancer does with the response

| Response | Outcome |
| --- | --- |
| `application/problem+json`, or any failing status | `failure`; `problem` holds the document, or a problem built from the status, and `field()` follows its `fields` |
| A redirect was followed | `success`, then `navigate(url)` with the final URL, which defaults to `location.assign`; pass the router's `navigate` to stay in the application |
| 2xx with a JSON body | `success`; `result` holds the parsed body |
| 2xx with another body, or none | `success`; `result` holds the text, or undefined |
| The request itself failed | `error`; `error` holds the exception |

The default request copies what the browser would send: the method and action after the submitter's `formmethod` and `formaction` overrides, the encoding from `enctype` or `formenctype`, the data as a query string for `GET`, and an `Accept` header asking for JSON or a problem so a server can tell an enhanced submission from a navigation. Pass `send` to replace the request entirely, `headers` to add to it, and `reset: true` to clear the form after success. A submission replaces one still in flight; the older request is aborted and its outcome discarded. Forms with `method="dialog"` are left to the browser.

## Without JavaScript

The same markup, with no script, posts natively. The server validates with the same schema, answers a failure by rendering the page again with the messages, and answers success with a redirect to the created resource. Nothing about the form changes between the two paths, which is the point: enhancement is something the page gains, not something it depends on.
