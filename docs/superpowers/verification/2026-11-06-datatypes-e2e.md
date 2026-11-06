# Verifica — tutti i tipi di dato contro pymodbus

Data: 2026-11-06. Richiesta utente: "prova tutti i tipi di variabile" (dopo un sospetto baco sui
Float32, rivelatosi una lettura vecchia).

## Cosa è stato misurato

App vera (Linux, tauri-driver), E2E 75/75 (`node e2e/run.mjs`). Nuovo `e2e/types.mjs`: per ogni
tipo e ordine dei byte (UInt16, Int16, Hex, Binary, ASCII; UInt32, Int32, Float32, UInt64, Int64,
Float64 × ABCD, CDAB, BADC, DCBA: 29 gruppi), sia sul **master** (contro il server pymodbus) sia
sullo **slave** (contro il client pymodbus):

- **decodifica**: pymodbus scrive i registri, la griglia deve mostrare i valori;
- **codifica**: un valore scritto nella griglia deve arrivare a pymodbus come quei registri.

I registri attesi vengono da `e2e/typed_values.py`: `convert_to_registers` di pymodbus 3.16.2
(ordine delle word big/little = ABCD/CDAB) e scambio dei byte per BADC/DCBA; nessun codice in
comune con `src/lib/datatypes.ts`. Valori agli estremi di ogni tipo, negativi, frazionari e il
caso dell'utente (Float32 33.35503).

## Trovato e corretto

- **Float64**: il valore massimo finito (1.7976931348623157e308) era mostrato `Infinity` in
  ogni ordine, su master e slave: la visualizzazione a 15 cifre lo arrotondava oltre il massimo.
  Ora il Float64 si mostra esatto (il testo più corto che rilegge lo stesso double, `-0` con il
  segno). La proprietà di andata e ritorno dei test unitari era troppo debole (confrontava il
  testo con sé stesso) e l'ha nascosto: ora per Float64 richiede gli stessi registri.
- ASCII `"~ "` letto `"~"`: limite del test (WebDriver `getText` toglie gli spazi ai bordi), non
  dell'app; il valore E2E è `"~}"` e lo spazio è coperto da un test unitario.

Mutation `src/lib/datatypes.ts` (Stryker): 78.11%.

## Cosa NON dimostra

- Windows (WebView2) e i link seriali: i tipi sono provati su TCP; la conversione non dipende dal
  link.
- Float32: mostrato con 7 cifre significative, quindi due float32 vicini possono apparire uguali.
