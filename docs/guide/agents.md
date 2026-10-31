---
title: Coding agents
description: "Set up a coding agent for a zerolith app: the project's AGENTS.md and the zerolith skill, and what the docs and diagnostics give it besides."
order: 19
group: Tooling
---

# Coding agents

A coding agent needs two things to work well in a zerolith app: the project's own conventions and the framework's rules. `zerolith new` writes both into every new project, so there is nothing to set up. Each piece is read at a different time, which keeps what the agent always carries small:

| Piece | When it is read |
| --- | --- |
| `AGENTS.md`, in the project | At the start of every task |
| The zerolith skill, in the project | When a task involves zerolith, one reference at a time |
| The docs as Markdown, on this site | When it looks something up |

## What a new project holds

1. **The project's AGENTS.md.** `zerolith new` writes an `AGENTS.md` next to `package.json`, with the project's commands, the rules that matter most, a table of where each kind of change goes, and a pointer to the skill. Agents that follow the AGENTS.md convention, Claude Code among them, read it at the start of every task; Claude Code reads a `CLAUDE.md` instead when the project has one, so put a line holding `@AGENTS.md` in that file to include this one. Keep it current as the project grows: when an agent gets something wrong twice, add the rule there.
2. **The zerolith skill.** An [Agent Skill](https://agentskills.io/) is a folder an agent loads when a task calls for it; this one holds the rules, one pattern for each concept, the commands, a checklist for finishing a change, and every guide and diagnostic code as a reference the agent opens when it needs one. `zerolith new` writes it into `.agents/skills/zerolith/`, which Codex, Cursor, GitHub Copilot, Gemini CLI, and most other agents read, and `.claude/skills/zerolith/`, which Claude Code reads, as the version of zerolith the project installs.

Nothing else needs to run: an agent started in the project finds both on its own. If an agent was already running, start a new session, and commit the files so everyone's agents get them.

## Keeping the skill current

The skill is a copy, so it stays at the version it was written for. After upgrading zerolith, run

```sh
npx zerolith skill
```

which replaces both copies with the skill for the new version; `zerolith doctor` reports `skill_outdated` until then. The same command adds the skill to a project made without it, by `zerolith new --no-skill` or before the command line had it.

`npx skills add molexxxx/zerolith` installs the skill too, with the [skills](https://www.npmjs.com/package/skills) tool: it detects the agents installed on your machine, asks which ones to set up, and copies the skill from the repository's main branch, which can be ahead of the latest release.

## What else an agent can use

- **Diagnostics with their fix.** Every error and warning carries a stable code and a link to its page, which says what happened and what to do, such as [template_frozen_read](https://molexxxx.github.io/zerolith/e/template_frozen_read/). `zerolith doctor` reports the same template mistakes before the code runs, and in a project from `zerolith new`, `npm run check` runs the typecheck, the lint, the tests, and the build, so an agent can verify its own work.
- **The docs as Markdown.** Every page of this site has a Markdown version at its address with `.md` in place of the closing slash, such as [guide/signals.md](https://molexxxx.github.io/zerolith/guide/signals.md) for the signals guide. [llms.txt](https://molexxxx.github.io/zerolith/llms.txt) lists them all, [llms-full.txt](https://molexxxx.github.io/zerolith/llms-full.txt) holds every page but the playground in one file, and [api.json](https://molexxxx.github.io/zerolith/api.json) lists every export with its documentation. Point an agent at llms.txt when it works without the skill, as in a project that does not use zerolith yet.

## Which AGENTS.md is which

The `AGENTS.md` in your project is the one your agent reads. The [AGENTS.md at the root of the zerolith repository](https://github.com/molexxxx/zerolith/blob/main/AGENTS.md) is for agents changing zerolith itself, and an app never needs it.

Whether this context makes agents measurably better is a claim to be tested, not assumed: a public evaluation suite is on the [roadmap](https://github.com/molexxxx/zerolith/blob/main/docs/ROADMAP.md), along with an MCP server for the docs.
