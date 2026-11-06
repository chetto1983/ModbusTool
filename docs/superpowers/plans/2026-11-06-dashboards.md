# Piano — dashboard (mini-SCADA)

**Goal:** vista Dashboard con pannelli configurabili su griglia trascinabile, salvata nel progetto.

**Architecture:** `src/lib/dashboards.ts` (tipi, valori predefiniti, validazione del progetto),
`src/lib/signals.svelte.ts` (valore attuale e storico per segnale, dai risultati dei poll),
`src/lib/dashboardActions.svelte.ts` (creare/modificare/eliminare dashboard e pannelli, scritture),
componenti `DashboardView`, `DashboardGrid` (gridstack), `PanelFrame`, un componente per tipo di
pannello, `PanelForm` nel modal esistente.

**Tech Stack:** Svelte 5, gridstack 14.0.0, uPlot 1.6.32, Paraglide.

**Spec:** `docs/superpowers/specs/2026-11-06-dashboards-design.md`

**Global Constraints:** file ≤600 LOC; token Aura; testi in `messages/` (en, it); gate di
`CLAUDE.md`; coverage ≥85%.

**Review Focus:** i progetti esistenti si aprono ancora; nessuna scrittura senza master connesso;
lo storico non cresce senza limite; gridstack e Svelte non si contendono il DOM.

**Decisions taken while writing this plan:**
- Il campo `dashboards` è opzionale nel progetto: nessun cambio di versione del file.
- Lo storico per segnale sostituisce quello interno di `master.trend`, che diventa una vista.

## Task

- [ ] **T1 Modello**: tipi, default, validazione in `parseProject`, test (incluso il progetto senza
  `dashboards`).
- [ ] **T2 Segnali**: valore attuale e storico per segnale, aggiornati da `applyPollResults`; il
  trend del master li usa; test.
- [ ] **T3 Vista e griglia**: voce "Dashboard", elenco/crea/rinomina/elimina, griglia gridstack con
  modalità modifica e posizioni salvate, cornice del pannello (titolo, menu, schermo intero).
- [ ] **T4 Pannelli di lettura**: trend, valore/gauge, barre, lampada; editor del pannello.
- [ ] **T5 Comandi**: pulsante e interruttore con scritture e conferma.
- [ ] **T6 E2E e verifica**: E2E contro pymodbus (valore letto, pulsante che scrive, layout salvato
  e riaperto); file di verifica; CHANGELOG.
