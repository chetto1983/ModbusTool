# Verifica — editor in un modal

Data: 2026-11-06. Spec: `docs/superpowers/specs/2026-11-06-modal-editors-design.md`.

## Cosa è stato misurato

- **App vera** (Linux, WebKitGTK): E2E 17/17 con il nuovo flusso. Poll creato e modificato nel
  modal (intervallo, tipo/ordine Float32 CDAB, funzione FC01 e FC04), avviato e fermato dai
  pulsanti della riga; generatore creato nel modal e attivato dalla riga, letto da pymodbus.
- **Frontend in Chromium** (motore di WebView2): modal leggibile nei temi scuro e chiaro; Esc
  chiude il modal senza salvare.
- **Unit test** (`actions.test.ts`): la bozza entra nel progetto solo al salvataggio; un
  rinomina non riavvia né azzera il trend; il tipo azzera il trend senza riavviare; la quantità
  riavvia una volta con i nuovi valori e tiene il trend; un poll fermo non parte per una
  modifica; generatori sostituiti dalla copia modificata e rimossi con il loro errore.

## Cosa NON dimostra

- `<dialog>` nell'app vera su Windows (WebView2): provato solo il frontend in Chromium.
