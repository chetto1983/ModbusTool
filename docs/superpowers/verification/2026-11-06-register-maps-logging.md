# Verifica: mappe registri e registrazione su file

Data: 2026-11-06. Spec: `docs/superpowers/specs/2026-11-06-register-maps-logging-design.md`.
Piano: `docs/superpowers/plans/2026-11-06-register-maps-logging.md`.

## Cosa è stato misurato

**E2E contro pymodbus** (`node e2e/run.mjs`, build debug, Linux, Xvfb, WebKitGTK 2.52.6, HOME vuota
senza `user-dirs.dirs`, `LANG=C.UTF-8`): **91/91**. I controlli nuovi:

- **Mappa importata:**
  - una mappa con intestazioni scritte come in un manuale (maiuscole, `Byte order` con lo spazio),
    importata dal dialogo GTK "Open File" guidato con xdotool;
  - il pannello tabella mostra, letti da pymodbus: input 4 = `1,004 °C`; input 6 scalato
    1000…1010 → 0…100 = `60.0 %`; input 2–3 UInt32 ABCD = `65,668,075 m³`; discrete input 1 = `0`.
- **Mappa esportata:** dal dialogo GTK "Save File", il file è identico, carattere per carattere, al
  formato atteso (colonne dell'app, default scritti per esteso, `°C` e `m³` intatti).
- **Registrazione:**
  - la dashboard dell'E2E, periodo 200 ms, registrata finché il contatore supera 5 righe;
  - nel file, la colonna `Pressure [bar]` vale 333 (il registro 2 di pymodbus) in ogni riga, e le
    righe distano almeno mezzo periodo;
  - la cartella è `~/ModbusTool/recordings`, il ripiego senza Documenti: lo scope dei permessi
    funziona.

**Misure a parte** (stesso ambiente, sonda con webdriverio):

- Dialogo cartella GTK: non pilotabile (tre tentativi, spec "Misure"); da qui la cartella fissa,
  scelta dall'utente.
- Finestra nascosta (`xdotool windowunmap`), mappa di 200 registri a 1 s: 60 righe in 60 s, tutte
  con 200 valori; circa 1 KB a riga; CPU dell'app 0,7% di un core.

**Test unitari** (vitest, 146 test, coverage righe 99,78%):

- CSV della mappa: esempio da un inverter, ogni cella rifiutata con riga e colonna, andata e ritorno
  di proprietà con fast-check.
- Azioni: import, file non valido, annullo, export, export fallito, dimensione della tabella.
- Registrazione: colonne e nomi, intestazione, ora locale, nomi dei file, cadenza; registratore con
  fs simulato: cambio di giorno, file del giorno esistente o con altre colonne, ripiego sulla home,
  errori di scrittura e di cartella.

**Gate:** svelte-check, oxlint, prettier, knip, jscpd, check:i18n, file-size, build.

## Cosa NON dimostra

- **Windows:** l'import e l'export della mappa non sono nell'E2E, perché i dialoghi nativi non si
  pilotano; la registrazione sì, ma la prima prova su Windows è la CI di questo commit.
- La finestra "nascosta" è tolta dallo schermo sotto Xvfb, non ridotta a icona su un desktop vero
  né su WebView2; il carico è misurato per un minuto, non per ore né per giorni.
- Nessuna prova con un dispositivo reale né con mappe di manuali reali: le mappe sono costruite
  sui valori noti di pymodbus.
- `cargo mutants` non si applica: nessun codice Rust nuovo. Stryker non è stato eseguito sui file
  nuovi.
