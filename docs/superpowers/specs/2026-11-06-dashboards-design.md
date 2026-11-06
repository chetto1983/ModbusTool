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
| D3 | ~~La sorgente dei valori è un **segnale**~~ (sostituita da D13–D15 il 2026-11-06) La sorgente dei valori è un **segnale** = poll del master + offset del registro; il tipo e l'ordine dei byte sono quelli del poll, come nel trend esistente. Un pannello mostra solo ciò che i poll leggono: se il poll è fermo il valore è marcato come non aggiornato | Modello esistente (`TrendSeries`) |
| D4 | Pannelli: **trend** (uPlot a gradini, finestra temporale propria), **valore** (numero con unità, scala lineare `valore × scala + offset`, decimali; gauge opzionale con min/max; soglie di avviso/allarme con i token di stato Aura), **barre** (valori attuali di più segnali: una riga per segnale con barra proporzionale al valore più grande in modulo, in CSS; emendato 2026-11-06: uPlot `paths.bars` richiede un asse x di categorie e un ridisegno per ogni lettura, righe CSS bastano e restano leggibili), **lampada** (accesa se il segnale è diverso da zero), **pulsante** (scrive un valore), **interruttore** (scrive una coil, mostra lo stato letto) | Scelta utente 2026-11-06 |
| D5 | Le **scritture** passano dal master connesso (FC05 coil, FC06 un registro, FC16 più registri, come la griglia). Pulsanti e interruttori sono disabilitati senza connessione; un pulsante può chiedere **conferma** prima di scrivere. Una scrittura fallita mostra la notifica di errore | Comportamento esistente di `writeValues` |
| D6 | Lo storico dei trend è unico per segnale (stesso buffer di 10 minuti del trend del master), registrato per ogni segnale usato da un trend o da un pannello trend | Spec trend 2026-11-06 (T3) |
| D8 | Un pannello nuovo va nel **primo posto libero**, riga per riga da sinistra, come Grafana | Misura E2E 2026-11-06: messi in fondo, i pannelli si impilavano in colonna |
| D9 | "Aggiungi pannello" apre una **scelta del tipo a pulsanti** (modal esistente), non un `<select>` usato come menu | Misura E2E 2026-11-06 (WebKitGTK 2.52.6): scelto di nuovo lo stesso tipo dopo il reset a "", il `<select>` non emette `change` (WebKit confronta con l'ultima scelta dell'utente). Stessa causa nel pannello selettore: cambiato il valore sul dispositivo, riscegliere l'opzione scelta prima non scriveva (misura E2E 2026-11-06); il `<select>` del pannello si ricrea a ogni cambio del valore mostrato e dopo ogni scrittura |
| D10 | La griglia **compatta verso l'alto** (gridstack `float` spento, come Grafana): un pannello trascinato nel vuoto in basso risale; si sposta di lato o scambiandolo con un altro | Misura E2E 2026-11-06: trascinato in basso di 260 px, il pannello tornava in riga 0 |
| D11 | Due pannelli di comando in più (richiesta utente 2026-11-06): **selettore** (elenco di opzioni etichetta → valore; sceglierne una scrive il valore; mostra l'opzione corrispondente al valore letto) e **numerico** (setpoint digitato con min/max opzionali, scritto con Invio o "Imposta"; mostra il valore letto). Stesso `WriteTarget` e stessa codifica del pulsante | Richiesta utente "combobox e numeric input" |
| D12 | Ogni pannello trend sceglie la **linea**: gradini (valore mantenuto, per segnali a livelli), retta, curva (uPlot `paths.stepped/linear/spline`, già nella dipendenza). Nuovi pannelli: retta; trend salvati dalla 3.2.0 senza il campo: gradini, come erano disegnati. Il trend del master resta a gradini | Richiesta utente 2026-11-06 ("mancano le interpolazioni"); screenshot dell'app con sinusoide dello slave: i tre modi si distinguono |
| D7 | Il gauge è un arco SVG disegnato da noi (nessuna libreria di gauge tra le dipendenze; poche righe di geometria), colori dai token | Inventario: uPlot non disegna gauge |

## Sganciamento dai poll (2026-11-06, scelta utente)

| # | Decisione | Fonte |
|---|---|---|
| D13 | Ogni elemento di un pannello ha la **sua variabile**: unit, tabella (coils, discrete inputs, holding, input registers), indirizzo, tipo, ordine dei byte e un nome facoltativo. Niente elenco condiviso: i registri usati non sono contigui. I pannelli di comando scrivono sul loro `WriteTarget` e mostrano lo stato da una variabile facoltativa, all'inizio la stessa locazione del target | Scelta utente 2026-11-06 |
| D14 | La dashboard **legge da sé**, sempre mentre il master è connesso (anche su un'altra vista), con un **periodo per dashboard** (predefinito 1000 ms). Riuso: ogni variabile distinta diventa un poll del backend (`poll_start`, id `dash:<chiave>`), con il periodo minimo tra le dashboard che la usano; stessa temporizzazione, timeout e traffico dei poll del master. Alla connessione si riavviano (il backend li cancella a `master_disconnect`) | Inventario `commands.rs`/`poller.rs`: `Poller` già fa letture cicliche ed emette `poll-result` |
| D15 | I progetti 3.2.0 si **convertono all'apertura**: un segnale (poll + offset) diventa la variabile con unit, tabella, indirizzo (`poll.address + offset`), tipo e ordine del poll; un segnale di un poll inesistente si scarta. Lo storico dei trend si indicizza per variabile | Scelta utente 2026-11-06 |

## Scalatura (2026-11-06, richiesta utente "come fanno gli SCADA moderni")

| # | Decisione | Fonte |
|---|---|---|
| D16 | **Scalatura lineare a due punti sulla variabile** (come i tag di WinCC/Ignition): grezzo min/max → ingegneristico min/max, facoltativa, con "limita all'intervallo". Vale in lettura per ogni pannello (valore, trend, barre, lampada, stato) | Richiesta utente 2026-11-06 |
| D17 | **Anche il target di scrittura** ha la sua scalatura: pulsante, selettore e input numerico ricevono valori ingegneristici e scrivono il grezzo (inversa, arrotondata se il tipo è intero). Lo stato iniziale di un comando copia anche la scalatura del target | Coerenza lettura/scrittura: un setpoint in bar si legge e si scrive in bar |
| D18 | Scala/offset del pannello valore spariscono: alla lettura del progetto diventano la scalatura della sua variabile (grezzo 0…1 → ingegneristico offset…offset+scala) | Una sola strada per la stessa cosa |

## Cosa NON è dimostrato

- Prestazioni con molti pannelli e poll veloci: da misurare (obiettivo: 20 pannelli, poll 200 ms).
- gridstack dentro WebView2: da provare a mano su Windows. In WebKitGTK il trascinamento è provato dall'E2E (2026-11-06), il ridimensionamento no.
