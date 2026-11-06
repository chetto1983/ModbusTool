# Publishing to winget and Flathub

Both stores take a package through a pull request from the maintainer's GitHub account to a
repository they own (`microsoft/winget-pkgs`, `flathub/flathub`). This repository holds what those
pull requests need; opening them is the maintainer's step.

## winget (Windows Package Manager)

Package identifier: `chetto1983.ModbusTool`. Installer: the release's MSI
(`ModbusTool_<version>_x64_en-US.msi`, publisher `chetto1983` from 3.4.0).

**First submission, by hand on Windows** (winget-pkgs reviews the first version of a package):

```powershell
winget install Microsoft.WingetCreate
wingetcreate new https://github.com/chetto1983/ModbusTool/releases/download/v3.4.0/ModbusTool_3.4.0_x64_en-US.msi
```

`wingetcreate new` reads the MSI (product code, version, publisher) and asks for the rest. Give:

- Package identifier `chetto1983.ModbusTool`
- License `MIT`, license URL `https://github.com/chetto1983/ModbusTool/blob/master/LICENSE`
- Short description `Modbus master and slave with live dashboards`

At the end, answer yes to submitting. It forks `winget-pkgs` under your account and opens the pull
request. A bot validates it and runs the installer in a sandbox. Unsigned MSIs are accepted, but
SmartScreen still warns when the installer runs.

**Later versions, automatic**: the `winget` job of the Release workflow submits each new version
with `wingetcreate update`. It needs a repository secret `WINGET_TOKEN`: a classic personal access
token with the `public_repo` scope, from the account that holds the `winget-pkgs` fork. Without
the secret the job does nothing. The job downloads a pinned `wingetcreate` and checks its SHA-256
before running it.

## Flathub

App id: `io.github.chetto1983.modbustool`, the same as `identifier` in `tauri.conf.json`. Flathub
verifies an `io.github.<user>` id against the GitHub account of the same name.

Files in `packaging/flatpak/`:

| File | Checked |
|---|---|
| `io.github.chetto1983.modbustool.metainfo.xml` | `appstreamcli validate --no-net`: passes |
| `io.github.chetto1983.modbustool.desktop` | `desktop-file-validate`: passes |
| `io.github.chetto1983.modbustool.yml` | **Not built yet.** It follows the open-source path of the [Tauri Flathub guide](https://v2.tauri.app/distribute/flatpak/); `flatpak-builder` was not available where it was written |

**Before submitting**:

1. **Turn off the self-updater inside Flatpak.** Flathub updates the app. The in-app updater would
   download the AppImage from the GitHub release instead, so it has to be disabled when the app
   runs in a Flatpak (the `FLATPAK_ID` environment variable is set there). This is a code change
   and is not done yet.
2. **Pick the GNOME runtime.** The manifest uses `47`, the Tauri guide's version. Use a runtime
   Flathub still supports that ships `webkit2gtk-4.1`, and update `runtime-version`.
3. **Generate the offline sources.** The Flatpak build has no network. Generate them with
   [flatpak-builder-tools](https://github.com/flatpak/flatpak-builder-tools) at the tag being
   published:

   ```sh
   python3 flatpak-builder-tools/cargo/flatpak-cargo-generator.py src-tauri/Cargo.lock -o cargo-sources.json
   flatpak-node-generator npm package-lock.json -o node-sources.json
   ```

4. **Build and run it locally**, then fix what fails:

   ```sh
   flatpak-builder --force-clean --user --install-deps-from=flathub --repo=repo build \
     packaging/flatpak/io.github.chetto1983.modbustool.yml
   flatpak-builder --run build packaging/flatpak/io.github.chetto1983.modbustool.yml modbus-tool
   ```

   Check that TCP, UDP and a USB serial adapter all work from inside the sandbox.

**Submitting** (from the [Tauri guide](https://v2.tauri.app/distribute/flatpak/)): fork
`flathub/flathub`, clone the `new-pr` branch, add the manifest and the two generated JSON files on
a branch named after the app, and open a pull request against `new-pr`. After the review, Flathub
gives you a repository for the app, where later versions are updated.
