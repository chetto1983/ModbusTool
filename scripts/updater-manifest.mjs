// Writes the updater manifest (latest.json) for a release whose packages are already signed with
// `tauri signer sign` (each <package>.sig next to it). Format: v2.tauri.app/plugin/updater,
// "Static JSON File"; the updater looks for "{os}-{arch}-{installer}", then "{os}-{arch}"
// (tauri-plugin-updater 2.14.1, src/updater.rs).
//
//   node scripts/updater-manifest.mjs <version> <notes-file> <download-base-url> <package>...
//
// Prints the manifest to stdout. Every package must be an .msi, .deb or .AppImage.

import { readFileSync } from "node:fs";
import { basename } from "node:path";

const KEYS = {
  ".msi": ["windows-x86_64-msi", "windows-x86_64"],
  ".AppImage": ["linux-x86_64-appimage", "linux-x86_64"],
  ".deb": ["linux-x86_64-deb"],
};

const [version, notesFile, baseUrl, ...packages] = process.argv.slice(2);
if (!version || !notesFile || !baseUrl || packages.length === 0) {
  console.error("usage: updater-manifest.mjs <version> <notes-file> <download-base-url> <package>...");
  process.exit(2);
}

const platforms = {};
for (const file of packages) {
  const extension = Object.keys(KEYS).find((ext) => file.endsWith(ext));
  if (!extension) throw new Error(`${file}: not an .msi, .deb or .AppImage`);
  // The signature itself, not a path: "A path or URL does not work!" (updater docs).
  const entry = { signature: readFileSync(`${file}.sig`, "utf8").trim(), url: `${baseUrl}/${basename(file)}` };
  for (const key of KEYS[extension]) {
    if (platforms[key]) throw new Error(`two packages for ${key}`);
    platforms[key] = entry;
  }
}

const manifest = {
  version,
  notes: readFileSync(notesFile, "utf8").trim(),
  pub_date: new Date().toISOString(),
  platforms,
};
console.log(JSON.stringify(manifest, null, 2));
