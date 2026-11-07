---
title: Privacy
description: What zerolith.dev keeps about you, which is next to nothing, and what its host and your own browser keep.
order: 1
---

# Privacy

zerolith.dev is the documentation site of zerolith, an open-source frontend framework. It has no accounts, no forms, no analytics, no advertising, and no cookies. This page says what does touch your data while you read it, and it is kept true: if that ever changes, this page changes first.

Last updated: 2026-11-06.

## The host

The site is a set of static files served by GitHub Pages. To serve a page, GitHub receives what every web request carries, such as your IP address and your browser's user agent, and may log it to run and protect its service. The [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) covers that. The site's maintainer receives no analytics and no visitor logs from it.

## What the site loads

Every page, script, style sheet, font, and image comes from zerolith.dev itself. No page loads a script, a font, or a tracker from another site, and a test in the site's build fails if one ever does. Links to GitHub, npm, and crates.io take you to those sites, which have privacy policies of their own.

## What your browser keeps

- **Your theme.** When you switch between the light and dark themes, your browser keeps the choice in its `localStorage` under `zerolith-docs-theme`, so your next visit opens in it. Clearing the site's data in your browser removes it.
- **The playground.** Code you run in the [playground](https://zerolith.dev/playground/) runs in a sandboxed frame in your own browser. What that code saves is kept in the tab's `sessionStorage` under `zerolith-playground-storage`, so it lasts through each run and a reload; it goes away when the tab closes, and Reset clears it. Your code is not sent anywhere, unless the code itself makes a request; the examples that load data ask zerolith.dev for it.
- **Shared playground links.** Copy link puts your code in the address, after the `#`. Browsers never send that part of an address to a server, but anyone you share the link with can read the code.
- **Search.** Search runs in your browser, over an index the site serves. What you type into it stays in your browser.

## Changes and questions

When what the site does with data changes, this page is updated before the change goes live, with a new date above. Questions go through the [contact page](contact.md).
