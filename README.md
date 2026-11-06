# ModbusTool

A Modbus **master and slave** tool for Windows and Linux (macOS can be built from source).
Version 3 is a full rewrite of the WinForms tool as a [Tauri](https://tauri.app) desktop app:
Rust backend, Svelte frontend, one window for both roles.

![Master view](docs/screenshots/master-dark.png)

## Features

**Links** — Modbus TCP, Modbus UDP, RTU over TCP, RTU serial, ASCII serial.

**Master**
- Functions FC01–FC06, FC15, FC16.
- Several polls running at the same time, each with its own unit, function, address range and
  interval; per-poll statistics (requests, ok, errors, timeouts, response time).
- Edit values in the grid to write them (FC05 for coils, FC06 for one register, FC16 for more).
- Timeout and retries.

**Slave**
- Several unit ids, each with its own four tables of 65 536 elements.
- Response delay, broadcast writes (unit 0).
- Value generators: sine, ramp, random, square wave.
- CSV import/export (also reads the ModbusTool 2 export format `4100:0x04c8,4101:12,...`).

**Both**
- Data types: UInt16, Int16, Hex, Binary, UInt32, Int32, Float32, UInt64, Int64, Float64, ASCII,
  with byte orders ABCD, CDAB, BADC, DCBA. Labels per register.
- Traffic monitor, frame by frame, with decoded descriptions, filters and CSV export.
- Live trend chart of any value.
- Projects saved as JSON (`Ctrl+S`, `Ctrl+O`). Dark and light theme, same design as Aura.
- Interface in English and Italian, chosen in the sidebar.

| Slave | Traffic monitor |
|---|---|
| ![Slave](docs/screenshots/slave-dark.png) | ![Traffic](docs/screenshots/traffic-dark.png) |

## Install

Download the installer for your system from the
[latest release](https://github.com/chetto1983/ModbusTool/releases/latest).

**Windows** — `ModbusTool_<version>_x64_en-US.msi`. Until code signing is active (see
[Code signing policy](#code-signing-policy)) the installer is not signed: when SmartScreen stops
it, choose *More info → Run anyway*. WebView2 is needed; Windows 10 and 11 usually have it,
otherwise the installer downloads it.

**Linux** — on Debian/Ubuntu `sudo apt install ./ModbusTool_<version>_amd64.deb`, elsewhere
`chmod +x ModbusTool_<version>_amd64.AppImage` and run it. For serial ports add your user to the
`dialout` group (`sudo usermod -aG dialout $USER`) and log in again.

**macOS** is not built in CI: run `npx tauri build` on a Mac.

**Updates** — from version 3.1 ModbusTool can update itself. At the first start it asks whether
to check for new versions automatically (at start and every 6 hours); *Updates* in the sidebar
changes that choice and checks on demand. A new version is offered with its release notes and
installed only when you choose *Install and restart*. Updates are verified with the project's
update key before they are installed. Version 3.0.0 has no updater: install 3.1 by hand once.

## Known limits

Measured with tests, see `docs/superpowers/specs/2026-11-05-tauri-rewrite-design.md`:

- Over TCP/UDP a single read is limited to 123 registers (the protocol allows 125) and the slave
  accepts writes of up to 121 registers: the frame codec ([rmodbus](https://crates.io/crates/rmodbus))
  caps frames at 255 bytes.
- The slave does not answer FC 0x2B (device identification) over TCP.
- FC22 (mask write) and FC23 (read/write multiple) are not supported yet.
- Serial parity mark/space and 1.5 stop bits are not available.

## Code signing policy

Windows releases are to be signed through the SignPath Foundation's free program for open-source
projects: *Free code signing provided by [SignPath.io](https://signpath.io), certificate by
[SignPath Foundation](https://signpath.org)*. **Status:** application pending; until it is accepted,
releases are published unsigned. How signing is set up: [docs/signing.md](docs/signing.md).

- Only the installer built by this repository's [Release workflow](.github/workflows/release.yml)
  on GitHub-hosted runners, from the tagged source, is signed.
- **Authors** (committers): [@chetto1983](https://github.com/chetto1983).
- **Reviewers**: changes from anyone else are reviewed by an author before they are merged.
- **Approvers**: every signing request is approved by [@chetto1983](https://github.com/chetto1983).

**Privacy:** this program will not transfer any information to other networked systems unless
specifically requested by the user or the person installing or operating it. ModbusTool connects
only to the Modbus devices and ports the user configures, and, only if the user allows it at the
first start or under *Updates*, to github.com to read the list of published versions and
download the one the user chooses to install. No data about the user or the computer is sent.

## Development

Requirements: Rust (stable), Node.js 22, and on Linux
`libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libudev-dev`.

```sh
npm ci
npx tauri dev            # run the app with hot reload
npx tauri build          # installers in src-tauri/target/release/bundle
```

Translations: the texts are in `messages/{locale}.json`. To add a language, add its code to
`locales` in `project.inlang/settings.json`, copy `messages/en.json` to `messages/<code>.json` and
translate it; `npm run check:i18n` reports missing or unused messages.

Checks (the same as CI, see [CONTRIBUTING.md](CONTRIBUTING.md)):

```sh
npx lefthook install   # runs the fast checks on commit and push
npm run check && npm run lint && npm run check:i18n && npm run format:check && npm run deadcode && npm run dup
npm run coverage && npm run file-size && npm run build
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

End-to-end run of the real app against [pymodbus](https://github.com/pymodbus-dev/pymodbus) as an
independent implementation (Linux; needs `tauri-driver`, `WebKitWebDriver`, `socat`, `pymodbus`):

```sh
npx tauri build --debug --no-bundle
node e2e/run.mjs docs/screenshots
```

Project rules for contributors and coding agents are in [CLAUDE.md](CLAUDE.md); security
reports follow [SECURITY.md](SECURITY.md); changes are listed in [CHANGELOG.md](CHANGELOG.md).

## License

MIT, see [LICENSE](LICENSE). Version 3 shares no code with the earlier C# releases, which were
published under the Apache License 2.0 and remain so in the git history.

The interface follows the design tokens of [Aura](https://github.com/chetto1983/Aura). Bundled
fonts (Fraunces, Atkinson Hyperlegible Next, Commit Mono) are under the SIL Open Font License 1.1,
see [src/assets/fonts/OFL.txt](src/assets/fonts/OFL.txt).
