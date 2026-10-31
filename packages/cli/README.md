# @zerolith/cli

The `zerolith` command line from npm: `new`, `dev`, which serves a project with its packages resolved from `node_modules` and forwards its API to a backend, `serve`, `build`, which bundles and minifies an application with Rolldown compiled into the binary, `preview`, `importmap`, and `doctor`. The binary is written in Rust; this package carries none itself and depends optionally on one package per platform, so npm installs only the binary that matches the machine.

Install it once and start a project. `new` asks a few questions, each with a default, writes the starter, and installs its dependencies, this package among them:

```
npm install --global @zerolith/cli@alpha
zerolith new my-app
cd my-app
zerolith dev
```

Without a global install, `npx @zerolith/cli@alpha new my-app` does the same, and inside the project `npx zerolith dev` and its npm scripts run the copy it lists.

Or add it to an existing project and call it through `npx`:

```
npm install --save-dev @zerolith/cli@alpha
npx zerolith doctor .
```

Prebuilt binaries exist for Linux (glibc), macOS, and Windows on x64 and arm64. On any other system, or on Alpine and other musl distributions, install the crate with `cargo install zerolith` and point `ZEROLITH_BINARY_PATH` at the binary; the shim runs that instead. Installing with `--omit=optional` leaves the binary out, and the shim says which platform package to install.

The commands are documented in the [command line guide](https://molexxxx.github.io/zerolith/guide/command-line/).

Status: alpha. The commands and their flags may change before 1.0.

## Documentation

- The [command line guide](https://molexxxx.github.io/zerolith/guide/command-line/) covers every command and option, and `zerolith.json`.
- [Building and serving](https://molexxxx.github.io/zerolith/guide/deploying/) covers what the build writes and how to serve it from a static host, a web server, or a backend.
- New to zerolith? The [tutorial](https://molexxxx.github.io/zerolith/learn/) builds an app step by step, and the [playground](https://molexxxx.github.io/zerolith/playground/) runs code in the browser.

## License

Apache-2.0. See `LICENSE`.
