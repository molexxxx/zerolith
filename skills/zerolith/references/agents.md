<!-- Generated from docs/guide/agents.md by npm run skills. Edit the guide, then regenerate. -->

# Coding agents

zerolith is written to be worked on by people and coding agents alike, from the same sources. The rules an agent follows are the rules this guide teaches, the examples it reads are the ones that run in CI, and every error it meets names its own fix. This page lists what an agent can read and how to give it each piece.

## AGENTS.md in every project

`zerolith new` writes an `AGENTS.md` next to `package.json`: the project's commands, the rules that matter most, and a table of where each kind of change goes. Agents that follow the AGENTS.md convention read it at the start of a task. Keep it current as the project grows: a convention that lives only in your head is one the agent cannot follow.

## The zerolith Agent Skill

An [Agent Skill](https://agentskills.io/) is a folder with a `SKILL.md` that an agent loads when a task calls for it, and reference files it reads only when it needs them. The zerolith skill holds the rules, one pattern for each concept, the commands, and a checklist for finishing a change, with every guide on this site as a reference and every diagnostic code with its fix.

Install it into a project with the `skills` command, which finds the agents on your machine and copies the skill where each one looks:

```sh
npx skills add molexxxx/zerolith
```

Or copy the [skills/zerolith](https://github.com/molexxxx/zerolith/tree/main/skills/zerolith) folder of the repository into the project's `.agents/skills/`, the folder agents share, or into the skills folder of your agent. The skill on the main branch describes the code on main; to match a release, copy the folder from that release's tag. The references are generated from these guides and checked by a test, so they never disagree with this site.

## This site, for agents

- **Markdown twins.** Every page has a Markdown version at the same path with `.md`, such as [/guide/signals.md](https://molexxxx.github.io/zerolith/guide/signals.md), and each page links its twin with `rel="alternate" type="text/markdown"`. The twin has the examples expanded, so it holds everything the page shows.
- **llms.txt.** [/llms.txt](https://molexxxx.github.io/zerolith/llms.txt) lists every twin with a one-line description, the index an agent reads first, and [/llms-full.txt](https://molexxxx.github.io/zerolith/llms-full.txt) puts every page in one file.
- **The API manifest.** [/api.json](https://molexxxx.github.io/zerolith/api.json) lists every export of every package with its module, its kind, and its documentation, generated from the source.

## Diagnostics an agent can act on

Every error and warning carries a stable code and a link to its page, which states what happened and what to do. An agent that meets `template_frozen_read` can read [its page](https://molexxxx.github.io/zerolith/e/template_frozen_read/) and apply the fix without guessing. `zerolith doctor` reports the same template mistakes before the code runs, along with a missing entry module or a stale import map, so an agent can check its work the way CI will.

## Working with an agent

- Ask it to finish with `npm run check` where the project defines it, or with doctor, the tests, the typecheck, and the build.
- Point it at `/llms.txt` when it needs the docs and cannot install the skill.
- When it gets something wrong twice, add the rule to `AGENTS.md`.

Whether this context makes agents measurably better is a claim to be tested, not assumed: a public evaluation suite is on the [roadmap](https://github.com/molexxxx/zerolith/blob/main/docs/ROADMAP.md), along with an MCP server for the docs.
