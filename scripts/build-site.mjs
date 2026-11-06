// Assembles the project page (site/) into _site for GitHub Pages: the page's own files, plus the
// app's design tokens, fonts, icon and screenshots, copied rather than duplicated in the repository.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const out = "_site";
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
cpSync("site", out, { recursive: true });
cpSync("src/assets/fonts", `${out}/fonts`, { recursive: true });
cpSync("docs/screenshots", `${out}/screenshots`, { recursive: true });
cpSync("src-tauri/icons/icon.svg", `${out}/icon.svg`);

// The font faces and the theme tokens are the top of the app's stylesheet, up to its first rule.
const css = readFileSync("src/app.css", "utf8");
const end = css.indexOf("\n* {");
if (end < 0) throw new Error("src/app.css: the tokens no longer end before the '* {' rule");
writeFileSync(`${out}/tokens.css`, css.slice(0, end).replaceAll("./assets/fonts/", "fonts/") + "\n");
console.log(`Site assembled in ${out}/`);
