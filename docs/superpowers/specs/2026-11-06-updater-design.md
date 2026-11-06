# Aggiornamento automatico

Data: 2026-11-06. Stato: approvata dall'utente ("come fa Aura"; consenso al primo avvio; chiave
generata dall'utente).

## Il modello di Aura, letto il 2026-11-06

`chetto1983/aura` `docs/superpowers/specs/2026-10-24-appliance-update-notice-design.md`,
`web/src/update/`: l'updater scarica le build liberamente ma le applica solo quando un admin lo
chiede (o di notte); un modal mostra la versione e permette di rimandare; il lavoro in corso
trattiene il riavvio. Aura è un'appliance Docker: si riprende il modello, non il meccanismo.

## Decisioni

| # | Decisione | Fonte |
|---|---|---|
| U1 | `tauri-plugin-updater` 2.14.1 + `tauri-plugin-process` 2.4.0 (riavvio). Manifest statico `latest.json` negli asset della release, endpoint `https://github.com/chetto1983/ModbusTool/releases/latest/download/latest.json` | v2.tauri.app/plugin/updater ("Static JSON File") |
| U2 | **Consenso al primo avvio**: "Cercare aggiornamenti automaticamente?". Sì: controllo all'avvio e ogni 6 ore. Sempre disponibile "Cerca aggiornamenti" a mano. La dichiarazione di privacy del README lo dice | Scelta utente 2026-11-06; la "Code signing policy" (SignPath) promette nessun contatto non richiesto |
| U3 | Nulla si installa senza consenso: modal con versione e note (la sezione del CHANGELOG), "Installa e riavvia" / "Più tardi". "Più tardi" vale per la sessione, come il modal di Aura (una volta per build per sessione). Con master connesso o slave in ascolto il modal avvisa che verranno fermati | Modello Aura |
| U4 | Pacchetti aggiornabili: MSI (`installMode: passive`), AppImage, `.deb` (`dpkg -i` con elevazione). Chiavi del manifest `windows-x86_64-msi`, `linux-x86_64-appimage`, `linux-x86_64-deb`, più `windows-x86_64` e `linux-x86_64` (MSI, AppImage) per gli updater che non conoscono il tipo di pacchetto | Sorgente `tauri-plugin-updater` 2.14.1 `src/updater.rs`: cerca `{os}-{arch}-{installer}` poi `{os}-{arch}`; `install_deb` |
| U5 | La firma dell'updater (minisign) si fa nel job `publish`, **dopo** SignPath, con `tauri signer sign`: la firma Authenticode modifica l'MSI, quindi una firma fatta in build non varrebbe più. `createUpdaterArtifacts` resta spento: la build non ha bisogno della chiave privata | CLI 2.12.4 `tauri signer sign --help` |
| U6 | Chiave dell'updater generata dall'utente sul suo PC; privata e password nei secret `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; la pubblica in `tauri.conf.json`. Senza secret la release fallisce: una release senza `latest.json` firmato lascerebbe gli utenti fermi senza avviso | Scelta utente 2026-11-06 |

## Cosa NON è dimostrato

- v3.0.0 non contiene l'updater: chi l'ha installata deve scaricare a mano la prima versione che
  lo contiene.
- L'aggiornamento MSI su Windows e `.deb` non sono provati in questa sessione (Linux, AppImage).
