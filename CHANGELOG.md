# Changelog

Notable changes to ModbusTool, newest first. Each section is also the text of its
[GitHub release](https://github.com/chetto1983/ModbusTool/releases): the Release workflow
publishes the section whose heading matches the pushed `vX.Y.Z` tag. The full history is in git.

## Unreleased

### Fixed

- Master: the poll editor no longer spills out of the Polls panel when the sidebar is short;
  the sidebar scrolls instead.

### Changed

- The Connection (master) and Listener (slave) panels fold away by clicking their title.

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
