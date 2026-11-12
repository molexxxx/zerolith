---
title: The form
description: Write the sign-up page as a native form with a label for every field, give it a route, and see what the browser checks on its own.
order: 1
---

# The form

The browser already does a lot for a plain HTML `<form>`:

- Clicking a label focuses its field.
- Pressing Enter submits the form.
- A password manager can offer a password.
- A required field that's empty stops the form from sending.

Start with a form that gets all of that. Later steps add to it without taking any of it away.

## The page

Create `src/components/sign-up.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/form/src/components/sign-up.ts

Every field has a name that a screen reader can read:

- A text field is joined to its `<label>` by the label's `for` and the field's `id`.
- A checkbox or a radio button sits inside its `<label>`, so you can click anywhere on the line.
- The radio buttons share one `name`, so you can only pick one. The `<fieldset>` and `<legend>` give the group its name, "Plan".

`type` and `autocomplete` tell the browser what each field is for:

- `type="email"` shows the email keyboard on a phone.
- `type="password"` hides what you type.
- `autocomplete="name"` and `autocomplete="email"` let the browser fill in what it knows about you.
- `autocomplete="new-password"` tells a password manager to suggest a new password instead of filling in a saved one.

`method` and `action` say where the form is sent: a `POST` to `/api/sign-ups`, on the same site. They stay on the form for the whole tutorial.

The page's layout goes in a stylesheet next to it. Create `src/components/sign-up.css`:

@include packages/zerolith/test/fixtures/sign-up-form/form/src/components/sign-up.css

`?scoped` on the import means these rules only apply inside this page's `section`, as the packing list's [styles step](../packing-list/styles.md) explains. `overflow-wrap: anywhere` lets a long name wrap on a phone, instead of making the page wider than the screen. This file stays the same for the rest of the tutorial.

## The route

In `src/routes.ts`, import the component next to the other imports:

@include packages/zerolith/test/fixtures/sign-up-form/form/src/routes.ts#import excerpt

Then add the route at the end of the list. The starter's last route, `packages`, has no comma after it, so add a comma there first:

@include packages/zerolith/test/fixtures/sign-up-form/form/src/routes.ts#route excerpt

## The link

Open `src/components/layout.ts`. Its `nav` has one `Link` for each page. Add one for the sign-up page:

```ts
${Link({ href: router.href("signUp"), label: "Sign up", exact: false })}
```

## Try it

Save your files and click **Sign up** in the header. The form appears, and the browser tab shows its title.

Now try what the browser does on its own:

1. Click the word **Name**. The field gets the focus.
2. Press **Create account** with the form empty. The browser doesn't send it. It moves to Name and says the field is required.
3. Fill in everything, but type `grace` as the email. The browser stops again, this time at Email.

All of that comes from `required` and `type="email"`. You haven't written any script for it.

Fix the email and press **Create account** again. The browser sends the form to `/api/sign-ups` and leaves the page. There's nothing there yet, so the dev server refuses it, and the browser shows an error. Go back. The next step keeps you on the page.

## What you learned

- A plain HTML form gets labels, keyboard support, autofill, and basic checks from the browser.
- `<label>`, `<fieldset>`, and `<legend>` give every field a name.
- `autocomplete` tells the browser and password managers what each field is for.
- `method` and `action` stay on the form and say where it's sent.
