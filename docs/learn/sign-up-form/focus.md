---
title: Focus and announcements
description: Move focus to the first field to fix or to the welcome's heading, and announce what changed out of sight with @zerolith/a11y.
order: 6
---

# Focus and announcements

Everything the page does so far can be seen. Someone who works from the keyboard or listens to a screen reader meets a gap. Press Create account and the button turns itself off, and a disabled button cannot hold focus, so the browser moves focus to the page itself. When the answer arrives nothing says so, and Tab starts again from the top of the page.

Each outcome needs a place for focus to go and, where what changed is out of sight, words to read aloud:

| Outcome | Focus goes to | A screen reader says |
| --- | --- | --- |
| Fields need a change | The first of them, in the form's order | That field with its message, then how many fields need a change |
| The sign-up did not go through | The button | The button, then what happened |
| The account exists | The welcome's heading | The heading |

## The welcome takes focus

Update `src/components/welcome.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/app/src/components/welcome.ts

`tabindex="-1"` lets a script focus the heading while keeping it out of the Tab order. The form that held focus is gone by now, so the heading is where a reader continues from. A `ref` runs while the element is created, before its template is in the page, and an element out of the page cannot take focus, so `focusOnArrival` waits a microtask, as the [templates guide](../../guide/templates.md#bindings) describes. `focusOnArrival` uses nothing from the component, so it sits at the top of the module.

## The page reports each failure

Update `src/components/sign-up.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/app/src/components/sign-up.ts

`report` receives the problem and the form. `form.elements` lists the form's controls in the order the form shows them, so the first one whose name the problem mentions is the first to fix, whatever order the problem listed them in. For the plan that is its first radio button, and the arrow keys take it from there. When the problem names nothing, as for a `502`, focus goes back to the button, which is on again by the time `onFailure` runs. `onError` calls `report` the same way when no answer came at all.

`createAnnouncer` adds two live regions to the page, hidden from the eye, and `announce` writes a message into one of them for a screen reader to read. It is created at the top of the module, so the regions exist before the first message; a region that appears together with its text can go unread.

`announce` is polite by default, so it waits for the screen reader to finish the field that just took focus. The field's own message is read with the field through `aria-describedby`, so the announcement says only what is out of sight: how many fields there are to fix. The welcome needs no announcement, since moving focus to its heading already reads it.

The [accessibility guide](../../guide/accessibility.md#announcements-and-hidden-text) covers the announcer and the other primitives in `@zerolith/a11y`.

## Try it

Do this with the keyboard alone. Press Tab until Create account has focus, and press Enter with the form empty: focus jumps to Name, with its message under it. Fill in the fields, moving with Tab, pick a plan with the arrow keys, check the box with Space, and press Create account with `ada@example.com` as the address: focus lands on Email. Change the address and press Create account again, and focus lands on the welcome's heading.

With a screen reader running, such as Narrator on Windows or VoiceOver on a Mac, the same path reads each field with its message, then "Fix 1 field to create your account."

## What you learned

- A disabled button loses focus, so a form has to put focus somewhere after every outcome.
- `form.elements` gives the controls in the form's order, for finding the first one to fix.
- `tabindex="-1"` lets a heading take focus from a script, and a `ref` that moves focus waits a microtask.
- `createAnnouncer` reads what changed out of sight, and what already has focus needs no announcement.
