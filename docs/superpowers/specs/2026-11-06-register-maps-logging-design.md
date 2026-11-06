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
| L2 | Intestazione `time` e poi una colonna per variabile, `nome [unità]`. Il tempo è locale, `AAAA-MM-GG hh:mm:ss.mmm`, che Excel e LibreOffice leggono come data | Decisione 3 |
| L3 | Una riga al più ogni periodo della dashboard, scritta all'arrivo di una lettura (nessun timer): senza letture, per esempio a master scollegato, non nascono righe e il buco si vede nella colonna del tempo | Un timer JS rallenta quando la finestra è nascosta; un evento dal backend no (da misurare, sotto) |
| L4 | L'utente sceglie una **cartella**; i file si chiamano `<dashboard>_AAAA-MM-GG.csv` e cambiano a mezzanotte locale. Se il file del giorno esiste già con la stessa intestazione si continua a scriverlo; con un'intestazione diversa si apre `<dashboard>_AAAA-MM-GG_2.csv` (e così via) | Decisione 4. Misura sotto: il dialogo di salvataggio dà il permesso su un solo file |
| L5 | Pulsante Registra/Ferma nella barra della dashboard, con indicatore e nome del file. Un errore di scrittura ferma la registrazione e lo dice | — |
| L6 | Il permesso sulla cartella vale per la sessione: dopo un riavvio dell'app la registrazione non riparte da sola | `tauri-plugin-dialog` 2.8.4: lo scope non è persistito |

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

## Da misurare durante l'implementazione

- Scrittura in append su un file nuovo dentro la cartella scelta (scope della cartella).
- Il dialogo cartella di GTK guidato da `xdotool`.
- Righe scritte con la finestra minimizzata (L3).
- Prestazioni: una mappa di 200 righe letta a 1 s e registrata per un'ora (dimensione, CPU).

## Cosa NON è dimostrato

- Nessuna misura su Windows dei dialoghi nativi né della registrazione con la finestra nascosta.
- La notazione 40001 non è supportata (R2): una mappa scritta così va convertita.
