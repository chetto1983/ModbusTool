# Piano — editor in un modal

**Goal:** poll e generatori modificati in un modal riusabile con Salva/Annulla.

**Architecture:** `Modal.svelte` (`<dialog>`, form, slot azioni); `PollForm.svelte` e
`SimulationForm.svelte` modificano una bozza; `savePoll`/`saveRule` applicano la bozza.

**Tech Stack:** Svelte 5, `<dialog>` nativo, Paraglide per i testi.

**Spec:** `docs/superpowers/specs/2026-11-06-modal-editors-design.md`

**Global Constraints:** file ≤600 LOC; gate di `CLAUDE.md`; testi in `messages/` (en, it).

**Review Focus:** la bozza non deve toccare il progetto prima di Salva; riavvio e azzeramento
del trend solo quando servono (E3); selettori E2E.

**Decisions taken while writing this plan:**
- `addPoll`/`redefinePoll` sostituite da `newPoll` (bozza) + `savePoll`; i test usano le nuove.
- Il modal è montato solo quando c'è una bozza: montato = aperto.

## Task

- [x] **T1 Modal + poll**: `Modal.svelte`, `PollForm.svelte`, `PollList.svelte`, `savePoll`,
  test. Verifica: gate frontend.
- [x] **T2 Generatori**: `SimulationForm.svelte`, lista compatta, `saveRule`/`removeRule`, test.
- [x] **T3 E2E**: scenari aggiornati al modal; file di verifica.
