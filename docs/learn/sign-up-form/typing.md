---
title: Checking as you type
description: Show the password's rules as a checklist from the start, and let each message follow your changes once a submission has failed.
order: 3
---

# Checking as you type

The form has two problems so far:

- You only find out the password rules after you've picked a password.
- A message stays after you fix its field, so it looks like your fix didn't work.

Checking on every key press isn't the answer either. Nobody wants "Enter an email address" while they're typing the first letter. So the page does two things:

- **The password rules show from the start**, as a checklist. They're help, not a complaint.
- **Messages wait for the first submit.** After that, they update as you type.

The checklist needs text that only screen readers get. `@zerolith/a11y` has a helper for that. Install it:

```sh
npm install @zerolith/a11y
```

You'll use it again in the focus step.

## The checklist

Create `src/components/password-rules.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/typing/src/components/password-rules.ts

`values` is a signal with everything the form holds right now. Each rule is a `computed` value made from it, so a line updates when the password changes, and also when the email changes. The rules never change, so `map` shows them once.

Each line shows whether it's met in two ways, and neither one relies on color:

- **A mark**, for people who can see it. `aria-hidden` hides it from screen readers.
- **The words "Met:" or "Not met:"**, for screen readers. `visuallyHidden` from `@zerolith/a11y` hides them from the screen.

`data-met` lets the `css` block style each state.

A `TextField` takes the checklist as a hint. Update `src/components/text-field.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/typing/src/components/text-field.ts

`aria-describedby` can list more than one id. A screen reader reads the message, then the hint, along with the field. The checklist isn't a live region, for the same reason the message isn't: a screen reader would talk over you with every letter.

## Following the form

Update `src/components/sign-up.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/typing/src/components/sign-up.ts

**`@input=${typed}`** listens on the whole form. An `input` event from any field reaches the form, including the radio buttons and the checkbox. `typed` reads the whole form with `formValues`, the same kind of object your rules get, and puts it in `values`.

**`sent`** holds what the form held when the last submit failed. `onFailure` sets it and `values` together, so they match at that moment. Its first argument, the problem, is used in the focus step.

**`message`** decides what each field shows:

- If nothing has failed yet, or the field still holds what was sent, it shows the form's own message for that field, if there is one. Before the first failed submit there's none, so typing shows nothing.
- If the field has changed since, the old message was about a value that's gone. So the field's rule checks the new value instead.

That first case matters for messages only a server can give. In the next step, a message about an email that's already taken goes away when you change the address. It comes back if you change it back.

`aria-invalid` follows the same signal, because a `TextField` takes it from `message`.

## Try it

1. Type a password and watch "At least 15 characters" get its mark.
2. Type your email address into the password, with the same address under Email. "Does not contain your email address" goes back to not met. Change the email and it's met again. No message appears while you do this.
3. Press **Create account** with the form empty. Then fix the fields one at a time. Each message updates as you type and goes away as soon as its field is fine.
4. Clear a field you fixed. Its message comes back.

## What you learned

- `@input` on a form hears every field. `formValues` reads them all into one object.
- A checklist is a `computed` value per rule, shown with a mark and with hidden words, not with color alone.
- `visuallyHidden` keeps text for screen readers off the screen.
- A message is about one value. Keep it while the field holds that value, and check a new value with the field's rule.
