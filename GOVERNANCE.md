# Governance

This document describes how decisions are made in the zerolith project and how people gain responsibility in it. It is deliberately published before the first release so that contributors and adopters can read the rules before they depend on them.

## Roles

| Role | Who | What they can do |
| --- | --- | --- |
| Contributor | Anyone who has had a pull request merged | Open issues and pull requests, participate in RFC discussion |
| Member | Contributors with three merged non-trivial pull requests, invited by a maintainer | Triage issues, review pull requests, be assigned work |
| Maintainer | Members who have reviewed and merged regularly for at least three months, confirmed by the existing maintainers | Merge pull requests, approve RFCs, cut pre-releases |
| Release manager | Maintainers with publish rights to npm and crates.io | Publish stable releases, rotate signing and publishing credentials |
| Project lead | molexxxx, until a steering group of at least three maintainers exists | Final say on RFCs that do not reach consensus, appoint and remove maintainers |

Role grants and removals are recorded in `MAINTAINERS.md` once more than one person holds a role. Inactivity for six months moves a maintainer to emeritus status; emeritus maintainers can return by asking.

## Decisions

Day-to-day changes (bug fixes, documentation, internal refactors, additive changes within an existing design) are decided by pull request review: one maintainer approval merges, two for anything that touches the public API or a policy document.

Anything that changes the public API, the policies in `docs/policy/`, the supported platforms, or a dependency of a published package goes through an RFC:

1. Open a pull request adding `docs/rfcs/NNNN-short-title.md` from the template in `docs/rfcs/0000-template.md`. The RFC states the problem, the proposed design with code samples, alternatives considered, the migration path and codemod if any API changes, and the effect on bundle size and the agent index.
2. Discussion happens on the pull request. Maintainers may request a prototype on a branch before deciding.
3. When a maintainer believes consensus is reached, they start a final comment period of seven calendar days by labeling the pull request `final-comment-period`.
4. If no maintainer objects during the period, the RFC is merged as accepted; if an objection stands, the project lead decides and records the reasoning in the RFC.
5. Accepted RFCs are implemented in separate pull requests that link back to the RFC; the RFC file is updated with the shipping version.

The project lead's final say exists to prevent deadlock, not to bypass discussion. The intent is to replace it with a steering group vote as soon as three maintainers exist.

## Scope of the project

The project maintains the packages in this repository and the documentation site. Community packages are listed in the ecosystem directory once they meet the adapter contract, but are governed by their own maintainers.

## Code of conduct

The [Code of Conduct](CODE_OF_CONDUCT.md) applies to every project space. Reports go to the contact listed there; the project lead handles reports, and a maintainer who is the subject of a report is excluded from handling it.

## Changing this document

This document changes by RFC.
