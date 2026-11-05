# Firma del codice Windows con SignPath

Data: 2026-11-05. Stato: approvata dall'utente (SignPath, solo MSI su Windows).

## Obiettivo

Firmare l'installer Windows delle release, così Windows mostra un editore e Smart App Control
non blocca l'app.

## Decisioni

| # | Decisione | Fonte |
|---|---|---|
| S1 | **SignPath Foundation**: gratuito per progetti open source, chiave su HSM di SignPath, firma da GitHub Actions | Scelta utente 2026-11-05 |
| S2 | Su Windows si pubblica **solo l'MSI**: SignPath firma anche l'eseguibile dentro l'MSI ("deep signing"), non dentro un installer NSIS | Scelta utente 2026-11-05, documentazione SignPath sotto |
| S3 | La firma avviene **dopo** la build, nel workflow Release: artifact non firmato → richiesta a SignPath → MSI firmato pubblicato. Senza le variabili SignPath la release esce non firmata | Pattern documentato da SignPath per GitHub |
| S4 | Il workflow Release può partire anche a mano (Run workflow) con il tag come input: il tag lo crea `gh release create` | La sessione di sviluppo non può pushare tag (policy del proxy, 403) |

## Fatti verificati (2026-11-05)

- Azure Artifact Signing: privati solo in USA/Canada; un privato in Italia non è idoneo
  (learn.microsoft.com/azure/artifact-signing/quickstart).
- Nessun certificato (OV, EV, Artifact Signing) toglie subito l'avviso SmartScreen: la
  reputazione si accumula con le installazioni (learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation).
- Condizioni SignPath Foundation (signpath.org/terms): licenza OSI, progetto mantenuto e già
  rilasciato nella forma da firmare, "Code signing policy" sulla pagina del progetto con ruoli e
  privacy, MFA per tutto il team, approvazione manuale di ogni firma, metadati prodotto imposti,
  tutti i job su runner GitHub-hosted. Il certificato è intestato a SignPath Foundation.
- Action `signpath/github-action-submit-signing-request` v3 (SHA f6d0478): input `api-token`,
  `organization-id`, `project-slug`, `signing-policy-slug`, `github-artifact-id`,
  `wait-for-completion`, `output-artifact-directory`, `parameters`; timeout di attesa
  predefinito 600 s (README dell'action), portato a 21 000 s per l'approvazione manuale.
- Artifact configuration (docs.signpath.io/artifact-configuration): `<zip-file>` come radice
  (upload-artifact fa uno ZIP), `<msi-file>` con `<pe-file>` annidato per il deep signing,
  parametri dichiarati in `<parameters>` e usati come `${version}`. Nessun elemento NSIS tra i
  tipi supportati.
- Tauri: `ProductName` = `productName`, `ProductVersion`/`FileVersion` = `version` nella risorsa
  di versione dell'eseguibile (tauri-build 2.7.4, `src/lib.rs`). Il binario principale nell'MSI ha
  il nome dell'output Cargo, `modbus-tool.exe` (tauri-utils `mainBinaryName`, tauri-bundler
  `main.wxs` alla CLI 2.12.4).

## Cosa NON è dimostrato

- La configurazione degli artefatti non è stata provata su SignPath: va validata con "Upload an
  artifact sample" usando un artifact `windows-unsigned` della CI.
- Il formato della cartella in cui l'action scarica l'artefatto firmato (`signed/*.msi`) è dedotto
  dalla documentazione, non osservato.
- L'accettazione del progetto da parte di SignPath Foundation.
