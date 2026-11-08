---
title: Fix a mistake
description: Give the agent the code a check printed, add a rule to AGENTS.md when a mistake repeats, and keep the skill current after an upgrade.
order: 3
---

# Fix a mistake

When a check fails, give the agent what it printed. Every zerolith error code has a page about it, and the skill lists every code with its fix. So the code and the file are usually all the agent needs.

## Ask for the fix

Paste this into your agent:

```text
npm run check fails with template_frozen_read in src/components/tip.ts.
Fix it, and run npm run check again.
```

The agent looks up `template_frozen_read` in the skill, puts the total back in a `computed`, and runs the checks. They pass.

You can also let the agent find the problem itself: ask it to run `npm run check` and fix what fails. It reads the same output you would.

## Add a rule for next time

Most agents don't remember earlier tasks. Each one starts fresh, from `AGENTS.md` and the skill. So when an agent makes the same mistake twice, write the rule where it'll read it.

Open `AGENTS.md`. Under `## Rules`, add a line:

```md
- Show money with two decimals, through `toFixed(2)` in a `computed`.
```

The agent reads `AGENTS.md` at the start of every task, so the rule applies from the next one on. Keep each rule to one line, and keep the file short: the agent reads all of it, every time.

## After you upgrade zerolith

The skill is a copy, written for the version of zerolith the project installed. After you upgrade zerolith, update the skill too:

```sh
npx zerolith skill
```

Until you do, `npx zerolith doctor` warns with `skill_outdated`.

## Try it

Ask the agent to fix the total, as above. Then type a bill: the total follows it again. Run `npm run check`: all four checks pass.

## What you learned

- The code a check prints is the most useful thing you can give an agent.
- A rule that matters to your project goes in `AGENTS.md`, one line each.
- `npx zerolith skill` keeps the skill in step with the zerolith you install.

## Where to go next

- The [coding agents guide](../../guide/agents.md) covers what an agent reads and when, and the docs as Markdown for an agent working outside a zerolith project.
- The [diagnostics guide](../../guide/diagnostics.md) lists every code zerolith reports.
- The [packing list](../packing-list/index.md) tutorial explains each idea the agent used, one step at a time.
