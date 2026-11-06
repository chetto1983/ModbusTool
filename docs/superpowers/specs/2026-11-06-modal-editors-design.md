# Editor dei poll e dei generatori in un modal

Data: 2026-11-06. Stato: approvata dall'utente.

## Obiettivo

Barra laterale pulita: liste compatte di poll e generatori; la modifica avviene in un modal
riusabile con Salva/Annulla.

## Decisioni

| # | Decisione | Fonte |
|---|---|---|
| E1 | `Modal.svelte` sull'elemento nativo `<dialog>` aperto con `showModal()`: focus intrappolato, Esc, sfondo inerte e ruolo accessibile vengono dalla piattaforma; nessuna libreria | Inventario: nessun componente modale tra le dipendenze; `<dialog>` supportato da WebView2 e WebKitGTK |
| E2 | Si modifica una **copia**: Salva applica, Annulla o Esc scartano. Invio in un campo salva (il modal è un `<form>`), e i limiti `min`/`max` dei campi bloccano il salvataggio | Scelta utente 2026-11-06 (Save / Cancel) |
| E3 | Poll: un poll in esecuzione riparte una volta sola al salvataggio, e solo se cambia ciò che legge (funzione, unit, indirizzo, quantità, intervallo); il trend si azzera se cambia il significato dei valori (funzione, unit, indirizzo, tipo, ordine) | Prima ogni campo riavviava il poll |
| E4 | Riga del poll: stato, ▶/■, modifica; il clic sulla riga seleziona il poll mostrato nella griglia. Elimina sta nel modal | Scelta utente 2026-11-06 (anteprima approvata) |
| E5 | Riga del generatore: attivo (casella, effetto immediato), descrizione, modifica. Elimina sta nel modal | Scelta utente 2026-11-06 ("Polls and simulation") |

## Cosa NON è dimostrato

- Il comportamento di `<dialog>` in WebView2 è dedotto dal supporto di Chromium: l'E2E gira su
  WebKitGTK.
