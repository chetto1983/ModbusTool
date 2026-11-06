# Signing the Windows installer with SignPath

Decision and verified facts: `docs/superpowers/specs/2026-11-05-signing-design.md`.
The Release workflow already contains the signing job; it stays skipped until the steps below
are done, and releases are published unsigned meanwhile.

## 1. Before applying

- Enable two-factor authentication on the GitHub account of every maintainer (required).
- The README carries the "Code signing policy" section SignPath asks for: keep its roles and
  privacy statement accurate.
- At least one release must exist in the form to be signed (the MSI): v3.0.0.

## 2. Apply

Apply at <https://signpath.org/apply> for a free open-source subscription, pointing to
<https://github.com/chetto1983/ModbusTool>. SignPath Foundation reviews the project.

## 3. Configure SignPath (after acceptance)

1. Install the SignPath GitHub App on the repository and add the **GitHub.com** trusted build
   system to the SignPath project.
2. Create the project (e.g. slug `ModbusTool`) and an artifact configuration with the content of
   [`.signpath/artifact-configuration.xml`](../.signpath/artifact-configuration.xml). Validate it
   with *Upload an artifact sample*, using the `windows-unsigned` artifact of a Release run (or
   the `ModbusTool-Windows` artifact of a CI run).
3. Create a signing policy (e.g. slug `release-signing`) with manual approval by the maintainer.
4. Create an API token for a user with *submitter* permission on the policy.

## 4. Configure the repository

In GitHub, *Settings → Secrets and variables → Actions*:

| Kind | Name | Value |
|---|---|---|
| Secret | `SIGNPATH_API_TOKEN` | the API token |
| Variable | `SIGNPATH_ORGANIZATION_ID` | the SignPath organization id |
| Variable | `SIGNPATH_PROJECT_SLUG` | e.g. `ModbusTool` |
| Variable | `SIGNPATH_SIGNING_POLICY_SLUG` | e.g. `release-signing` |

Setting `SIGNPATH_PROJECT_SLUG` turns signing on.

## Updates (updater key)

Installed apps verify every update with the updater key (minisign), which is separate from the
SignPath certificate: `docs/superpowers/specs/2026-11-06-updater-design.md`. Once, on your PC:

1. `npx tauri signer generate -w ~/.tauri/modbustool.key` and choose a password. Keep the private
   key and the password safe and private: losing them means installed apps can no longer be
   updated, leaking them lets anyone publish an update they would accept.
2. In GitHub, *Settings → Secrets and variables → Actions*, add the secrets
   `TAURI_SIGNING_PRIVATE_KEY` (the content of `~/.tauri/modbustool.key`) and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
3. Put the content of `~/.tauri/modbustool.key.pub` (the public key, not secret) in
   `plugins.updater.pubkey` of `src-tauri/tauri.conf.json`.

The Release workflow signs the MSI (after SignPath), the .deb and the AppImage with that key and
publishes `latest.json` with the release. Without the secret the release stops.

## 5. Release

1. Update the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`,
   and add the dated section to `CHANGELOG.md`; merge to `master`.
2. Push the tag `vX.Y.Z`, or run the Release workflow from the Actions tab with the tag as input.
3. Approve the signing request in SignPath within 6 hours (the job's limit).
4. The release is published with the signed MSI, the Linux packages, their updater signatures
   (`.sig`) and `latest.json`; installed apps that check for updates offer it.

If signing fails or is rejected, the release is not published: fix and run the workflow again.
