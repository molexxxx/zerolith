---
title: Focus and messages
description: Move focus to the first field to fix or to the welcome's heading, and announce what changed out of sight with @zerolith/a11y.
order: 6
---

# Focus and messages

So far, everything the page does is visual. Someone using only the keyboard, or listening with a screen reader, runs into a problem:

1. They press **Create account**, and the button turns itself off.
2. A disabled button can't keep the focus, so the focus jumps to the page itself.
3. When the answer arrives, nothing says so, and the next Tab starts again from the top of the page.

Each outcome needs a place for the focus to go. When something changes out of sight, it also needs words for a screen reader to read:

| Outcome | Focus goes to | A screen reader says |
| --- | --- | --- |
| Some fields need fixing | The first of them, in the form's order | That field and its message, then how many fields need fixing |
| The sign-up didn't go through | The button | The button, then what happened |
| The account was created | The welcome's heading | The heading |

## The welcome takes focus

Update `src/components/welcome.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/app/src/components/welcome.ts

`tabindex="-1"` lets a script focus the heading without adding it to the Tab order. The form that had the focus is gone by now, so the heading is where the reader continues from.

A `ref` runs while the element is being created, before it's on the page, and an element that isn't on the page can't take focus. So `focusOnArrival` waits a moment, until the heading is on the page, as the [templates guide](../../guide/templates.md#bindings) describes. It doesn't use anything from the component, so it sits at the top of the file.

## The page reports each failure

Update `src/components/sign-up.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/app/src/components/sign-up.ts

`report` gets the problem and the form, and decides where the focus goes:

- `form.elements` lists the form's fields in the order they appear on the page. The first one the problem mentions gets the focus, whatever order the server listed them in. For the plan, that's the first radio button, and the arrow keys move between the rest.
- If the problem names no field, as with a `502`, the focus goes back to the button. The button is turned on again by the time `onFailure` runs.

`onError` calls `report` the same way when no answer came back at all.

`createAnnouncer` adds two hidden regions to the page that screen readers read aloud. `announce` puts a message in one of them. The announcer is created at the top of the file, so the regions are already on the page before the first message. A region that appears at the same moment as its text might not be read.

`announce` waits politely for the screen reader to finish reading the field that just got the focus. That field's own message is already read with it, through `aria-describedby`. So the announcement only says what's out of sight: how many fields need fixing. The welcome doesn't need an announcement, because moving the focus to its heading already reads it.

The [accessibility guide](../../guide/accessibility.md#announcements-and-hidden-text) covers the announcer and the rest of `@zerolith/a11y`.

## Try it

Use only the keyboard:

1. Press Tab until **Create account** has the focus, and press Enter with the form empty. The focus jumps to Name, with its message under it.
2. Fill in the fields, moving with Tab. Pick a plan with the arrow keys and check the box with Space.
3. Use `ada@example.com` as the email and press **Create account**. The focus lands on Email.
4. Change the email and press **Create account** again. The focus lands on the welcome's heading.

If you have a screen reader, such as Narrator on Windows or VoiceOver on a Mac, try the same steps. It reads each field with its message, then "Fix 1 field to create your account."

## What you learned

- A disabled button loses the focus, so a form has to put the focus somewhere after every outcome.
- `form.elements` lists the fields in the form's order, for finding the first one to fix.
- `tabindex="-1"` lets a script focus a heading. A `ref` that moves the focus waits until the element is on the page.
- `createAnnouncer` reads aloud what changed out of sight. What already has the focus is read without it.
