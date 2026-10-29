# @zerolith/cli

The `zerolith` command line from npm. The binary is written in Rust; this package carries none itself and depends optionally on one package per platform, so npm installs only the binary that matches the machine.

```
npm install --save-dev @zerolith/cli@alpha
npx zerolith new my-app
npx zerolith dev .
```

Prebuilt binaries exist for Linux (glibc), macOS, and Windows on x64 and arm64. On any other system, or on Alpine and other musl distributions, install the crate with `cargo install zerolith` and point `ZEROLITH_BINARY_PATH` at the binary; the shim runs that instead. Installing with `--omit=optional` leaves the binary out, and the shim says which platform package to install.

The commands are documented in the [command line guide](https://github.com/molexxxx/zerolith/blob/main/docs/guide/command-line.md).
