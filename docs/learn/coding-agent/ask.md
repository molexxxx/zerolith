---
title: Ask for a page
description: Write a request that says what the page does, where it goes, and how to check it, and read the page the agent writes.
order: 1
---

# Ask for a page

An agent does its best work when the request says three things:

- **What it does.** What a person sees on the page and what they can do.
- **Where it goes.** The page's address, and a link to it.
- **How to check it.** A test, and the project's checks passing.

## The request

Paste this into your agent:

```text
Add a tip calculator page at /tip. It has a field for the bill and a
choice of 15, 18, or 20 percent, with 18 chosen. As I type, it shows the
tip and the total with two decimals. Add a Tip link to the header. Add a
browser test that types a bill, picks a percent, and checks the total.
Run npm run check when you're done.
```

The agent reads `AGENTS.md` and learns that a page is a component in `src/components/` with a route in `src/routes.ts`. It opens the skill for zerolith's patterns, writes the files, and runs the checks.

## What it writes

Each agent writes it a little differently, but a good answer changes the same four files:

| File | What changed |
| --- | --- |
| `src/components/tip.ts` | New: the page |
| `src/routes.ts` | A `tip` route at `/tip` |
| `src/components/layout.ts` | A Tip link in the header |
| `test/tip.browser.test.ts` | New: the test |

The page should look about like this:

@include packages/zerolith/test/fixtures/coding-agent/app/src/components/tip.ts

Here's how to read it:

- **`signal`** holds a value that can change. The bill and the percent are signals.
- **`computed`** holds a value worked out from other values. The tip and the total are computed, so they change on their own when the bill or the percent changes.
- **`${}`** puts a value on the page. When it's a signal or a computed value, the page updates as the value changes.

And the test:

@include packages/zerolith/test/fixtures/coding-agent/app/test/tip.browser.test.ts test

It types `50` in the bill, checks the tip and the total, picks 20%, and checks them again. Last, `accessibilityIssues` checks that every field and button has a name, so a screen reader can say what it is.

## Try it

Click **Tip** in the header. Type `50` in the bill. The tip shows 9.00 and the total 59.00. Pick 20%, and they change to 10.00 and 60.00.

## What you learned

- A request that says what, where, and how to check it gets a page you can check.
- `AGENTS.md` tells the agent where files go, and the skill tells it how zerolith code is written.
