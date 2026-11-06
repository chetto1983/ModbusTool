# Changelog

Notable changes to ModbusTool, newest first. Each section is also the text of its
[GitHub release](https://github.com/chetto1983/ModbusTool/releases): the Release workflow
publishes the section whose heading matches the pushed `vX.Y.Z` tag. The full history is in git.

## Unreleased

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
