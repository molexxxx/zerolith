---
title: The form
description: Write the sign-up page as a native form with a label for every field, give it a route, and see what the browser checks on its own.
order: 1
---

# The form

A sign-up page is a form, and the browser already knows a lot about forms. A native `<form>` focuses a field when you click its label, submits when you press Enter, lets a password manager offer a password, and refuses a missing field on its own. Start with the markup that gets all of that; the later steps add to it and take nothing away.

## The page

Create `src/components/sign-up.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/form/src/components/sign-up.ts

Every control has a name a screen reader can read, in the way that suits it:

- A text field and its `<label>` are joined by `for` and `id`.
- A checkbox or a radio button sits inside its `<label>`, so the whole line is a click target.
- The radio buttons share a `name`, which makes them one choice, and the `<fieldset>` and `<legend>` name the group.

`type` and `autocomplete` tell the browser what each field holds. `type="email"` brings up the email keyboard on a phone, and `type="password"` hides what you type. `autocomplete="name"` and `autocomplete="email"` let the browser fill in what it knows about you, and `autocomplete="new-password"` tells a password manager this is a new password, to offer one rather than fill in a saved one.

`method` and `action` say where the form goes: a `POST` to `/api/sign-ups`, on the page's own origin. They stay on the element for the whole tutorial.

The page's layout goes in a stylesheet beside it. Create `src/components/sign-up.css`:

@include packages/zerolith/test/fixtures/sign-up-form/form/src/components/sign-up.css

`?scoped` on the import makes these rules apply inside the `section` and nowhere else, as the packing list's [styles step](../packing-list/styles.md) explains. `overflow-wrap: anywhere` lets a long name wrap on a phone rather than push the page wider than the screen. This file stays as it is for the rest of the tutorial.

## The route

Import the component next to the other imports in `src/routes.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/form/src/routes.ts#import excerpt

Then add an entry at the end of the table. The starter's last entry, `packages`, has no comma after it, so add one there first:

@include packages/zerolith/test/fixtures/sign-up-form/form/src/routes.ts#route excerpt

## The link

The starter's layout in `src/components/layout.ts` has one `Link` for each page in its `nav`, so add one more line there: `${Link({ href: router.href("signUp"), label: "Sign up", exact: false })}`.

## Try it

Save and click Sign up in the header. The form appears, with its title in the browser tab.

Click the word Name and the field takes focus. Press Create account with the form empty and the browser refuses to send it, moves focus to Name, and says the field is required. Fill in everything, type `grace` under Email, and it refuses again, this time pointing at Email. All of this comes from `required` and `type="email"`, with no script of yours.

Correct the email address and press Create account once more, and the browser posts the form to `/api/sign-ups` and leaves the page. Nothing answers there yet, so you see an error from the dev server. Go back; the next step keeps the page in place.

## What you learned

- A native form gets labels, the keyboard, autofill, and basic checks from the browser.
- `<label>`, `<fieldset>`, and `<legend>` give every control a name.
- `autocomplete` tells the browser and password managers what each field holds.
- `method` and `action` stay on the form and say where it goes.
