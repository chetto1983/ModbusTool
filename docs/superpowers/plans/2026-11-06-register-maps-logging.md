# Piano — mappe registri e registrazione su file

**Goal:** importare la mappa registri di un dispositivo in una dashboard (pannello tabella) e
registrarne le variabili su CSV giornalieri.

**Architecture:**
- `src/lib/dashboards.ts`: nuovo pannello `table` (righe: variabile, unità, decimali).
- `src/lib/registerMap.ts`: lettura e scrittura del CSV della mappa (funzioni pure).
- `src/lib/recording.ts`: intestazione, righe, nomi dei file, cadenza (funzioni pure).
- `src/lib/recorder.svelte.ts`: stato della registrazione e scrittura in append con plugin-fs,
  avanzata dalle letture.
- Componenti: `TableView` (corpo del pannello), voci in `DashboardView` (Importa mappa,
  Registra/Ferma), esportazione dal menu del pannello tabella.

**Tech Stack:** Svelte 5, `@tauri-apps/plugin-fs` 2.7.1, `@tauri-apps/plugin-dialog` 2.8.4,
fast-check, webdriverio + xdotool (dialoghi GTK nell'E2E).

**Spec:** `docs/superpowers/specs/2026-11-06-register-maps-logging-design.md`

**Global Constraints:** file ≤600 LOC; token Aura; testi in `messages/` (en, it); gate di
`CLAUDE.md`; coverage ≥85%; READ, THEN PROBE, THEN IMPLEMENT.

**Review Focus:** una mappa non valida non entra a metà; nessuna scrittura fuori dalla cartella
scelta; le righe non dipendono da timer; i progetti esistenti si aprono ancora.

**Decisions taken while writing this plan:**
- Unità e decimali stanno nella riga del pannello tabella, non in `Variable`: aggiungerli a
  `Variable` cambierebbe tutti i pannelli e il formato del progetto per un solo uso.
- Il pannello tabella entra nel progetto come gli altri: nessun cambio di versione del file.
- La cadenza delle righe e il cambio di giorno sono funzioni pure con il tempo passato da fuori:
  i test non aspettano la mezzanotte.

## Task

- [x] **T1 Pannello tabella (modello):** tipo, `newPanel`, validazione e lettura dei progetti, test.
- [x] **T2 CSV della mappa:** `parseRegisterMap` (errori con riga e campo), `registerMapCsv`;
  test d'esempio e di proprietà (andata e ritorno).
- [x] **T3 Mappa nell'app:** `TableView`, editor delle righe, Importa mappa (unit id, nuova
  dashboard), Esporta dal pannello; i18n; E2E su Linux: import col dialogo GTK, valori scalati letti
  da pymodbus, export uguale all'originale.
  T1–T3 in un solo commit: il pannello tabella senza interfaccia non si prova nell'E2E.
  Misurato durante T3: i tasti inviati prima che il dialogo GTK sia pronto si perdono; l'E2E
  ripete la risposta finché il dialogo non si chiude.
- [x] **T4 Registrazione (logica):** intestazione, righe, nomi, cadenza e giorno; registratore con
  fs simulato; test.
- [x] **T5 Registrazione nell'app:** Registra/Ferma nella cartella fissa (spec L4, cambiata dopo la misura), indicatore, errori;
  E2E su Linux e Windows: righe nel file confrontate con pymodbus; misure: finestra minimizzata, mappa di 200
  righe (un minuto, non un'ora: spec, Misure).
  T4–T5 in un solo commit: la logica senza interfaccia non si prova nell'E2E.
- [x] **T6 Documenti:** README, CHANGELOG, file di verifica.
