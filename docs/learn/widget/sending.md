---
title: Send the feedback
description: Post the answer with the typed client, read every failure as a problem, and announce sending, success, and failure to every reader.
order: 4
---

# Send the feedback

The form has somewhere to go now. In this step it sends the answer to the address the site gives, and tells the reader what happened: thanks, or why it failed.

## Where to send it, and about which page

Two more props come in, the same way `question` did. Update `src/main.ts`:

@include packages/zerolith/test/fixtures/widget/app/src/main.ts

- **`api`** is the server's address. The widget sends to `/feedback` under it, as the contract says. The site chooses the address, so a server can put the feedback endpoint under any path it likes.
- **`page`** names the page the feedback is about, for sites that have their own names for pages, such as `guide/install`. Without it, the widget sends the page's address, minus anything after `?` or `#`, since that part can hold things the reader wouldn't mean to send.

`host`, the view's second argument, is the element itself. The component uses it to know where the keyboard focus is.

Give the development page an `api`. In `index.html`, change the element to:

```html
<feedback-widget api="/api"
    question="Did this guide help?"></feedback-widget>
```

`/api` is on the page's own site, so the request goes through the proxy from the last step to your server.

## Sending

Update `src/components/feedback.ts`:

@include packages/zerolith/test/fixtures/widget/sending/src/components/feedback.ts

`send` runs when the form is submitted. It:

1. Stops the browser from sending the form itself.
2. Reads the form with `FormData`.
3. Builds a `Feedback`, the type made from the contract. If you add something the contract doesn't have, or use the wrong type, the type check fails.

A blank comment is left out instead of sent empty, and spaces at either end are trimmed.

`createClient<Api>(routes, { baseUrl })` makes a client for the contract. `client.call("sendFeedback", { body: feedback })` sends a `POST` to `/feedback` under `baseUrl`, with the body as JSON, and gives back the receipt. The widget makes a new client for each send, because the site can change `api` at any time.

When something goes wrong, there are two kinds of failure:

- **The server answers with an error**, any status outside 200 to 299. The client throws a `ProblemError`. Its `problem` is the problem details document the server sent, or one built from the status if the server sent something else, such as an HTML error page.
- **No answer comes back**, because the network is down or the server doesn't allow requests from this site. The client throws an ordinary error.

`problemOf` turns both into a problem, so `failed` only has to show one shape. A page that doesn't name an `api` never sends a request, and is reported the same way.

## Telling the reader

`state` holds where the form is: ready, sending, or sent. What the reader sees follows it:

- **While sending**, the status line says so, and the Send button gets `aria-disabled="true"`, which tells screen readers it does nothing for now. `send` ignores presses while a request is running. A plain `disabled` would be worse here: a disabled button can't keep the keyboard focus, so a keyboard user who pressed Send would lose their place on the page.
- **Once sent**, `when` replaces the form, and the status line thanks the reader. If the keyboard focus was inside the widget, it moves to the status line, so it isn't lost along with the form. `tabindex="-1"` lets a script focus the paragraph without adding it to the Tab order. `ref=${region}` gives the paragraph to the `region` signal when it's created, which is how `send` finds it. If the focus was somewhere else on the page, it stays there.
- **When sending fails**, the status line gives the reason, the form stays as it was, and Send works again.

The status line has `role="status"`, so screen readers read its text aloud when it changes. It stays on the page, empty at first, because a status line that appears at the same moment as its text might not be read.

## Try it

1. Pick an answer on the development page and press **Send**. The status line thanks you, and the terminal running `npm run dev` prints what the server received.
2. Reload. Then, in your browser's console, point the widget at an address where nothing answers: `document.querySelector("feedback-widget").api = "http://127.0.0.1:3999"`.
3. Send again. The status line says the service couldn't be reached, and the form stays.

## What you learned

- The client checks the operation and its body against the contract, and throws a `ProblemError` when the server reports a failure.
- One status line, always on the page, announces sending, success, and failure.
- `aria-disabled` keeps a busy button focusable. When the form goes away, the focus moves to the result.
- `ref` gives an element to a signal, for the rare work a binding can't do, such as moving the focus.
