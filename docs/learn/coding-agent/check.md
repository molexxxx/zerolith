---
title: Check its work
description: Run the project's checks, read what the agent changed, and see how a check catches a value that never updates.
order: 2
---

# Check its work

An agent says it's done when it thinks it's done. Before you keep the change, check it yourself. It takes a minute.

## Run the checks

```sh
npm run check
```

This is the same command the agent was asked to run. It runs four checks, and stops at the first one that fails:

1. **The type check**, which finds code that uses a value the wrong way.
2. **The linter**, which finds mistakes without running the code. It runs oxlint, then `zerolith lint`, which reads every template for zerolith's own mistakes.
3. **The tests**, in a real browser.
4. **The build**, which makes the files you'd put on a server.

For a good change, all four pass.

## Read the change

Run `git status` to see which files the agent added or changed, and `git diff` to see the lines. Read them the way you'd read a change from a teammate:

- It changed only what you asked for.
- The page and the test match the request. A request for 15, 18, and 20 percent shouldn't come back with 10 and 25.
- The test checks what a person sees, such as the total, rather than how the code is written.

## A value that never updates

Some mistakes are easy to make and easy to miss. Here's a common one in zerolith. Suppose the agent had written the total like this:

```html
<p>Total: ${total.get().toFixed(2)}</p>
```

`.get()` reads a signal's value once. This line reads the total when the page is made, turns it into text, and puts that text on the page. The text never changes, so the total says 0.00 whatever you type.

The fix is to put a computed value in `${}` instead, as the page in the last step does. The page then follows it:

```html
<p>Total: ${computed(() => total.get().toFixed(2))}</p>
```

`npm run check` catches the first version in the linter, before the tests even run. `zerolith lint` prints:

```text wide
  error     template_frozen_read: src/components/tip.ts:31:21: A .get() read is bound in a template, so the value is read once when the template is created and never updates. Bind the signal itself, or computed(() => ...) for a derived value.
            fix: See https://zerolith.dev/e/template_frozen_read/

  1 error, 0 warnings
```

Each problem it finds has four parts:

- **A code**, `template_frozen_read`, which names the mistake.
- **Where it is**: the file, then the line and the column.
- **What went wrong**, in a sentence.
- **A link** to a page about the mistake and how to fix it.

## Try it

In `src/components/tip.ts`, change the total's line to the first version above, with `${total.get().toFixed(2)}`, and save. Type a bill: the total stays at 0.00. Run `npm run check` and read what it prints.

Leave the mistake in for the next step.

## What you learned

- `npm run check` runs the type check, the linter, the tests, and the build. Run it yourself before you keep an agent's change.
- `git status` and `git diff` show what the agent changed.
- A `.get()` in `${}` reads once, and `zerolith lint` catches it with the code `template_frozen_read`.
