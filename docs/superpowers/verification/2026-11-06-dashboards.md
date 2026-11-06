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

## Sganciamento dai poll (D13–D15), misurato il 2026-11-06

- **E2E** 84/84, eseguito due volte. La dashboard legge da sé, con periodo 200 ms e nessun poll
  del master avviato. Ha mostrato 333 dal registro 2, la lampada accesa dalla coil 0 e lo stato
  dell'interruttore riletto dalla coil 7 dopo la scrittura. Selettore e input numerico mostrano i
  registri 8 e 9 riletti dal dispositivo. Con il master disconnesso i valori diventano "non
  aggiornati".
- **Difetti trovati dall'E2E e corretti**:
  - lo stato di un comando restava sull'indirizzo predefinito quando si cambiava l'indirizzo
    scritto: ora lo segue, finché legge la stessa locazione;
  - un risultato ancora in viaggio dopo la disconnessione ricreava la lettura: ora i risultati di
    letture ferme si scartano;
  - un avvio di lettura fallito non veniva più ritentato.
- **Unit test**: conversione di un progetto 3.2.0 (segnali → variabili, poll mancante scartato,
  segnali non in lista rifiutati), una lettura per locazione al periodo minimo, avvio, arresto e
  riavvio alla riconnessione.

## Scalatura (D16–D18), misurata il 2026-11-06

- **E2E** 86/86 contro pymodbus:
  - il registro 2 (333 grezzo) con scalatura 0…1000 → 0…100 si mostra come 33.3 %;
  - un setpoint di 50 % con scalatura 0…27648 → 0…100 scrive 13824 nel registro 11, riletto dal
    riferimento, e torna a mostrarsi come 50.
- **Unit test**: 102, tra cui test di proprietà (fast-check). Per i float, andata e ritorno
  restituiscono il grezzo; per gli interi, il valore riletto sta entro mezzo passo grezzo da quello
  digitato. Sono coperti anche la limitazione con intervallo decrescente, nessuna scalatura per
  bit, hex, binari e ASCII, e la conversione di scala/offset del pannello valore.
- **Screenshot** dell'editor: la scalatura del target appare sotto tipo e ordine dei byte, e lo
  stato la eredita quando legge l'indirizzo scritto.

## Zoom dei trend e gauge (D19–D20), misurati il 2026-11-06

- **E2E** 88/88:
  - trascinato su un trend, lo zoom resta uguale (`data-x-min`/`data-x-max` del grafico) per
    10 letture a 200 ms; "Reset zoom" torna a seguire i dati;
  - il gauge di svelte-gauge disegna l'arco del valore scalato (33.3 %).
- **Screenshot** sull'app vera, con un segnale generato dallo slave e letto in loopback: quadrante
  da 240° centrato nel pannello, zone di avviso (60) e allarme (80) sull'arco, etichette min/max,
  numero proporzionato al pannello.

## Letture raggruppate (D21), misurate il 2026-11-06

- **Misura prima e dopo**, sull'app vera, con il master TCP collegato al riferimento pymodbus. La
  dashboard legge ogni 200 ms un pannello barre con 20 variabili contigue (HR 0…19). Gli eventi del
  Traffico sono contati per 5 s e divisi per 2 (richiesta + risposta):
  - prima, una lettura per variabile: **100 richieste/s**;
  - dopo, un blocco: **5 richieste/s**;
  - valori identici nei due casi (111…2220).
- **E2E** 88/88 con le letture raggruppate.
- **Unit test**:
  - blocchi contigui e sovrapposti;
  - un buco che separa i blocchi e non viene letto;
  - i limiti di 125 registri e 2000 bit;
  - separazione per unit e per periodo;
  - posizione di ogni variabile nel suo blocco;
  - un'eccezione sul blocco segna come non aggiornate tutte le sue variabili.

## Colore delle variabili (D22), misurato il 2026-11-06

- **E2E** 88/88: la lampada "Running" impostata su Rosso si accende col colore calcolato del
  token `--color-danger`.
- **Screenshot** dell'editor (tema scuro):
  - campioni Automatico e cinque colori fissi, con il selezionato evidenziato;
  - il personalizzato apre il selettore di color-picker-svelte con l'esadecimale.

  Il primo screenshot ha trovato un difetto del pacchetto 2.0.4: con `Position.Auto` il popup si
  apre sempre sotto, perché `showAbove` non restituisce il risultato. Veniva tagliato dal fondo
  della finestra di modifica. Ora la posizione si sceglie in base allo spazio nella finestra, e lo
  screenshot dopo la correzione mostra il popup sopra, intero.
- **Unit test**: colori accettati e rifiutati nel file, risoluzione token/esadecimale/automatico,
  colore conservato quando lo stato segue il target.

## Cosa NON dimostra

- Il colore delle linee del trend e delle barre: verificato solo a vista nell'editor; l'E2E
  controlla la lampada.
- Il gauge nel tema scuro e su WebView2: provato solo in WebKitGTK, tema chiaro.
- WebView2 su Windows: trascinamento, selettore e input numerico vanno provati a mano.
- Il ridimensionamento dei pannelli (nessun controllo E2E).
- Il pannello trend e le barre contro il riferimento: coperti da unit test e dal trend del master,
  non da un controllo E2E dedicato.
- La scalatura nei pannelli trend e barre con dati reali: coperta da unit test, non dall'E2E.
- Il guadagno sulla seriale reale: le pty di socat non hanno i tempi della linea, quindi la
  durata a 9600 baud è solo calcolata (D21). Le variabili non contigue restano una richiesta
  ciascuna.
- Prestazioni con molti pannelli e poll veloci (obiettivo della spec: 20 pannelli a 200 ms).
- Il layout salvato e riaperto da file: coperto dal test di round-trip del progetto, non
  dall'E2E.
