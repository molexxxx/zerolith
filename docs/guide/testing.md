---
title: Testing
description: Mount views with automatic cleanup, settle async work, check that a component hydrates its own server markup, and catch the accessibility defects a test can see.
order: 15
group: Tooling
---

# Testing

zerolith views are plain functions that return templates, so most of a test is ordinary DOM work: render, click, read. `@zerolith/test` covers the parts worth not rewriting in every project. It depends only on `zerolith` and works in any runner that provides a DOM; the examples use Vitest's browser mode, which is what this repository runs.

## Mount and interact

`mount` renders a view into a container attached to the document and remembers it; `cleanup`, registered as the after-each hook, disposes every mount in reverse order. Effects run synchronously when a signal changes, so a click shows its result at once; `settle` is for the promises a test started, such as resources and lazy routes.

@include packages/test/test/examples/testing.example.browser.test.ts#mount test

The container is a normal element: query it, dispatch events on it, or hand it to the runner's locator API.

## Hydration and accessibility

`hydrationMismatches` renders a view with the server renderer, hydrates a second instance over that markup, and returns every disagreement, so a component that would be re-rendered on the client instead of adopted fails its test here rather than in production. `accessibilityIssues` finds the defects that need no accessibility tree to detect: images without `alt`, form controls without a label, buttons and links without a name, and frames without a title. They are the defects found on most pages in the WebAIM Million, and a floor rather than a conformance check; a full audit still needs an engine such as axe.

@include packages/test/test/examples/testing.example.browser.test.ts#checks test

Each issue carries a stable code and the element, so a test can assert on exactly what it expects or fail on any issue at all.
