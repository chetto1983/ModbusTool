# Dashboard (mini-SCADA)

Data: 2026-11-06. Stato: approvata dall'utente (pannelli: trend, valore/gauge, barre, pulsanti e
lampade; griglia gridstack; più dashboard nel file di progetto).

## Obiettivo

Una vista "Dashboard" in stile Grafana per osservare e comandare un impianto Modbus: pannelli
disposti su una griglia trascinabile e ridimensionabile, configurati in un editor, salvati nel
progetto.

## Riferimento: wpt-iot (letto il 2026-11-06, `chetto1983/wpt-iot` @ 51870e7)

`apps/frontend/src/components/dashboard/`: più dashboard con nome; griglia `react-grid-layout`
con modalità modifica (trascina dal titolo, ridimensiona); pannello con intestazione bassa, titolo
e menu (impostazioni, schermo intero, elimina); editor del pannello (titolo, tipo, campi,
legenda, griglia, asse Y automatico o min/max); tipi linea, barre, area, torta più card gauge.
Si riprende il modello d'uso, non il codice (React).

## Decisioni

| # | Decisione | Fonte |
|---|---|---|
| D1 | Vista **Dashboard** nella barra laterale; **più dashboard** con nome, salvate nel file di progetto (campo `dashboards`, opzionale: i progetti esistenti restano validi) | Scelta utente 2026-11-06 |
| D2 | Griglia **gridstack 14.0.0** (MIT, zero dipendenze, framework-agnostica): gli elementi li crea Svelte, gridstack li gestisce con `makeWidget`; `change` aggiorna x/y/w/h nel progetto; `setStatic` alterna visualizzazione e modifica. 14.0.0 e non 14.1.0, uscita due giorni prima | Inventario `node_modules/gridstack/dist/gridstack.d.ts`; scelta utente |
| D3 | La sorgente dei valori è un **segnale** = poll del master + offset del registro; il tipo e l'ordine dei byte sono quelli del poll, come nel trend esistente. Un pannello mostra solo ciò che i poll leggono: se il poll è fermo il valore è marcato come non aggiornato | Modello esistente (`TrendSeries`) |
| D4 | Pannelli: **trend** (uPlot a gradini, finestra temporale propria), **valore** (numero con unità, scala lineare `valore × scala + offset`, decimali; gauge opzionale con min/max; soglie di avviso/allarme con i token di stato Aura), **barre** (valori attuali di più segnali, uPlot `paths.bars`), **lampada** (accesa se il segnale è diverso da zero), **pulsante** (scrive un valore), **interruttore** (scrive una coil, mostra lo stato letto) | Scelta utente 2026-11-06 |
| D5 | Le **scritture** passano dal master connesso (FC05 coil, FC06 un registro, FC16 più registri, come la griglia). Pulsanti e interruttori sono disabilitati senza connessione; un pulsante può chiedere **conferma** prima di scrivere. Una scrittura fallita mostra la notifica di errore | Comportamento esistente di `writeValues` |
| D6 | Lo storico dei trend è unico per segnale (stesso buffer di 10 minuti del trend del master), registrato per ogni segnale usato da un trend o da un pannello trend | Spec trend 2026-11-06 (T3) |
| D7 | Il gauge è un arco SVG disegnato da noi (nessuna libreria di gauge tra le dipendenze; poche righe di geometria), colori dai token | Inventario: uPlot non disegna gauge |

## Cosa NON è dimostrato

- Prestazioni con molti pannelli e poll veloci: da misurare (obiettivo: 20 pannelli, poll 200 ms).
- gridstack dentro WebView2 e WebKitGTK: da provare nell'E2E (Linux) e a mano su Windows.
