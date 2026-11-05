# Third-Party Notices

ModbusTool is MIT-licensed. It ships the third-party material below. Keep this file in sync when
a bundled asset or a direct runtime dependency is added, removed or changes license.

## Bundled assets

### Fonts

- Fraunces — Copyright 2018 The Fraunces Project Authors, <https://github.com/undercasetype/Fraunces>
- Atkinson Hyperlegible Next — Copyright 2020-2024 The Atkinson Hyperlegible Next Project Authors,
  <https://github.com/googlefonts/atkinson-hyperlegible-next>
- Commit Mono — Copyright (c) 2023 Eigil Nikolajsen, <https://github.com/eigilnikolajsen/commit-mono>
- License: SIL Open Font License 1.1, full text in
  [`src/assets/fonts/OFL.txt`](src/assets/fonts/OFL.txt).
- Use: copied unmodified from Aura (`web/public/fonts`). The OFL forbids selling the fonts on
  their own and reusing their reserved names for modified versions.

### Design tokens

- Source: <https://github.com/chetto1983/Aura> `web/tokens/tokens.json`, same owner.
- Use: colour, radius, font and motion values copied into `src/app.css`.

## Direct runtime dependencies

Linked into the application binary or the frontend bundle. Transitive dependencies carry their
own licenses in their packages.

| Dependency | License | Source |
|---|---|---|
| rmodbus | Apache-2.0 | <https://github.com/alttch/rmodbus> |
| serialport | MPL-2.0 | <https://github.com/serialport/serialport-rs> |
| tauri, tauri-plugin-dialog, tauri-plugin-fs | Apache-2.0 OR MIT | <https://github.com/tauri-apps> |
| serde, serde_json | MIT OR Apache-2.0 | <https://github.com/serde-rs> |
| @tauri-apps/api, @tauri-apps/plugin-dialog, @tauri-apps/plugin-fs | Apache-2.0 OR MIT | <https://github.com/tauri-apps> |
| uPlot | MIT | <https://github.com/leeoniya/uPlot> |

`serialport` is MPL-2.0, a file-level copyleft: it is used unmodified from crates.io, where its
source is available. A change to its files would have to be published under MPL-2.0.

## Agent skills (repository only, not shipped)

`.claude/skills/` holds skills for coding agents copied unmodified from Aura's `.claude/skills/`:
`ask-questions-if-underspecified`, `code-maturity-assessor`, `find-skills`, `mutation-testing`,
`property-based-testing`, `skill-creator`. `skill-creator` carries its Apache-2.0 license in
`LICENSE.txt`; `code-maturity-assessor` credits Trail of Bits. Aura does not record the upstream
source of the others: check before redistributing them outside this repository.
