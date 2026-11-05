# Security Policy

ModbusTool talks to industrial devices: as a master it writes coils and registers, as a slave it
answers anyone who can reach its port. Modbus itself has no authentication or encryption, so the
tool must never make a network or a device easier to reach than the user intended.

## Supported versions

Only the **latest commit on `master`** and the latest release receive security fixes. The
C# releases (v2.x and earlier) are no longer maintained.

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Report privately through **GitHub Security Advisories**: the "Report a vulnerability" button
under the repository's **Security** tab.

Please include: affected component or file, the impact, and the minimal steps or
proof-of-concept to reproduce. If you have a suggested fix, include it.

### What to expect

- **Acknowledgement** within 72 hours.
- An initial assessment (severity and whether accepted) within 7 days.
- Coordinated disclosure: we agree a timeline with you before any public write-up, and credit
  you unless you prefer to remain anonymous.

## In scope

- **Frame parsing** — a crafted Modbus frame (TCP, UDP, RTU, ASCII) that crashes the app, hangs
  a listener, exhausts memory or corrupts the slave tables of other units.
- **Unintended exposure** — the slave listening on an interface or port other than the one
  configured, or staying open after it is stopped.
- **File handling** — project or CSV files that read or write outside the path chosen in the
  dialog, or that execute code when opened.
- **Webview** — content injected into the UI from frames, labels or files (XSS), or access from
  the webview to Tauri commands beyond those listed in `src-tauri/capabilities/`.
- **Supply chain** — vulnerable or malicious dependencies (tracked by `cargo audit`,
  `npm audit`, CodeQL and Dependabot).

## Out of scope

- The lack of authentication in the Modbus protocol itself.
- Devices or simulators on the other side of the connection.
- Attacks that need control of the machine ModbusTool runs on.
