# Support

zerolith is in alpha. Every package is published to npm under the `alpha` dist-tag, and the command line to crates.io as well, but the API is still settling and there is no supported release line: fixes ship in the next alpha and are not backported. The [support policy](docs/policy/support.md) describes the window that starts with the first stable release.

## Getting help

- **Questions, ideas, and show-and-tell:** [GitHub Discussions](https://github.com/molexxxx/zerolith/discussions).
- **Something is broken:** open a [bug report](https://github.com/molexxxx/zerolith/issues/new/choose) with the diagnostic code if there is one. Every runtime error carries a code with its own page in the [diagnostics guide](docs/guide/diagnostics.md).
- **A security problem:** follow [SECURITY.md](SECURITY.md) and report it privately.

## Before you ask

- The [guides](docs/guide/index.md) cover each part of the framework, and every example in them runs as a test.
- `zerolith doctor` checks a buildless project's import map and integrity hashes.
- The [roadmap](docs/ROADMAP.md) lists what exists today and what is planned, which answers most "does it do X yet" questions.
- The [changelog](CHANGELOG.md) lists what changed in each alpha, breaking changes included.
