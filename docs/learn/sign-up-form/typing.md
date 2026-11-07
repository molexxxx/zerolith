---
title: Checking as you type
description: Show the password's rules as a checklist from the start, and let each message follow your changes once a submission has failed.
order: 3
---

# Checking as you type

Two things about the form are wrong so far. The password's rules are a surprise: you meet them only after you have picked a password. And a message stays after you fix its field, which reads as though the fix did not work.

Checking on every keystroke can be just as bad, with "Enter an email address" on screen while you are typing the first letter. So the page does two different things. The password's rules show from the start as a checklist, because they are guidance rather than a complaint. Messages wait for the first submission, and after it they follow your changes.

The checklist needs text that only a screen reader gets, which comes from `@zerolith/a11y`. Install it:

```sh
npm install @zerolith/a11y
```

It depends on `zerolith` alone, and the focus step uses it again.

## The checklist

Create `src/components/password-rules.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/typing/src/components/password-rules.ts

`values` is a signal holding everything the form holds right now, and each rule gets a `computed` over it, so a line updates when the password changes and also when the email address does. The rules are fixed, so a `map` renders them once.

Each line says its state twice, and neither way relies on color. The mark is for the eye, hidden from screen readers with `aria-hidden`. The words "Met:" and "Not met:" are for screen readers, hidden from the eye with `visuallyHidden`, the clip pattern from `@zerolith/a11y`. `data-met` lets the `css` literal follow the state.

A `TextField` takes the checklist as a hint. Update `src/components/text-field.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/typing/src/components/text-field.ts

`aria-describedby` takes several ids, so a screen reader reads the message and then the hint with the field. The list is not a live region, for the same reason the message is not: it would talk over you with every letter.

## Following the form

Update `src/components/sign-up.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/typing/src/components/sign-up.ts

`@input=${typed}` listens on the form itself, since an `input` event bubbles up from every field, the radio buttons and the checkbox included. `typed` reads the whole form with `formValues`, the same plain object the schema receives, into `values`.

`sent` holds what the form held when the last submission failed. `onFailure` sets it, along with `values`, so the two agree at that moment. Its first argument, the problem, comes into use in the focus step.

`message` is where the two meet, and it returns a computed value that decides field by field:

- Nothing has failed yet, or the field still holds what was sent: the form's own message for that field, if it has one. Before the first failure, `signUp.field(name).error` is empty, so typing shows nothing.
- The field has changed since: the form's message is about a value that is no longer there, so the field's rule judges the new value instead.

Keeping the first case for a field that still holds what was sent matters for messages only a server can give. It is why, in the next step, a message about a taken email address leaves when you change the address and comes back if you change it back.

`aria-invalid` follows the same signal, because a `TextField` derives it from `message`.

## Try it

Type a password and watch the checklist tick off "At least 15 characters". Type your email address into the password as well, with the same address under Email, and "Does not contain your email address" goes back to not met; change the address under Email and it is met again. No message appears while you do this.

Now press Create account with the form empty, then fix the fields one at a time. Each message updates as you type, and goes as soon as its field passes. Clear a field you have changed and its message comes back.

## What you learned

- `@input` on a form hears every field, and `formValues` reads them all into one plain object.
- A checklist of rules is a `computed` per rule, shown in a mark and in hidden words rather than in color alone.
- `visuallyHidden` keeps text for assistive technology off the screen.
- A message is about one value: keep it while the field holds that value, and judge a new value with the field's rule.
