// Theme switch, and direct download links to the latest release's files. Without JavaScript or
// without the GitHub API, the links still lead to the release page.

const root = document.documentElement;

document.querySelector(".theme")?.addEventListener("click", () => {
  const next = root.dataset.theme === "light" ? "dark" : "light";
  root.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch {
    // Private windows can refuse storage: the switch still works for this visit.
  }
});

async function latestRelease() {
  const response = await fetch("https://api.github.com/repos/chetto1983/ModbusTool/releases/latest", {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}`);
  return response.json();
}

latestRelease()
  .then((release) => {
    for (const link of document.querySelectorAll("[data-asset]")) {
      const asset = release.assets.find((a) => a.name.endsWith(`.${link.dataset.asset}`));
      if (asset) link.href = asset.browser_download_url;
    }
    const version = document.querySelector("[data-latest-version]");
    if (version)
      version.textContent = `Version ${release.tag_name.replace(/^v/, "")}, released ${release.published_at.slice(0, 10)}.`;
    const label = document.querySelector("[data-latest-label]");
    if (label) label.textContent = `Download ${release.tag_name}`;
  })
  .catch(() => {
    // The links already point to the release page.
  });
