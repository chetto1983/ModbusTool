# Verifica — dashboard (mini-SCADA)

Data: 2026-11-06. Spec: `docs/superpowers/specs/2026-11-06-dashboards-design.md`.

## Cosa è stato misurato

- **E2E** (`e2e/dashboard.mjs`, app vera su Linux/WebKitGTK 2.52.6, master TCP contro il server
  di riferimento pymodbus), 83/83 controlli dell'intera suite:
  - sei pannelli aggiunti in posti distinti, senza sovrapposizioni (D8);
  - trascinato per il titolo in modifica, un pannello si sposta di lato e la posizione resta
    (D10: trascinato in basso nel vuoto torna in riga 0, compattazione come Grafana);
  - pannello valore: mostra 333 (registro 2 del riferimento) da un poll FC03 in corso;
  - lampada accesa su registro diverso da zero;
  - pulsante: FC06 scrive 4242 nel registro 5, riletto dal riferimento;
  - interruttore: FC05 porta la coil 7 da 0 a 1, riletta dal riferimento;
  - selettore: scrive 1 nel registro 8 e mostra l'opzione letta; registro riportato a 0 dal
    riferimento, la stessa opzione scelta di nuovo scrive di nuovo (D9);
  - input numerico: 6000 con massimo 5000 rifiutato dal form ("Above the maximum 5000"), 1234
    scritto nel registro 9 e mostrato come valore letto.
- **Difetti trovati dall'E2E e corretti**: pannelli nuovi impilati in colonna (→ D8); lo stesso
  tipo aggiunto due volte non apriva l'editor, e il selettore non riscriveva l'opzione scelta
  prima dopo un cambio sul dispositivo (WebKit non emette `change`, → D9).
- **Unit test**: 80, coverage 99,2% righe (vitest); validazione del file di progetto per ogni
  tipo di pannello, posizionamento, codifica e range delle scritture.
- **Screenshot** controllati: pannelli selettore e numerico, editor delle opzioni.

## Cosa NON dimostra

- WebView2 su Windows: trascinamento, selettore e input numerico vanno provati a mano.
- Il ridimensionamento dei pannelli (nessun controllo E2E).
- Il pannello trend e le barre contro il riferimento: coperti da unit test e dal trend del master,
  non da un controllo E2E dedicato.
- Prestazioni con molti pannelli e poll veloci (obiettivo della spec: 20 pannelli a 200 ms).
- Il layout salvato e riaperto da file: coperto dal test di round-trip del progetto, non
  dall'E2E.
