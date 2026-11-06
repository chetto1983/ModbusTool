# CLAUDE.md

Guida per Claude Code su questo repository. Regole derivate da `chetto1983/Aura` (CLAUDE.md),
adattate a ModbusTool: app desktop **Tauri 2** con backend **Rust** (`src-tauri/`) e frontend
**Svelte + TypeScript** (`src/`). Master e slave Modbus TCP / UDP / RTU / ASCII / RTU-over-TCP.

## Principio: misura, poi documenta, poi implementa

Una decisione architettonica si scrive **dopo** una misura reale, non su una supposizione.
Si misura (test contro un dispositivo o un simulatore vero, build reale, run dell'app), poi
si registra la misura nella spec, poi si implementa. Quando una misura contraddice la spec,
**vince la misura** e la spec si corregge citando data ed evidenza. Ogni misura dichiara anche
**cosa NON dimostra**: un numero senza il suo perimetro è un'altra supposizione travestita.

Corollario: **una suite unitaria verde non chiude niente.** La prova è l'E2E vero: app accesa,
master contro slave reale (o simulatore di riferimento indipendente), traffico verificato.

## Frontend design system

The UI uses the **Aura design system** (user decision 2026-11-05): the tokens of
`chetto1983/Aura` `web/tokens/tokens.json`, copied into `src/app.css` with the same names
(`--color-*`, `--radius-*`, `--font-display|sans|mono`, `--motion-*`), Fraunces for headings,
Atkinson Hyperlegible Next for text, Commit Mono for data, both themes (dark default, light).

- Colours only from the tokens: no hard-coded hex in components.
- Follow Aura's component language: cards on `--color-surface` with `--radius-md` and a
  `--color-border` line; selected rows on `--color-surface-2`; primary actions filled with
  `--color-accent` and `--color-on-accent` text; status colours (`success`, `warning`,
  `danger`, `info`) for state, not for decoration; focus shown with `--color-ring`.
- Sentence-case labels, no letter-spaced uppercase.
- When Aura's tokens change, update `src/app.css` from them; do not fork the palette.

## Interface languages

Every text the user reads comes from `messages/{locale}.json` through Paraglide (`m.key()` from
`src/paraglide/messages.js`, generated: never edit it). English is the base language; every
locale has every key (`npm run check:i18n`, run in CI). Modbus names (tables, function codes,
data types, byte orders) and backend texts stay in English
(`docs/superpowers/specs/2026-11-06-i18n-design.md`). New language: add it to `locales` in
`project.inlang/settings.json` and create its `messages/<locale>.json`.

## Workflow: spec → piano → esecuzione → verifica

- Una spec per decisione in `docs/superpowers/specs/YYYY-MM-DD-<tema>-design.md`.
- Un piano per implementazione in `docs/superpowers/plans/YYYY-MM-DD-<tema>.md`: `Goal`,
  `Architecture`, `Tech Stack`, `Spec`, `Global Constraints`, `Review Focus`,
  `Decisions taken while writing this plan`, `File structure`, task a checkbox con passi TDD e
  comandi di verifica.
- Esecuzione task per task, un commit atomico per task.
- Ogni run di accettazione lascia un file datato in `docs/superpowers/verification/`: cosa ha
  misurato e cosa non dimostra. Una spec chiusa senza il suo file di verifica non è chiusa.

### 3 gate per ogni task

| Gate | Cosa |
|---|---|
| **1 — Definition of Ready** (prima) | Domande aperte chiuse, acceptance verificabile da macchina, test plan, file target ≤600 LOC |
| **2 — Implementation Q&A** (durante) | Gate di validazione verdi (sotto), refactor-on-touch, niente TODO orfani, 3-strike rule |
| **3 — Definition of Done** (dopo) | Acceptance spuntata, E2E reale verde, coverage ≥85%, mutation ≥70% sui file critici, spec aggiornata, file di verifica scritto |

**Niente shortcut.** Niente "lo aggiusto dopo".

## Behavioral rules (apply to every change)

- **NEVER SUPPOSE.** Read code before editing. If uncertain about an API contract, stop and ask.
- **READ THE DOCUMENTATION FIRST — ALWAYS.** Before writing a line against any external system or
  library (Tauri, tokio-modbus, serialport, Svelte, the Modbus specification), read its
  documentation. Probing to discover an API is guessing with extra steps. Cite the page in a code
  comment when the behaviour is surprising.
- **INVENTORY BEFORE INVENTION.** Before writing a component, enumerate what the libraries you
  already depend on ALREADY DO: the public symbol list of the INSTALLED version
  (`~/.cargo/registry/src/*/<crate>-<ver>/src`, `node_modules/<pkg>`), not the landing page.
  Answer BUILD vs REUSE with a grep over the dependency, never with an assumption in either
  direction.
- **STOP BEFORE BESPOKE. ASK, DO NOT ASSUME.** The moment you are about to write a custom
  component, adapter, wrapper or protocol implementation against a dependency: STOP. Post the
  inventory you actually ran and the gap you believe it leaves, and confirm with the human
  BEFORE a line is written. "The docs do not mention it" is NOT evidence of absence.
- **NOT MY WORK.** Bug or gap found → fix on touch. Never skip.
- **READ BEFORE EDIT.** Re-read a file you haven't touched in the last 5 messages.
- **3-STRIKE RULE.** Same failing approach max 3 times. On strike 3, stop and ask.
- **NEVER MODIFY TESTS TO MAKE THEM PASS** unless the test itself is broken. Fix the code, or
  rewrite the test with explicit justification in the commit message.
- **SCOPE CONTROL.** Do exactly what was asked. No unrequested features, refactors or improvements.
- **FOLLOW EXISTING PATTERNS.** Never invent new approaches when codebase patterns exist.
- **NO GOD FILE.** Never create a file >600 LOC (Rust, TS, Svelte). Split by concern
  (`<name>_<concern>.rs`, sub-components). Remove dead code and unused params. DARK CODE IS FORBIDDEN.
- **CODE BASE RULES.** Clean, readable, as simple as the behaviour allows. In case of doubt:
  > Beautiful is better than ugly. Explicit is better than implicit. Simple is better than complex.
  > Complex is better than complicated. Flat is better than nested. Sparse is better than dense.
  > Readability counts. Special cases aren't special enough to break the rules. Although
  > practicality beats purity. Errors should never pass silently. Unless explicitly silenced.
  > In the face of ambiguity, refuse the temptation to guess. There should be one -- and
  > preferably only one -- obvious way to do it. If the implementation is hard to explain, it's a
  > bad idea. If the implementation is easy to explain, it may be a good idea.
- **REUSABLE CODE.** Never duplicate; extract a helper.
- **DEEP REFACTOR ON TOUCH.** Every file you edit gets dead-code removal + duplication folding +
  LOC ≤600 + comments updated in the SAME commit.
- **NO COMMENTS UNLESS WHY IS NON-OBVIOUS.** Names explain what. Comments only for hidden
  constraints, workarounds, surprising behaviour (e.g. a Modbus spec quirk, with the section).
- **NO TEST BABYSITTING.** Realistic fixtures (frames from the Modbus spec examples, real device
  captures), property-based tests for codecs and data-type conversions, no sleeps as sync.
- **NO SKIP-AS-GREEN IN CI.** A test that skips under `$CI` exercises nothing. Integration tests
  that need a resource must fail under `$CI` when it is missing, not skip.
- **COVERAGE FLOOR 85%.** No task closes below 85% measured coverage (Rust: `cargo llvm-cov`;
  TS: `vitest --coverage`). Report the combined figure, not a cherry-picked one.
- **MUTATION ≥70%** on the critical files of each task (Rust: `cargo mutants`): protocol codec,
  framing, data-type conversions.
- **BASELINE OR DROP.** Any heuristic (e.g. RTU frame-gap detection) must be measured against the
  plain spec behaviour on real traffic, or it is dropped.
- **DEFINITION OF DONE.** A job is complete only when validated E2E on a real scenario (app running,
  real master↔slave exchange, ideally against an independent reference implementation).
- **GIT PUSH DISCIPLINE.** Push at the end of a task or completed job, then check that all CI runs
  on the pushed SHA are green. Never leave work only in a local branch.

## Post-edit validation (Gate 2)

After every Rust edit (`src-tauri/`):

- `cargo fmt --check`
- `cargo clippy --all-targets -- -D warnings`
- `cargo test` (CI runs it as `cargo llvm-cov --fail-under-lines 85`)
- Protocol core changes: `cargo mutants` (scope and analysed exclusions in
  `src-tauri/.cargo/mutants.toml`)

After every frontend edit (`src/`):

- `npm run check` (svelte-check + TypeScript)
- `npm run lint` (oxlint, zero warnings) and `npm run format:check` (prettier)
- `npm run deadcode` (knip) and `npm run dup` (jscpd)
- `npm run coverage` (vitest, fails below 85%)
- `npm run build`

Repository-wide: `npm run file-size` (600-LOC cap). The lefthook hooks (`npx lefthook install`)
run a fast subset on commit and push; CI runs all of them, plus CodeQL, the security audit and,
on master, the Mutation workflow.

Fix issues before moving on.

## Commit discipline

- One task = one atomic commit (or N with the atomicity stated in the plan).
- Conventional Commits: `type(scope): subject`, imperative subject + body explaining *why*.
- Behaviour changes update `CHANGELOG.md`; the section of a pushed `vX.Y.Z` tag is the release text.
- Co-Authored-By trailer per project convention.
- Spec-amendment commit before the code commit when a task revealed an architectural gap.
