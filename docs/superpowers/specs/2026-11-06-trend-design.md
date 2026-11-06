# Trend: valori campionati e finestra temporale

Data: 2026-11-06. Stato: richiesta utente (onde quadre viste come triangoli, scala dei tempi).

## Decisioni

| # | Decisione | Fonte |
|---|---|---|
| T1 | Tracciato **a gradini** (`uPlot.paths.stepped`, `align: 1`): un valore letto da un poll vale fino al campione successivo. Le rette tra campioni trasformano un'onda quadra campionata una volta per livello in un triangolo | Misura 2026-11-06 sotto; uPlot 1.6.32 `SteppedPathBuilderOpts` |
| T2 | **Finestra temporale** 10 s, 30 s, 1 min, 5 min, 10 min (`scale.range`: l'ultimo campione al bordo destro) | Richiesta utente |
| T3 | Storico per serie a **tempo** (10 min, la finestra più ampia) invece di 600 campioni: a 200 ms 600 campioni erano 2 minuti e la finestra "10 min" avrebbe mostrato meno di quanto dice | — |
| T4 | Asse dei tempi in HH:MM:SS a 24 ore nella lingua dell'interfaccia (`Intl.DateTimeFormat`), tacche a secondi interi | Il formato predefinito di uPlot era 12 h in inglese |

## Cosa NON è dimostrato

- Un segnale che cambia più in fretta dell'intervallo di poll resta sottocampionato: il trend
  mostra ciò che il master ha letto, non il segnale (Nyquist). Non è un difetto del grafico.
