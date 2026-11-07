---
title: Events
description: Dispatch feedback-sent and feedback-failed from the element, so the host page can react the way it reacts to a click.
order: 5
---

# Events

The site may want to know what happened. It might count answers in its analytics, offer a link to support after a No, or log a failure.

An element tells its page what happened with **events**, the way an `<input>` sends `input` and `change`. The page listens with `addEventListener`, or its framework's version of it.

## Sending events

Update `src/components/feedback.ts`:

@include packages/zerolith/test/fixtures/widget/events/src/components/feedback.ts

The widget sends two events:

| Event | When | `event.detail` holds |
| --- | --- | --- |
| `feedback-sent` | The server saved the feedback | The feedback as it was sent, with the receipt's `id` |
| `feedback-failed` | Sending failed, or the page didn't name an `api` | The problem the status line shows |

`dispatch` sends them from `host`, the element itself:

- **`event.target`** is the widget, so a page with two widgets can tell them apart.
- **`bubbles: true`** lets one listener on the whole document hear every widget on the page.
- **`composed: true`** lets the event out of a shadow root, for a site that puts the widget inside one of its own components.

The event names are lowercase with a hyphen, like the element's name, so every framework's templates can spell them.

## Listening on the development page

Add a listener to `index.html`, after `main`:

@include packages/zerolith/test/fixtures/widget/app/index.html

This script is the site's own code, not part of the widget, just as it would be on any real site. It logs each event.

## Try it

1. Open your browser's console and send feedback. `feedback-sent` appears, with the feedback and its id.
2. Reload, point `api` at an address where nothing answers, as in the last step, and send again. `feedback-failed` appears, with its problem.

## What you learned

- An element tells its page what happened with events sent from the element itself.
- `bubbles` lets one listener on the document hear every widget. `composed` lets the event out of a shadow root.
- `event.detail` carries the data, and `event.target` says which widget sent it.
