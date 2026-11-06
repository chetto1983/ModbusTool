# Changelog

Notable changes to ModbusTool, newest first. Each section is also the text of its
[GitHub release](https://github.com/chetto1983/ModbusTool/releases): the Release workflow
publishes the section whose heading matches the pushed `vX.Y.Z` tag. The full history is in git.

## Unreleased

### Added

- Dashboard trends choose how samples are joined: steps (held value), straight lines or a smooth
  curve. New trends use straight lines; trends saved by 3.2.0 keep their steps.

- Scaling as SCADA tags do it: a variable maps a raw range to an engineering range
  (e.g. 0..27648 to 0..100 %), optionally kept to that range. Every panel shows engineering values,
  and command panels write them back raw, so a setpoint is typed in its own units.

### Changed

- The value panel's scale and offset are replaced by the scaling of its variable; projects that
  used them are converted.
- Dashboards read their own variables and no longer depend on the master's polls. Each panel
  element sets its unit, table, address, type and byte order. The variables are read while the
  master is connected, at a period set for each dashboard. Command panels show the state read
  back from the address they write, or from another variable.
- Projects saved by 3.2.0 are converted when opened: each value taken from a poll becomes the
  variable that poll read.
- The value panel's "Unit" field is now "Unit of measure", so it cannot be confused with the
  Modbus unit id.

## v3.2.0 — 2026-11-06

Dashboards: a mini-SCADA view, Grafana style, with panels that show what the master's polls read
and write values through the master.

### Added

- Dashboard view: several named dashboards, saved in the project file. In edit mode panels are
  added, dragged by their title and resized on a 12-column grid.
- Panels: trend, value (unit, scale, decimals, warning and alarm colours, optional gauge), bars,
  lamp, button (with optional confirmation), switch, selector (options that write their value)
  and number input (a setpoint with optional min and max).
- Writes are disabled while the master is not connected; a failed write shows a notice.

## v3.1.2 — 2026-11-06

Windows: the language menu now changes the interface language, and the app talks to its backend
without the Content Security Policy errors.

### Fixed

- Windows: changing the language had no effect (the choice was saved but the texts stayed in
  English, also after a restart): the build held two copies of the translation runtime.
- Windows: every call to the backend first failed on the Content Security Policy (the IPC channel
  `http://ipc.localhost` was not allowed) and was retried through a slower fallback.

## v3.1.1 — 2026-11-06

Readable drop-down lists on Windows, and unexpected errors shown instead of passing silently. The
first version that 3.1.0 can install by itself.

### Added

- Unexpected errors are shown as a notice instead of passing silently.

### Fixed

- Windows: the open list of every drop-down was white with light text in the dark theme, so
  options were hard to read.

## v3.1.0 — 2026-11-06

Interface in Italian, editors in a dialog, a trend that shows polled values as they are, and the
first version that can update itself. Install it by hand once: 3.0.0 has no updater.

### Added

- Updates: at the first start ModbusTool asks whether to check GitHub for new versions (at start
  and every 6 hours); *Updates* in the sidebar changes that and checks on demand. A new version
  is offered with its notes and installed only on *Install and restart*, after stopping the
  master and the slave. Updates are verified with the project's update key (MSI, .deb, AppImage).
- Interface in English and Italian, chosen in the sidebar and remembered; the first start
  follows the system language. Other languages need only a messages file.

### Changed

- Trend: values are drawn as steps (a polled value holds until the next sample), so square waves
  no longer look like triangles; time window 10 s to 10 min; 24-hour time axis. Each series keeps
  the last 10 minutes instead of the last 600 samples.
- The Connection (master) and Listener (slave) panels fold away by clicking their title.
- Polls and simulation generators are edited in a dialog with Save and Cancel; the sidebar keeps
  a compact list. A running poll restarts once on save, only if what it reads changed.

### Fixed

- Float64 values are shown exactly; the largest ones showed as Infinity.
- Master: the poll editor no longer spills out of the Polls panel when the sidebar is short;
  the sidebar scrolls instead.

## v3.0.0 — 2026-11-05

A rewrite of the C# WinForms tool as one Tauri desktop app for both roles, on Windows and Linux.
Nothing is shared with v2: projects and settings do not carry over, the CSV export of v2 can
be imported.

### New

- Master and slave in one window, over Modbus TCP, UDP, RTU over TCP, RTU serial and ASCII serial.
- Several polls at the same time, each with its own unit, function, range and interval, with
  statistics (requests, errors, timeouts, response time); timeout and retries.
- Slave with several unit ids, broadcast writes, response delay and value generators (sine,
  ramp, random, square).
- Data types UInt16 to Float64 and ASCII with byte orders ABCD, CDAB, BADC, DCBA; labels per
  register.
- Traffic monitor frame by frame with decoded descriptions and CSV export; live trend chart.
- Projects saved as JSON; dark and light theme in the Aura design system.
- Windows installer as an MSI; Linux as .deb and AppImage.

### Known limits

- Over TCP/UDP a read is limited to 123 registers and the slave accepts writes of up to 121
  (the protocol allows 125 and 123): the rmodbus codec caps frames at 255 bytes.
- No FC22/FC23, no device identification (FC 0x2B), no parity mark/space or 1.5 stop bits.
- No macOS installer: build from source with `npx tauri build`.

### Licensing

- MIT, replacing the Apache-2.0 license of the C# code, which v3 does not contain.
