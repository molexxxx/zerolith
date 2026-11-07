---
title: Sending and the welcome
description: Disable the button while the request runs, replace the form with a welcome built from the server's answer, and say so when a sign-up does not go through.
order: 5
---

# Sending and the welcome

A request takes time, and it can end in more ways than one. While it runs, the page should say so and should not send it again. When it succeeds, the form has done its job and should give way to something else. And when it fails without naming a field, as when the backend is down, there is no field to show the message next to, but the page still has to say something.

`createForm` already tracks all of this. Its `status` signal goes from `idle` to `pending` when a submission starts, then to `success`, to `failure` with a problem, or to `error` when the request itself could not complete. The page only has to read it.

## The welcome

Create `src/components/welcome.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/sending/src/components/welcome.ts

The welcome reads the account the server answered with, rather than what the form held, so it shows what was actually stored. `plans` turns the plan's id into its name.

## The page

Update `src/components/sign-up.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/sending/src/components/sign-up.ts

**While it runs.** `signUp.pending` is a computed value, `true` while the status is `pending`. `?disabled=${signUp.pending}` turns the button off, and `action` changes its words, so the wait is visible in more than the button's style. Without this, an impatient second click would send the form again: a new submission aborts the old one in the page, but the server may have received it already.

**When it succeeds.** `when` shows the welcome once `done` is true, and until then the form, which its third argument renders. `signUp.result` holds the parsed body of the answer. It can hold whatever a server sent, so `account` calls it `Account | undefined` and the welcome reads it with `?.`: a server that breaks the contract and answers with no body gets blanks in the welcome rather than an error.

**When no field is to blame.** `failed` holds a message in two cases: a failure whose problem names no field, such as the `502` the dev server answers while the backend is down, and an `error`, when no answer came at all. Neither is something the person signing up can fix in a field, so both say the same thing, in the same `Message` the fields use. A new submission clears the last problem as it starts, so the message leaves while the next attempt runs.

## Try it

Sign up with a new address and the form gives way to the welcome. Reload the page and the form is back; the backend still has your account, so signing up with the same address now gets the `409` from the last step.

To watch the wait, leave that address in the form, choose a slow network such as Slow 4G in your browser's Network panel, and press Create account: the button turns off and reads "Creating your account…" until the `409` arrives. Then choose Offline and press it again, and the message under the form says the sign-up did not go through. Set the network back afterward.

## What you learned

- `status` tracks a submission from `pending` to `success`, `failure`, or `error`.
- `?disabled=${signUp.pending}` stops a second submission while the first one runs.
- `result` holds the parsed answer, and `when` swaps the form for what comes after it.
- A failure that names no field still needs a message of its own.
