# Verifica: lingua della webview con locale C (Linux)

Data: 2026-11-06. Spec: `docs/superpowers/specs/2026-11-06-linux-locale-design.md`.

## Cosa è stato misurato

- **Riproduzione del difetto**: build debug senza correzione, utente non-root, `LANG=C.UTF-8`,
  Xvfb. `navigator.language = "C"`, `Intl.NumberFormat("C")` lancia `RangeError`, `#app` vuoto.
  Reimportando il bundle con un parametro diverso, l'errore viene da `NumberFormat` nel codice di
  modulo di uPlot.
- **Correzione**: stessa macchina, build debug con `src-tauri/src/webview_locale.rs`.
  - `LANG=C.UTF-8` → `"en-US"`, app montata.
  - `LANG=POSIX` → `"en-US"`, app montata.
  - `LANG=it_IT.UTF-8` → `"it-IT"` invariato, app montata.
- **E2E completo contro pymodbus** (`node e2e/run.mjs`):
  - 88/88 da utente non-root con `LANG=C.UTF-8`, le condizioni del runner CI;
  - 88/88 da root.
- **Test unitari**: `fallback_language` per C, C.UTF-8, C.utf8, POSIX, C@euro (→ `en-US`) e per
  it_IT, en_US, de, ca_ES e una lista vuota (→ nessun cambio).
- **Gate**: `cargo fmt --check`, `cargo clippy -D warnings`, `cargo llvm-cov` al 93,7% delle
  righe. `apply()` non è coperta da test unitari, perché richiede una webview; la copre l'E2E.

## Cosa NON dimostra

- Solo WebKitGTK 2.52.6 su Ubuntu 24.04 sotto Xvfb: non WSL2, non una sessione desktop reale.
- `cargo mutants` non eseguito su `webview_locale.rs`: il file non tocca il protocollo, il framing
  né le conversioni dei tipi, e la sua unica decisione è coperta dai test qui sopra.
- La CI su questo commit è la prima prova sul runner reale.
