# Linux: lingua della webview con locale C

Data: 2026-11-06. Stato: difetto trovato dall'E2E in CI (runner `ubuntu-24.04`, `LANG=C.UTF-8`).

## Il difetto

Con il locale C (`LANG=C.UTF-8`: WSL2, container, VM cloud, runner CI) la finestra resta vuota.
WebKitGTK riporta `navigator.language = "C"`, che non è un tag BCP 47; uPlot 1.6.32 esegue
`new Intl.NumberFormat(nav.language)` quando il suo modulo viene caricato
(`node_modules/uplot/dist/uPlot.esm.js:442`), il bundle lancia
`RangeError: invalid language tag: C` e l'app non si monta.

In locale la suite passava perché girava da root con `LANG` vuoto; da utente non-root con
`LANG=C.UTF-8`, come il runner, il difetto si riproduce.

## Decisioni

| # | Decisione | Fonte |
|---|---|---|
| L1 | Su Linux, nell'hook `setup`, se la prima lingua di `g_get_language_names()` è il locale C o POSIX, la webview riceve `en-US` con `webkit_web_context_set_preferred_languages` | [WebKitGTK](https://webkitgtk.org/reference/webkit2gtk/stable/method.WebContext.set_preferred_languages.html): imposta `navigator.language`, `navigator.languages` e la lingua predefinita di `Intl`. Misura sotto |
| L2 | Con una lingua vera la webview resta com'è | Misura: `en-US` fisso cambiava `it-IT` in `en-US` per un utente italiano |
| L3 | Nessun ritocco di `navigator` nel frontend: il valore si corregge dove nasce | — |

Inventario (versioni installate): wry 0.57.1 e Tauri 2.12.5 non impostano la lingua della webview
né offrono un'opzione per farlo; `webkit2gtk` 2.0.2 (già nell'albero tramite Tauri) espone
`WebContextExt::set_preferred_languages` e ri-esporta `glib` (`language_names`). Tauri crea le
finestre della configurazione e ne avvia il caricamento prima dell'hook `setup`
(`tauri-2.12.5/src/app.rs:2688`): che la chiamata arrivi in tempo andava misurato.

## Misura (2026-11-06, WebKitGTK 2.52.6, Ubuntu 24.04, Xvfb, utente non-root)

`navigator.language`, esito di `Intl.NumberFormat(navigator.language)` e montaggio dell'app,
4 s dopo l'avvio, tramite tauri-driver:

| Ambiente | Prima | Con L1 |
|---|---|---|
| `LANG=C.UTF-8` | `"C"`, `RangeError`, app non montata | `"en-US"`, app montata (3 run su 3) |
| `LANG=POSIX` | `"en-US"`, montata | `"en-US"`, montata |
| `LANG=it_IT.UTF-8` (locale generato) | `"it-IT"`, montata | `"it-IT"`, montata |
| `LANG=en_US.UTF-8` (locale generato) | `"en-US"`, montata | non cambia (L2) |

Suite E2E completa con L1: 88/88 da utente non-root con `LANG=C.UTF-8`, 88/88 da root.

## Cosa NON è dimostrato

- Solo WebKitGTK 2.52.6: altre versioni possono derivare `navigator.language` in altro modo.
- Non provato su WSL2 né su una sessione desktop reale (solo Xvfb).
- Con un locale non installato WebKit ha riportato `"en-US"`: senza i locale `it_IT` ed `en_US`
  generati, le misure con quei `LANG` non rappresentavano un utente reale.
