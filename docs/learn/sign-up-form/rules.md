---
title: Rules on submit
description: Write the rules once in a Standard Schema, check them with @zerolith/forms when the form is submitted, and show each message next to its field.
order: 2
---

# Rules on submit

The browser's checks only go so far. It doesn't know your password rules, and each browser words and places its messages differently. Your server also has to check everything again, because anyone can send it anything.

So you'll write the rules once, in a file both the page and the server can use. The page shows each rule's message next to its field.

`@zerolith/forms` runs the rules and keeps track of the form. Install it:

```sh
npm install @zerolith/forms
```

## The rules

Create `src/schema.ts`. This is where a zerolith project keeps the rules its forms check:

@include packages/zerolith/test/fixtures/sign-up-form/rules/src/schema.ts

**`rules`** has one function for each field. Each function:

- gets every value in the form, because one field's rule may need another field. The password rule reads the email address, for example.
- returns the message to show, or `undefined` if the field is fine.

**`passwordRules`** lists the password's rules. Each one has a line for a checklist, which you'll add in the next step, and a message for now. The rules ask for length and nothing about which kinds of characters to use. That follows [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html): at least 15 characters when the password is the only way to sign in, and no rules that require a mix of character types.

The email rule only checks the shape of an address: some text, an `@`, and more text with a dot in it. Only sending a message to the address can prove it exists.

**`signUpSchema`** wraps the rules in a Standard Schema. That's a shared format that libraries such as zod, valibot, and arktype also use, so you could use one of them instead. It's written by hand here because the next step checks one field at a time with the same `rules`.

`validate` gets the form's values and returns one of two things:

- `issues`: the problems, each with a message and a `path` that names its field.
- `value`: the cleaned-up values. The name and email have spaces trimmed from the ends. The password stays exactly as typed, because a space can be part of a password.

`plans` moved here too, so the radio buttons and the rule that checks them use the same list.

## The fields

Each field now has three parts: its label, its control, and its message. Writing that out for every field would repeat a lot, so each kind of field becomes a component. Each one keeps its own styles in a `css` block, like the starter's components do.

A message is one paragraph. Create `src/components/message.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/rules/src/components/message.ts

Create `src/components/text-field.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/rules/src/components/text-field.ts

- `aria-describedby` points to the message's `id`, so a screen reader reads the message along with the field.
- `aria-invalid` tells a screen reader the field has a problem. The starter's `src/styles.css` gives such a field a red border.

The message is a plain paragraph. In the next step it changes as you type, and a screen reader would read every one of those changes aloud if it were a live region.

Create `src/components/plan-choice.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/rules/src/components/plan-choice.ts

Create `src/components/checkbox.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/rules/src/components/checkbox.ts

A checkbox takes `aria-invalid` like a text field does. The plan group is a `<fieldset>`, whose role is `group`, and [ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/#aria-invalid) defines `aria-invalid` for neither a group nor a single radio button, so the plan group connects its message with `aria-describedby` only.

## The form

Update `src/components/sign-up.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/rules/src/components/sign-up.ts

`createForm` sets up the form, and `@submit=${signUp.submit}` hands it each submit. It checks the rules first and sends nothing while any rule fails.

`novalidate` tells the browser to leave the checking to your page. Without it, the browser would stop the form before your rules could run. `required` stays on the fields, because it still tells a screen reader which fields are required.

`signUp.field(name).error` is a signal with the field's message from the last submit. `message` is a short name for it. The field name must be one of your form's fields, so a typo shows as an error in your editor.

## Try it

1. Press **Create account** with the form empty. A message appears next to each of the five fields. Your browser's Network panel shows that nothing was sent.
2. Type a short password and press it again. The password's message changes to "Use at least 15 characters."
3. Fix a field. Its message stays until you submit again. The next step changes that.

Now fill in everything correctly and submit. The Network panel shows a `POST` to `/api/sign-ups`, sent the same way the browser would send it. The dev server answers 405, because there's no backend yet, and the page stays put. You'll add a server two steps from now.

## What you learned

- The rules live in `src/schema.ts`, one function per field, wrapped in a Standard Schema.
- `createForm` checks the rules and sends nothing while one fails. `field(name).error` holds each message.
- `novalidate` leaves the checking to your page, and `required` still tells screen readers which fields are required.
- `aria-describedby` and `aria-invalid` connect a message to its field for screen readers.
