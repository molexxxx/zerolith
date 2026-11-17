# create-zerolith

Starts a [zerolith](https://zerolith.dev/) project. `npm create zerolith` runs this package, and this package runs `zerolith new` from [`@zerolith/cli`](https://www.npmjs.com/package/@zerolith/cli) at its own version, so the project starts on the release the command names. It holds no template of its own.

```
npm create zerolith my-app
cd my-app
npm run dev
```

`new` asks a few questions, each with a default, writes the starter, installs its dependencies with the package manager that ran the command, and ends with the commands the new project runs on.

| Package manager | Command |
| --- | --- |
| npm | `npm create zerolith my-app` |
| pnpm | `pnpm create zerolith my-app` |
| Yarn | `yarn create zerolith my-app` |
| Bun | `bun create zerolith my-app` |

## Flags

Everything after `create zerolith` goes to `zerolith new` as it was written: the folder, then the flags. npm takes a flag for itself unless `--` comes first, and the other package managers pass flags on as they are.

```
npm create zerolith my-app -- --template ts --yes
pnpm create zerolith my-app --template ts --yes
```

| Flag | What it chooses |
| --- | --- |
| `--template` | The language: `tsx`, `ts`, `jsx`, or `js` |
| `--vite` | Vite with `@zerolith/vite` as the dev server and the build, in place of the command line |
| `--buildless` | The modules deployed as they are behind an import map, in place of a bundle |
| `--example fullstack` | The fullstack example, with its own Node backend, in place of the starter |
| `--yes` | The default for everything the flags leave open, without asking |

The [command line guide](https://zerolith.dev/guide/command-line/#new) covers every question `new` asks and every flag.

## A version of its own

Each version of this package runs the command line of the same version, so a version after the name, as in `npm create zerolith@<version> my-app`, starts a project on that release. Without one, the package manager takes the newest release.

## After the project exists

The project lists `@zerolith/cli` itself, so its npm scripts and `npx zerolith`, as in `npx zerolith add forms` and `npx zerolith upgrade`, run the project's own copy, and this package is not needed again.

## Documentation

- The [command line guide](https://zerolith.dev/guide/command-line/) covers every command the new project runs on, and `zerolith.json`.
- New to zerolith? The [tutorials](https://zerolith.dev/learn/) each build a small app step by step, and the [playground](https://zerolith.dev/playground/) runs code in the browser.

## License

Apache-2.0. See `LICENSE`.
