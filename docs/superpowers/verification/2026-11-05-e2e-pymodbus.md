# Verifica 2026-11-05 — app reale contro pymodbus

Spec: `docs/superpowers/specs/2026-11-05-tauri-rewrite-design.md`.
Commit misurato: quello che aggiunge questo file (design Aura, licenza MIT).

## Cosa è stato misurato

**E2E** (`node e2e/run.mjs`, app debug pilotata da tauri-driver + WebKitWebDriver su Xvfb,
pymodbus 3.16.2 come implementazione indipendente): **16/16**.

| Ruolo dell'app | Link | Controllo |
|---|---|---|
| Master | TCP | poll FC03 mostra i valori del server; scrittura FC06 dalla griglia letta dal server; float32 CDAB; toggle FC05 |
| Master | UDP, RTU over TCP, ASCII seriale (pty) | lettura FC04 uguale al riferimento |
| Slave | TCP | FC16/FC03 dal client di riferimento; griglia aggiornata; modifica dalla griglia letta dal client; FC15/FC01; generatore sinusoide visto dal client |
| Slave | UDP, RTU over TCP, RTU seriale (pty) | FC03 dal client di riferimento |
| — | — | il monitor traffico elenca frame master e slave con descrizioni |

**Test**: Rust 57 (`cargo test`), frontend 44 (`vitest`), `svelte-check` 0 errori/0 avvisi,
`clippy -D warnings` pulito.

**Coverage**: Rust 93,2% righe (`cargo llvm-cov`, esclusi solo `main.rs`/`lib.rs::run` che aprono la
finestra); frontend `src/lib` 98,8% statement, 91,2% branch (`vitest --coverage`). I componenti
`.svelte` non hanno test unitari: sono coperti solo dall'E2E.

**Mutation** (`cargo mutants`, `frame_io`, `slave`, `slave_server`, `master`, `describe`, 2 worker):
227 mutanti, 195 catturati, 4 timeout, 5 sopravvissuti, 23 non compilabili → **97,5%**.
Sopravvissuti, tutti analizzati:
- `check_limits` `+`→`*` e `handle_broadcast` `&&`→`||`: equivalenti per ogni input raggiungibile.
- `accept_loop`/`udp_loop` guardie di errore → `true`: differiscono solo su errori reali di
  `accept`/`recv`, non riproducibili in modo deterministico.
- `accept_loop` `retain`: cambia solo quante handle di thread terminati restano in memoria.

**CI GitHub** (run 2, commit `f1905c3`): rust, frontend, bundle Linux e Windows verdi; bundle macOS
annullato dopo 15 minuti senza runner.

## Difetti trovati dalla verifica e corretti

- Generatore di simulazione nuovo attivo da subito: sovrascriveva l'indirizzo selezionato.
- Trend che continuava a tracciare dopo un cambio di funzione/unit/indirizzo/tipo del poll.
- Etichette CSV: il `trim()` del file cancellava gli spazi finali dell'ultima etichetta (test di proprietà).
- Seriale: assenza di test sullo svuotamento dell'input prima di ogni richiesta (ora coperto).

## Cosa NON dimostra

- Porte seriali reali e adattatori USB: solo pseudo-terminali, che accettano solo 8N1
  (ASCII 7E1 non esercitato end-to-end).
- Windows e macOS a runtime: su Windows solo la build in CI; macOS non compilato.
- Bus RTU multi-drop con altri slave.
- Prestazioni con molti poll a intervalli brevi.
- Mutation testing del TypeScript: Stryker configurato ma la run è stata interrotta.
- Dispositivi Modbus reali diversi da pymodbus.
