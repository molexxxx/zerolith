---
title: Add a page
description: Write a component, give it a route, and link to it from the navigation.
order: 1
---

# Add a page

A zerolith page is a component, and a component is a plain function that returns a view. There is no class to extend and no special file type: a function, an `html` template, and an export.

## The component

Create `src/components/packing.ts`:

@include packages/zerolith/test/fixtures/tutorial/page/src/components/packing.ts

`html` is a tagged template. It reads like a string of HTML, but nothing is parsed from strings at run time and nothing can inject markup into it: the browser parses the template once, and the values you put in `${}` slots are bound to exact places in it. The function returns a `View`, which is what `render`, the router, and other templates accept.

## The route

Pages appear through the route table in `src/routes.ts`. Import the component next to the other imports:

@include packages/zerolith/test/fixtures/tutorial/page/src/routes.ts#import excerpt

Then add an entry to the table, next to `home`, `counter`, and `packages`:

@include packages/zerolith/test/fixtures/tutorial/page/src/routes.ts#route excerpt

The key, `packing`, is the route's name. The path is matched against the URL, the view renders when it matches, and `head` sets the document title while the page is open.

## The link

Links are plain anchors. The router handles clicks on links to its own routes, so the page changes without a reload, and every other link works as a link always does. The starter's layout in `src/components/layout.ts` already builds its navigation from the route names, so add one more line to the `nav` there: `${Link({ href: router.href("packing"), label: "Packing", exact: false })}`.

`router.href("packing")` builds the URL from the route's name. Since the route table is typed, a misspelled name or a missing parameter is a type error in your editor rather than a broken link in production.

Save, click Packing in the header, and the new page appears with its title in the browser tab.

## What you learned

- A component is a function that returns a view, written with the `html` tag.
- A page is a route: a path, a view, and its head.
- Links are anchors, and `router.href` builds them from route names.
