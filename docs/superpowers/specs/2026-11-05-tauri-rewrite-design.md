# ModbusTool 3 — riscrittura Tauri + Rust

Data: 2026-11-05. Stato: approvata dall'utente (stack, perimetro, libreria protocollo).

## Obiettivo

Sostituire l'app WinForms/.NET Framework (Windows-only, master e slave separati) con un'unica
app desktop multipiattaforma che faccia da **master** e da **slave** Modbus, con le funzioni
che mancavano.

## Decisioni (con la loro fonte)

| # | Decisione | Fonte |
|---|---|---|
| D1 | Tauri 2 + backend Rust + frontend Svelte 5/TypeScript | Scelta utente 2026-11-05 |
| D2 | Il codice C# viene rimosso, la nuova app sostituisce tutto | Scelta utente 2026-11-05 |
| D3 | Protocollo: **solo `rmodbus` 0.13** per costruire/interpretare frame RTU, ASCII, TCP/UDP. Nostro solo l'I/O (socket, seriale) | Inventario sotto + scelta utente |
| D4 | FC22 (mask write) e FC23 (read/write multiple) **fuori dalla v1** | Non supportate da `rmodbus` 0.13 (vedi inventario) |
| D5 | Conversioni dei tipi di dato e simulazione valori vivono **solo nel frontend** (TS) | Una sola implementazione delle conversioni (regola REUSABLE CODE) |
| D6 | Il nome delle eccezioni si ricava dal byte grezzo del frame, non da `rmodbus` | Incoerenza misurata in `rmodbus` (sotto) |

## Inventario (misurato 2026-11-05 sul sorgente installato)

**`tokio-modbus` 0.17.0** (`~/.cargo/registry/src/*/tokio-modbus-0.17.0/src`): client/server TCP,
RTU seriale, server RTU-over-TCP; FC 1-6, 15, 16, 22, 23, 0x2B/0x0E, custom. **Nessuna**
occorrenza di ASCII o UDP (`grep -rn "ascii\|udp"` = 0). Il modulo `codec` è `pub(crate)`:
nessun accesso ai frame grezzi.

**`rmodbus` 0.13.0** (Apache-2.0, ~240k download, dal 2020): codec di frame senza I/O.
- `ModbusProto::{Rtu, Ascii, TcpUdp}`; `client::ModbusRequest` genera FC 1, 2, 3, 4, 5, 6, 15, 16
  e interpreta le risposte (controlla tr_id, unit, CRC/LRC, eccezioni).
- `server::ModbusFrame::parse/process_read/process_write/finalize_response` con
  `server::context::ModbusContext`; storage a dimensione generica `ModbusStorage<C, D, I, H>`.
- `guess_request_frame_len` / `guess_response_frame_len` per leggere frame da uno stream.
- ASCII: `parse_ascii_frame` / `generate_ascii_frame` convertono tra testo e binario+LRC.
- `ModbusFrame::new(unit_id, ..)`: un frame per un solo unit id; con unit diverso `parse()`
  ritorna `Ok` senza richiedere risposta → il multi-unit si fa scegliendo lo storage dall'unit
  letto dal frame. Broadcast di default `&[0]`.

**Incoerenza misurata in `rmodbus`**: `ModbusErrorCode::GatewayPathUnavailable = 0x09`,
`GatewayTargetFailed = 0x0A` (`src/consts.rs`); `ErrorKind::from_modbus_error` mappa `0x09` e
`0x10` (`src/error.rs`). La specifica Modbus Application Protocol v1.1b3 §7 definisce `0x0A`
(Gateway Path Unavailable) e `0x0B` (Gateway Target Device Failed to Respond). Conseguenza: D6.

Scartate: `modbus-rs` (484 download, 2026), `stonecrab` (249 download, 2026-10): troppo giovani.

## Perimetro v1

Master:
- Link: TCP, UDP, RTU-over-TCP, RTU seriale, ASCII seriale. Timeout e retry configurabili.
- FC 1, 2, 3, 4 in lettura; FC 5, 6, 15, 16 in scrittura.
- **Più poll simultanei**, ognuno con unit id, funzione, indirizzo, quantità, intervallo;
  statistiche per poll (richieste, ok, errori, timeout, ultimo tempo di risposta).
- Scrittura dei valori dalla griglia.

Slave:
- Stessi link (in ascolto). **Più unit id**, ognuno con le sue 4 tabelle da 65536 elementi.
- Ritardo di risposta configurabile (come la v2).
- **Simulazione** valori: incremento, casuale, sinusoide, onda quadra/toggle.
- Import/export CSV (compatibile con il formato v2 `indirizzo:valore,...`).

Comune:
- **Tipi dati**: bit, uint16, int16, hex, binario, uint32, int32, float32, uint64, int64, float64,
  stringa ASCII; ordine parole/byte ABCD, CDAB, BADC, DCBA. Etichette per registro.
- **Monitor traffico** frame per frame: ora, origine (master/slave), direzione, byte, descrizione
  (funzione, unit, indirizzo, quantità, eccezione), esportabile CSV.
- **Trend**: grafico in tempo reale dei valori scelti.
- **Progetto** salvabile/caricabile in JSON. **Tema** chiaro/scuro.

Fuori dalla v1: FC22/23, FC 0x2B (device identification), Modbus TLS, parità mark/space e
1,5 stop bit (la v2 li aveva; il crate `serialport` 4 non li espone — da verificare se richiesti).

## Architettura

```
src-tauri/src/
  link.rs        configurazioni dei link, apertura seriale, ModbusProto per link
  frame_io.rs    lettura di un frame completo da uno stream con scadenza (guess_*_frame_len)
  describe.rs    descrizione leggibile di un frame per il monitor
  master.rs      connessione master: transazione richiesta→risposta, retry, timeout
  poller.rs      thread di poll
  slave.rs       server per link, storage per unit, ritardo
  traffic.rs     eventi traffico verso il frontend, a lotti
  commands.rs    comandi Tauri
  lib.rs         wiring
src/
  lib/datatypes.ts, csv.ts, project.ts, api.ts, stores
  lib/components/...   viste Master, Slave, Traffico, griglia registri, trend
```

I/O bloccante su thread `std` (come gli esempi di `rmodbus`), non async: niente runtime da
coordinare con il codec, e la seriale (`serialport`) è bloccante.

## Cosa questa spec NON dimostra

- Che `rmodbus` sia corretto su tutti i casi limite: lo si verifica con test contro
  un'implementazione indipendente (pymodbus) nella verifica finale.
- Prestazioni con molti poll a intervalli brevi: da misurare.
- Funzionamento su porte seriali reali: in questo ambiente solo pseudo-terminali.
