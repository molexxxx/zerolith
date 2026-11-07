---
title: Events
description: Dispatch feedback-sent and feedback-failed from the element, so the host page can react the way it reacts to a click.
order: 5
---

# Events

The host page may want to know what happened: count answers in its analytics, offer a link to support after a No, or log a failure. An element reports to its page with events, as an `<input>` does with `input` and `change`, and a page listens with `addEventListener`, or with its framework's way of doing the same.

## Dispatching

Update `src/components/feedback.ts`:

@include packages/zerolith/test/fixtures/widget/events/src/components/feedback.ts

Two events leave the element:

| Event | When | `event.detail` |
| --- | --- | --- |
| `feedback-sent` | The backend recorded the feedback | The feedback as it was sent, with the receipt's `id` |
| `feedback-failed` | Sending failed, or the page names no api | The problem the status line shows |

`dispatch` sends them from `host`, the element itself, so `event.target` is the widget the page put there, and a page with two widgets can tell them apart. `bubbles: true` lets one listener on the document hear every widget on the page, and `composed: true` lets the event out of a shadow root, for a page that places the widget inside a component of its own that has one. The names are lowercase with a hyphen, like the element's, which every framework's template can spell.

## Listening on the development page

Add a listener to `index.html`, after `main`:

@include packages/zerolith/test/fixtures/widget/app/index.html

This script is the host page's own code, not part of the widget, as it would be on any site. It logs each event, so open the browser's console, send feedback, and `feedback-sent` appears with the feedback and its id. Reload, point `api` at the address nothing answers as in the last step, and send, and `feedback-failed` appears with its problem.

## What you learned

- An element reports to its page with events dispatched from the host element.
- `bubbles` lets one listener on the document hear every widget, and `composed` lets the event out of a shadow root.
- `event.detail` carries the data, and `event.target` says which widget sent it.
