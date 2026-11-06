# Mappe registri e registrazione su file

Data: 2026-11-06. Stato: decisioni dell'utente (sotto), misure preliminari fatte, da implementare.

## Perché

- **Mappa:** oggi ogni registro di un dispositivo si configura a mano. Il manuale di un inverter o
  di un PLC fornisce già la tabella dei registri (indirizzo, nome, tipo, unità, scala): importarla
  toglie il lavoro più lungo del commissioning.
- **Registrazione:** lo storico del trend dura 10 minuti e solo in memoria. Una prova notturna o un
  guasto intermittente richiedono valori su file, per ore.

## Decisioni dell'utente (2026-11-06)

1. Una mappa importata diventa una **dashboard**: una variabile per riga, mostrate da un pannello
   tabella. Non crea poll del master, che hanno un solo tipo per blocco e nessuna scalatura.
2. Si registrano le **variabili di una dashboard**, in unità ingegneristiche (scalate).
3. CSV **largo**: una riga per lettura, una colonna per variabile.
4. **Un file nuovo al giorno.**

## Decisioni

### Mappa (R)

| # | Decisione | Fonte |
|---|---|---|
| R1 | Formato CSV con riga di intestazione; colonne riconosciute per nome, in qualsiasi ordine, maiuscole indifferenti: `name`, `table`, `address`, `type`, `byte_order`, `units`, `raw_min`, `raw_max`, `eng_min`, `eng_max`, `decimals`. Obbligatorie `name`, `table`, `address`, e `type` per i registri (i bit non hanno tipo: per coil e discrete input il tipo si ignora); le quattro colonne di scala vanno insieme o nessuna, con `clamp` facoltativa (`true`/`false`, `yes`/`no`, `1`/`0`); `decimals` 0…10, predefinito 1 | Un formato da una tabella di manuale si scrive a mano o con un foglio di calcolo |
| R2 | `table`: `coils`, `discrete inputs`, `holding registers`, `input registers` (anche `coil`, `discrete`, `holding`, `input`). `address`: indirizzo di protocollo 0…65535, non la notazione 40001 | I manuali usano entrambe le notazioni: indovinarla sbaglierebbe di 1 senza che nessuno se ne accorga. Lo dice il messaggio d'errore e il README |
| R3 | `type` come nei menu dell'app (`UInt16` … `Float64`, `Hex`, `Binary`, `ASCII`); `byte_order` `ABCD`/`CDAB`/`BADC`/`DCBA`, predefinito `ABCD` | Nomi Modbus in inglese (spec i18n) |
| R4 | Un file con una sola riga non valida viene rifiutato tutto, con il numero di riga e il campo: una mappa importata a metà sembra completa e non lo è | — |
| R5 | L'import chiede l'unit id (un dispositivo, un unit id) e crea una dashboard col nome del file e un **pannello tabella** con tutte le righe | Decisione 1 |
| R6 | Pannello tabella: per riga nome, valore scalato con i decimali della riga, unità; valore vuoto se la lettura è vecchia o in errore. Le letture usano il raggruppamento esistente (D21) | Riuso di `dashboardReads` |
| R7 | Il pannello tabella si esporta nello stesso CSV: andata e ritorno restituiscono la stessa mappa | Il formato si documenta da sé con un esempio prodotto dall'app |
| R8 | Il CSV si legge con il parser già nel progetto (`src/lib/csv.ts`) | Inventario: nessuna libreria nuova |

### Registrazione (L)

| # | Decisione | Fonte |
|---|---|---|
| L1 | Si registrano le variabili distinte della dashboard aperta (stessa identità di `variableKey`), con il valore scalato; una cella vuota se la lettura è vecchia o in errore | Decisione 2 |
| L2 | Intestazione `time` e poi una colonna per variabile, `nome [unità]`. Il nome è quello della variabile; senza, il titolo del pannello che mostra solo lei (valore, lampada, comandi), come l'utente la chiama sullo schermo; altrimenti etichetta o indirizzo. Il tempo è locale, `AAAA-MM-GG hh:mm:ss.mmm`, che Excel e LibreOffice leggono come data | Decisione 3 |
| L3 | Una riga al più ogni mezzo periodo della dashboard, scritta all'arrivo di una lettura (nessun timer): le letture in leggero anticipo non saltano una riga e i blocchi di uno stesso ciclo ne fanno una sola. Senza letture valide, per esempio a master scollegato, non nascono righe e il buco si vede nella colonna del tempo | Misura sotto: con la finestra nascosta le righe continuano |
| L4 | ~~L'utente sceglie una cartella~~ (2026-11-06, decisione dell'utente dopo la misura sotto: il dialogo cartella di GTK non si pilota nell'E2E). Cartella **fissa**: `Documenti/ModbusTool/recordings`, oppure `~/ModbusTool/recordings` dove il sistema non definisce Documenti. I file si chiamano `<dashboard>_AAAA-MM-GG.csv` e cambiano a mezzanotte locale. Se il file del giorno esiste già con la stessa intestazione si continua a scriverlo; con un'intestazione diversa si apre `<dashboard>_AAAA-MM-GG_2.csv` (e così via) | Decisione 4. dirs 7.0.0 (`document_dir`): su Linux Documenti esiste solo se `~/.config/user-dirs.dirs` lo definisce, cosa che WSL2, container e runner CI spesso non hanno |
| L5 | Pulsante Registra/Ferma nella barra della dashboard, con indicatore, righe scritte e percorso completo del file (selezionabile). Un errore di scrittura, o la cartella che non si crea, ferma la registrazione e lo dice | — |
| L6 | Permessi: `fs:allow-mkdir` e lo scope solo su `$DOCUMENT/ModbusTool/recordings` e `$HOME/ModbusTool/recordings`, non su tutta la cartella Documenti. Nessun pulsante "Apri cartella": `tauri-plugin-opener` 2.7.2 aggiungeva 457 righe a `Cargo.lock` (lo stack D-Bus `zbus` su Linux) per un solo pulsante | Misura 2026-11-06 |

## Inventario (versioni installate)

- `src/lib/csv.ts`: parser e scrittura CSV con virgolette, già usati per import/export dello slave e
  per il traffico.
- `Variable` (`src/lib/dashboards.ts`) ha tabella, indirizzo, tipo, byte order, scalatura e colore:
  manca solo il testo dell'unità e i decimali, che stanno nella riga del pannello tabella.
- `@tauri-apps/plugin-fs` 2.7.1: `writeTextFile(path, data, { append: true })`; permessi
  `fs:allow-read-text-file` e `fs:allow-write-text-file` già concessi.
- `tauri-plugin-dialog` 2.8.4 (`src/commands.rs`): `save()` concede lo scope **solo sul file**
  scelto (`allow_file`); `open({ directory: true })` concede la cartella (`allow_directory`).

## Misure preliminari (2026-11-06, Linux, Xvfb, WebKitGTK 2.52.6)

- **Dialoghi nativi nell'E2E:** il dialogo GTK "Open" aperto dall'app si pilota con `xdotool`
  (`windowfocus`, Ctrl+L, percorso, Invio): l'app ha aperto il progetto scelto. `windowactivate`
  non funziona senza window manager. Su Windows i dialoghi nativi non si pilotano: lì quei
  controlli si dichiarano non eseguiti, come quelli seriali.

## Misure durante l'implementazione (2026-11-06, stesso ambiente)

- **Dialogo apri e salva:** i tasti inviati prima che il dialogo sia pronto si perdono; l'E2E
  ripete la risposta finché il dialogo non si chiude. Il dialogo di salvataggio ("Save File")
  prende il percorso nel campo del nome (Ctrl+A).
- **Dialogo cartella ("Select Folder"):** non si chiude né con il percorso e Invio (entra nella
  cartella), né con un secondo Invio, né con Alt+S (rfd 0.17.2 usa `GtkFileChooserNative` senza
  etichetta propria). Dopo tre tentativi la scelta è passata all'utente: cartella fissa (L4).
- **Cartella fissa e permessi:** con una HOME senza `user-dirs.dirs` l'app crea
  `~/ModbusTool/recordings` e ci scrive (E2E, 91/91).
- **Finestra nascosta e carico:** mappa di 200 registri (100 input e 100 holding), periodo 1 s,
  build debug. Finestra visibile 5 s: 5 righe; poi nascosta (`xdotool windowunmap`) 60 s: altre 60
  righe, tutte con 200 valori. File: circa 1 KB a riga, cioè circa 90 MB al giorno a questo ritmo.
  CPU dell'app nel minuto nascosto: 0,7% di un core.

## Cosa NON è dimostrato

- Nessuna misura su Windows dei dialoghi nativi (lì l'import della mappa non è nell'E2E) né della
  registrazione con la finestra nascosta; la registrazione stessa è nell'E2E anche su Windows.
- "Nascosta" è la finestra tolta dallo schermo sotto Xvfb, non la riduzione a icona di un desktop
  vero; il carico è misurato per un minuto, non per ore.
- La notazione 40001 non è supportata (R2): una mappa scritta così va convertita.
