---
title: Send the feedback
description: Post the answer with the typed client, read every failure as a problem, and announce sending, success, and failure to every reader.
order: 4
---

# Send the feedback

The form now has somewhere to go. This step sends it: read the answer from the form, post it to the address the page gives, and tell the reader what happened, whether that is thanks or the reason it failed.

## Where to send it, and about which page

Two more props come in, the same way `question` did. Update `src/main.ts`:

@include packages/zerolith/test/fixtures/widget/app/src/main.ts

`api` is the address of the backend, and the widget posts to `/feedback` under it, as the contract says. The page chooses the address, so a backend can serve the operation under any prefix it likes. `page` names the page the feedback is about, for a site that has its own names, such as `guide/install`; without one, the widget sends the page's address without its query or fragment, which can hold things a reader would not mean to send.

`host`, the view's second argument, is the element itself. The component uses it to know where keyboard focus is.

Give the development page an api. In `index.html`, the element becomes:

```html
<feedback-widget api="/api"
    question="Did this guide help?"></feedback-widget>
```

`/api` is relative to the page, so the request reaches the proxy from the last step, which forwards it to the handler.

## Sending

Update `src/components/feedback.ts`:

@include packages/zerolith/test/fixtures/widget/sending/src/components/feedback.ts

`send` handles the form's submit. It stops the browser's own submission, reads the form with `FormData`, and builds a `Feedback`, the type generated from the contract, so a member the contract does not have, or one of the wrong type, fails `tsc`. A blank comment is left out rather than sent empty, and surrounding spaces are trimmed.

`createClient<Api>(routes, { baseUrl })` builds a client for the contract, and `client.call("sendFeedback", { body: feedback })` sends `POST` to `/feedback` under `baseUrl`, with the body as JSON, and resolves with the receipt. The client is made for each send, since the page can change `api` at any time.

A response outside 2xx rejects with a `ProblemError`, whose `problem` is the document the backend sent, or one built from the status line when it sent something else, such as an HTML error page from a proxy. A request that never gets an answer, because the network is down or the server does not allow the cross-origin request, rejects with an ordinary error. `problemOf` turns both into a problem, so `failed` has one shape to show. A page that names no api never gets as far as a request, and is reported the same way.

## Telling the reader

`state` holds where the form is: ready, sending, or sent. What the reader sees follows it:

- While sending, the status line says so, and Send has `aria-disabled="true"`, which tells assistive technology it does nothing for now. `send` ignores a press while a request runs. A plain `disabled` would not do: a disabled button cannot hold focus, so a keyboard user who pressed Send would find focus thrown back to the top of the page.
- Once sent, `when` takes the form away and the status line thanks the reader. If keyboard focus was inside the widget, it moves to the status line, so it is not lost along with the form. `tabindex="-1"` lets a script focus the paragraph without adding it to the Tab order, and `ref=${region}` hands the paragraph to the `region` signal when it is created, which is how `send` reaches it. Focus somewhere else on the page stays where it is.
- When sending fails, the status line gives the reason, the form stays as it was, and Send works again.

The status line has `role="status"`, which makes assistive technology read its text aloud when it changes. It stays on the page, empty at first, since a status region that appears together with its text can go unread.

Save, choose an answer on the development page, and press Send. The status line thanks you, and the terminal running `npm run dev` prints what the handler received. To see a failure, reload, set the api to an address nothing answers in the browser's console, `document.querySelector("feedback-widget").api = "http://127.0.0.1:3999"`, and send again: the status line says the service could not be reached, and the form stays.

## What you learned

- The client checks the operation and its body against the generated contract, and rejects with a `ProblemError` for a failure the server reports.
- One status region, always on the page, announces sending, success, and failure.
- `aria-disabled` keeps a busy button focusable, and focus moves to the result when the form around it goes away.
- `ref` hands an element to a signal, for the rare work a binding cannot do, such as moving focus.
