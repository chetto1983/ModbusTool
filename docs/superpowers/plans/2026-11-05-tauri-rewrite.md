# Piano — ModbusTool 3 (Tauri + Rust)

**Goal:** sostituire l'app WinForms con un'app Tauri master+slave con le funzioni della spec.

**Architecture:** codec `rmodbus`; I/O bloccante su thread std; eventi Tauri verso Svelte;
conversioni tipi dati e simulazione nel frontend.

**Tech Stack:** Rust 2021, Tauri 2, rmodbus 0.13, serialport 4; Svelte 5, TypeScript 5.9,
Vite 8, Vitest, uPlot; font bundle via @fontsource (app offline).

**Spec:** `docs/superpowers/specs/2026-11-05-tauri-rewrite-design.md`

**Global Constraints:** file ≤600 LOC; gate di `CLAUDE.md` verdi a ogni task; un commit per task;
nessun codice protocollo scritto a mano (D3).

**Review Focus:** lettura frame da stream (timeout, frame spezzati, byte spuri), multi-unit slave,
broadcast, chiusura pulita dei thread.

**Decisions taken while writing this plan:**
- Storage slave: `ModbusStorage<65536, 65536, 65536, 65536>` in `Box`, uno per unit (≈384 KB).
- Test seriali con coppie di pseudo-terminali (`serialport::TTYPort::pair`), solo Unix.
- Verifica di riferimento con pymodbus (implementazione indipendente) in Python.

## File structure

Vedi spec §Architettura. Root: `package.json`, `vite.config.ts`, `index.html`, `src/`,
`src-tauri/`, `.github/workflows/ci.yml`, `README.md`.

## Task

- [ ] **T1 Scaffold**: rimuovi C#; Tauri 2 + Svelte 5 + TS; CI (fmt, clippy, test, svelte-check,
  vitest, build Linux/Windows/macOS). Verifica: `cargo test`, `npm run check`, `npm run build`.
- [ ] **T2 Link + frame_io + describe**: test su frame dagli esempi della specifica, frame
  spezzati, timeout, ASCII.
- [ ] **T3 Slave core**: server TCP/UDP/RTU-over-TCP/RTU/ASCII, multi-unit, broadcast, ritardo,
  stop pulito. Test di integrazione via loopback e pseudo-terminali.
- [ ] **T4 Master core + poller**: transazioni con retry/timeout; test contro lo slave di T3 su
  tutti i link.
- [ ] **T5 Comandi Tauri + eventi traffico**.
- [ ] **T6 Frontend base**: tema chiaro/scuro, font, layout, `api.ts`, `datatypes.ts` (+ test
  property-based), `csv.ts`, `project.ts`.
- [ ] **T7 Vista Master**: connessione, poll multipli, griglia con tipi dati, scritture, statistiche.
- [ ] **T8 Vista Slave**: unit, griglia editabile, simulazione, import/export.
- [ ] **T9 Traffico + Trend + Progetto**.
- [ ] **T10 Verifica E2E**: app accesa, pymodbus come master contro il nostro slave e come slave
  contro il nostro master; coverage ≥85%, mutation ≥70% su `frame_io`/`slave`/`master`/
  `datatypes`; file in `docs/superpowers/verification/`; README.
