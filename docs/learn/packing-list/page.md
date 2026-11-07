---
title: Add a page
description: Write a component, give it a route, and link to it from the navigation.
order: 1
---

# Add a page

In zerolith, each page is a component. A component is a function that returns what to show. In this step you'll write one and give it its own address.

## The component

Create `src/components/packing.ts`:

@include packages/zerolith/test/fixtures/tutorial/page/src/components/packing.ts

`html` lets you write HTML inside your code. The parts inside `${}` are filled in from your code. Each value goes in its exact spot, so text that a user types always shows as text and never turns into HTML.

The function returns a `View`, which is anything zerolith can put on the page.

## The route

A route connects an address, like `/packing`, to a page. Routes live in `src/routes.ts`. First, import your component next to the other imports at the top:

@include packages/zerolith/test/fixtures/tutorial/page/src/routes.ts#import excerpt

Then add the route at the end of the list. The starter's last route, `packages`, has no comma after it, so add a comma there first. Then add this below it:

@include packages/zerolith/test/fixtures/tutorial/page/src/routes.ts#route excerpt

- `packing` is the route's name. You'll use it to make links.
- `path` is the address that opens the page.
- `view` is what the page shows.
- `head` sets the title in the browser tab.

## The link

Open `src/components/layout.ts`. Its `nav` has one `Link` for each page. Add one for yours:

```ts
${Link({ href: router.href("packing"), label: "Packing", exact: false })}
```

`router.href("packing")` builds the link's address from the route's name. If you misspell the name, your editor marks it as an error right away.

Links are normal `<a>` tags. When you click a link to a page in your app, the router changes the page without reloading. Links to other sites work as usual.

## Try it

Save your files and click **Packing** in the header. Your page opens, and the browser tab shows its title.

## What you learned

- A component is a function that returns a view, written with `html`.
- A route gives a page its address and its title.
- Links are normal `<a>` tags, and `router.href` builds their addresses from route names.
