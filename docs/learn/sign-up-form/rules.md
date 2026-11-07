---
title: Rules on submit
description: Write the rules once in a Standard Schema, check them with @zerolith/forms when the form is submitted, and show each message next to its field.
order: 2
---

# Rules on submit

The browser's checks only go so far. It knows nothing about your password rules, and its messages are worded and placed its own way in each browser. A server has to check everything again in any case, since anyone can send it anything. So the rules get written once, in a module both sides can import, and the page shows their messages next to the fields.

`@zerolith/forms` runs the rules and keeps track of the submission. Install it:

```sh
npm install @zerolith/forms
```

It depends on `zerolith` alone.

## The rules

Create `src/schema.ts`, where a zerolith project keeps what its forms validate:

@include packages/zerolith/test/fixtures/sign-up-form/rules/src/schema.ts

`rules` is the heart of the file: one function per field. A rule receives every value the form holds, since a rule can read another field, as the password's does with the email address, and it returns the message to show, or `undefined` when the field passes.

`passwordRules` gives each of the password's rules a line for the checklist you add in the next step and a message for now. They ask for length and nothing about the kinds of characters, as [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html) does: at least 15 characters for a password that is the only way to sign in, and no rules that require a mix of character types. The email rule checks only the shape of an address: text, an `@`, and more text with a dot in it. Only a message sent to the address can prove it exists.

`signUpSchema` wraps the rules in a Standard Schema, the interface zod, valibot, and arktype implement. It is written by hand here because the next step calls the same `rules` one field at a time. `validate` receives the form's values and returns either `issues`, each with a message and a `path` that names its field, or the cleaned `value`: the name and the email address trimmed, and the password as typed, since a space can be part of it.

`plans` moved here too, so the radio buttons and the rule that checks them read one list.

## The fields

Each field now has three parts wired together by ids: its label, its control, and its message. That would repeat for every field, so each kind of field becomes a component, and each carries its own styles in a `css` literal, as the starter's components do.

A message is one paragraph. Create `src/components/message.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/rules/src/components/message.ts

Create `src/components/text-field.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/rules/src/components/text-field.ts

`aria-describedby` names the message's `id`, so a screen reader reads the message with the field. `aria-invalid` tells it the field has a problem, and the starter's `src/styles.css` gives a field with `aria-invalid="true"` a red border. The message is a plain paragraph rather than a live region, which would read every change aloud: in the next step the message changes as you type.

Create `src/components/plan-choice.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/rules/src/components/plan-choice.ts

Create `src/components/checkbox.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/rules/src/components/checkbox.ts

A checkbox takes `aria-invalid` as a text field does. A `fieldset` and a radio button do not, as [ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/#aria-invalid) defines it, so the group carries its message through `aria-describedby` alone.

## The form

Update `src/components/sign-up.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/rules/src/components/sign-up.ts

`createForm` returns the enhancer for this form, and `@submit=${signUp.submit}` hands it each submission. It runs the schema first and sends nothing while a rule fails.

`novalidate` tells the browser to leave the checking to the page; without it, the browser would refuse the form before the submit event, and the schema would never run. `required` stays on the fields, where it still tells a screen reader the field is required.

`signUp.field(name).error` is a signal holding the field's first message from the last submission, and `message` is a short name for it. It takes the name as `FieldName`, so a misspelled field is a type error.

## Try it

Press Create account with the form empty. A message appears next to each of the five fields, and your browser's Network panel shows that nothing was sent. Enter a short password and press it again: the password's message changes to "Use at least 15 characters." Notice that a message stays after you fix its field, until the next submission checks again. The next step changes that.

Fill in everything correctly, and the form is sent with `fetch`: the Network panel shows a `POST` to `/api/sign-ups` with the fields URL-encoded, as the browser itself would send them. The dev server answers 405, since there is no backend yet, and the page stays as it is. The step after next gives it a server.

## What you learned

- The rules live in `src/schema.ts`, one function per field, wrapped in a Standard Schema.
- `createForm` takes the schema and sends nothing while a rule fails; `field(name).error` holds each message.
- `novalidate` leaves the checking to the page, and `required` still describes the field.
- `aria-describedby` and `aria-invalid` tie a message to its field for assistive technology.
