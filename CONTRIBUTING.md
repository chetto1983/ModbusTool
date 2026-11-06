# Contributing to ModbusTool

Thanks for your interest. [`CLAUDE.md`](CLAUDE.md) is the working contract for people and coding
agents alike: read it before a non-trivial change. Decisions live in
`docs/superpowers/specs/`, implementation plans in `docs/superpowers/plans/`, dated acceptance
runs in `docs/superpowers/verification/`. Measure first, then record, then implement.

## Prerequisites

- **Rust** stable and **Node.js** (version in [`.node-version`](.node-version)).
- Linux: `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libudev-dev`.
- For the end-to-end run: `tauri-driver` (`cargo install tauri-driver`), `WebKitWebDriver`
  (`webkit2gtk-driver`), `socat`, Python 3 with `pymodbus`, an X display (Xvfb works).

## One-time setup

```bash
npm ci
npx lefthook install   # pre-commit / pre-push hooks
```

## Develop

```bash
npx tauri dev                          # app with hot reload
npx tauri build                        # installers in src-tauri/target/release/bundle
npx tauri build --debug --no-bundle && npm run e2e   # real app against pymodbus
```

## The quality gate

Every change must pass the same gates CI enforces:

```bash
npm run check && npm run lint && npm run check:i18n && npm run format:check && npm run deadcode && npm run dup
npm run coverage        # vitest, fails below 85%
npm run file-size       # no source file over 600 lines
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings
cargo llvm-cov --fail-under-lines 85
```

The lefthook hooks run a fast subset automatically: rustfmt, clippy, oxlint, prettier,
svelte-check and the file-size cap on commit; cargo test, vitest, knip and jscpd on push.
Mutation testing (`cargo mutants` in `src-tauri/`, `npm run mutation`) runs in the Mutation
workflow on master and weekly; a new surviving mutant fails it unless it is analysed and
excluded with its reason in `src-tauri/.cargo/mutants.toml`.

Discipline that reviewers check (full list in `CLAUDE.md`):

- **No file > 600 LOC.** Refactor on touch.
- **Coverage floor 85%**, Rust and frontend.
- **Tests are real:** frames from the Modbus specification, property-based tests for codecs and
  conversions, protocol changes checked against pymodbus. No skipped test to hide a failure.
- **Mutation ≥ 70%** on the protocol core and the conversions.
- **UI uses the Aura design tokens** only.

## Commits & PRs

- **Conventional Commits**: `type(scope): subject`, e.g. `feat(master): …`, `fix(rtu): …`,
  `docs(spec): …`. Imperative subject; the body explains *why*.
- Keep PRs focused and fill in the PR template checklist. Green CI (rust, frontend, file-size,
  bundles, CodeQL, security audit) is required to merge.
- Update [`CHANGELOG.md`](CHANGELOG.md) when behaviour changes; its section becomes the release
  notes. Releasing and Windows code signing: [`docs/signing.md`](docs/signing.md).

## Reporting security issues

**Do not open a public issue.** Follow [`SECURITY.md`](SECURITY.md).
