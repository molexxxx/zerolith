# Security policy

## Reporting a vulnerability

Report vulnerabilities privately; do not open a public issue.

- Preferred: GitHub private vulnerability reporting on this repository, once the repository is public.
- Otherwise: email molex@sent.com with "zerolith security" in the subject.

You will receive an acknowledgment within three business days and a triage decision within ten. The project follows coordinated disclosure with a 90-day window from acknowledgment; fixes for confirmed issues ship earlier whenever possible, and the window is extended only by agreement with the reporter. Credit is given in the advisory unless you ask otherwise. There is no bug bounty.

## Supported versions

Security fixes are published for every release line inside the support window described in [docs/policy/support.md](docs/policy/support.md). Pre-release channels (canary, experimental) receive fixes on their next build and are not backported.

## What the runtime guarantees

These are the properties the runtime is designed and tested to hold. A violation of any of them is a security bug.

- Templates never evaluate strings as code. The runtime works under a Content Security Policy of `script-src 'self'` with no `unsafe-inline` and no `unsafe-eval`, and under `require-trusted-types-for 'script'` with a single named policy.
- Interpolated values are inserted as text or attribute values, never parsed as markup. Raw HTML is possible only through an explicitly named, documented API that takes a marked value.
- `javascript:` and other scriptable URL schemes are rejected in `href`, `src`, `action`, and `formaction` bindings unless explicitly allowed per binding.
- Published runtime packages have no runtime dependencies, no install scripts, and are published with npm provenance from this repository's release workflow.

## Supply chain

- Every published package is built in CI from a tagged commit and published with provenance attestations (npm trusted publishing).
- A CycloneDX SBOM is produced for every release and attached to the GitHub release.
- GitHub Actions are pinned to commit SHAs and updated through reviewed pull requests.
- OpenSSF Scorecard runs on the default branch and its results are public.
