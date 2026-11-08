---
title: Coding agent
description: "Ask a coding agent for a page in a new zerolith app, check what it wrote, and get it to fix a mistake from the code zerolith reports."
order: 5
---

# Build with a coding agent

A coding agent is a program that changes your project for you when you ask in plain words. It reads your files, edits them, and runs commands. Claude Code, Codex, Cursor, GitHub Copilot, and Gemini CLI are a few.

In this tutorial you'll ask an agent to add a page to a new zerolith app, check what it wrote, and get it to fix a mistake. The agent writes the code, but you decide whether it's right, so each step shows what to look for.

## What you need

- Node 24 or newer. Run `node --version` to check.
- A coding agent that can edit files and run commands in a folder on your computer.
- The [packing list](../packing-list/index.md) tutorial helps you read what the agent writes, but you don't need it.

## Start a project

Run these three commands:

```sh
npx @zerolith/cli new tip-calculator --template ts --yes
cd tip-calculator
npm run dev
```

`npm run dev` prints an address. Open it in your browser and leave the server running.

## Save a starting point

In a second terminal, in the `tip-calculator` folder, save the starter in git:

```sh
git init
git add .
git commit -m "Start from the zerolith starter"
```

Now `git status` lists every file the agent adds or changes, and `git diff` shows each changed line.

Then start your agent in the `tip-calculator` folder, in that terminal or in your editor.

## What the agent reads

The starter already wrote two things for agents, so there's nothing to set up:

| File | What it holds | When the agent reads it |
| --- | --- | --- |
| `AGENTS.md` | This project's commands, its rules, and where each kind of file goes | At the start of every task |
| `.agents/skills/zerolith/` and `.claude/skills/zerolith/` | The zerolith skill: zerolith's rules, one pattern for each idea, and every error code with its fix | When a task involves zerolith |

Both folders hold the same skill, because different agents look in different places. Claude Code reads `.claude/skills/`, and most others read `.agents/skills/`.

Open `AGENTS.md` and read it. It's short, and it's what your agent follows. Commit both, so other people's agents get them too.

## The steps

1. [Ask for a page](ask.md): write a request the agent can finish without guessing.
2. [Check its work](check.md): run the checks, read the change, and try the page.
3. [Fix a mistake](fix.md): hand the agent the code a check printed, and add a rule for next time.
