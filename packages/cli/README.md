# @zerolith/cli

The `zerolith` command line from npm: `new`, `dev`, `serve`, `build`, `importmap`, and `doctor`. The binary is written in Rust; this package carries none itself and depends optionally on one package per platform, so npm installs only the binary that matches the machine.

Start a project with nothing installed; the project it writes lists this package, so its scripts find the binary:

```
npx @zerolith/cli@alpha new my-app
cd my-app
npm install
npm run dev
```

Or add it to an existing project and call it through `npx`:

```
npm install --save-dev @zerolith/cli@alpha
npx zerolith doctor .
```

Prebuilt binaries exist for Linux (glibc), macOS, and Windows on x64 and arm64. On any other system, or on Alpine and other musl distributions, install the crate with `cargo install zerolith` and point `ZEROLITH_BINARY_PATH` at the binary; the shim runs that instead. Installing with `--omit=optional` leaves the binary out, and the shim says which platform package to install.

The commands are documented in the [command line guide](https://molexxxx.github.io/zerolith/guide/command-line/).

Status: alpha. The commands and their flags may change before 1.0.

## License

Apache-2.0. See `LICENSE`.
