---
title: Send the form
description: Disable the button while the request runs, replace the form with a welcome built from the server's answer, and say so when a sign-up does not go through.
order: 5
---

# Send the form

Sending takes time, and it can end in different ways. The page should handle each one:

- **While it's sending**, say so, and don't send it twice.
- **When it works**, replace the form with a welcome.
- **When it fails without naming a field**, such as when the server is down, there's no field to show the message next to. The page still has to say something.

`createForm` already keeps track of all this in its `status` signal:

| `status` | Means |
| --- | --- |
| `idle` | Nothing sent yet |
| `pending` | Sending now |
| `success` | The server accepted it |
| `failure` | The server answered with a problem |
| `error` | No answer came back at all |

The page only has to read it.

## The welcome

Create `src/components/welcome.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/sending/src/components/welcome.ts

The welcome shows the account the server sent back, not what you typed, so it shows what was really saved. `plans` turns the plan's id into its name.

## The page

Update `src/components/sign-up.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/sending/src/components/sign-up.ts

**While it's sending.** `signUp.pending` is `true` while the status is `pending`. `?disabled=${signUp.pending}` turns the button off, and `action` changes its text to "Creating your account…". Without this, an impatient second click would send the form again. The page cancels the first request when a second one starts, but the server may already have received it.

**When it works.** `when` shows the welcome once `done` is true. Until then, it shows the form, which is its third argument. `signUp.result` holds what the server sent back. A server could send anything, so `account` treats it as `Account | undefined`, and the welcome reads it with `?.`. If a server breaks the contract and sends no body, the welcome shows blanks instead of an error.

**When no field is to blame.** `failed` holds a message in two cases:

- The server answered with a problem that names no field, such as the `502` the dev server answers while your server is down.
- No answer came back at all, such as when you're offline.

The person signing up can't fix either one in a field, so both show the same message, using the same `Message` the fields use. The message clears as soon as you try again.

## Try it

1. Sign up with a new email address. The form is replaced by the welcome.
2. Reload the page. The form is back. The server still has your account, so signing up with the same address now gets the `409` from the last step.
3. Leave that address in the form. In your browser's Network panel, pick a slow network such as Slow 4G, and press **Create account**. The button turns off and says "Creating your account…" until the answer arrives.
4. Pick **Offline** and press it again. A message under the form says the sign-up didn't go through.

Set the network back to normal when you're done.

## What you learned

- `status` follows a submit from `pending` to `success`, `failure`, or `error`.
- `?disabled=${signUp.pending}` stops a second submit while the first one is sending.
- `result` holds the server's answer, and `when` swaps the form for what comes next.
- A failure that names no field still needs its own message.
