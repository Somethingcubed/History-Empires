# Empire History Timeline (`empire-timeline/`)

## Open the prototype (no coding)

**Do not double-click `index.html`.** Many browsers block loading `data/empires.json` from disk and you’ll see an error.

**macOS:**

1. Open **`empire-timeline`** in Finder  
2. **Double-click `Open Timeline Website.command`**  
3. Leave Terminal running. Manually open your browser and go to **`http://127.0.0.1:8787/`** (the Terminal window prints this address). Press **Ctrl+C** in Terminal when done.

Or in Terminal:

```bash
cd "/Users/oscar/Desktop/Projects/Politics Project/empire-timeline"
python3 -m http.server 8787
```

---

不要直接双击打开 `index.html`。请双击 **`Open Timeline Website.command`**，或在终端进入本目录运行 `python3 -m http.server 8787` 后用浏览器打开上面的地址。

## Stack

Vanilla ES5 JS、D3 v7（本地 `vendor/d3.v7.min.js`）、`data/empires.json`。

## What this build includes

- Zoomable / pannable bar timeline with era presets (Fit, Ancient, Medieval, Modern) and an overview strip for jumping in time.
- Search plus region, era, and religion filters; **Reset filters** restores defaults; status line shows visible vs total empires (muted regions count as hidden).
- Layer toggles for bars, region bands, grid, and name labels; overlap highlighting on hover; clickable bars (keyboard **Enter**/**Space** when a bar is focused).
- Detail side panel (sheet on narrow viewports); **Escape** closes it when open.
- Region legend mute/unmute; on-chart hint when filters and mutes leave nothing visible.
- Intro canvas animation (skippable); skipped automatically when the user prefers reduced motion.

### Quick verification

From this directory run `python3 -m http.server 8787`, open `http://127.0.0.1:8787/`, and confirm the toolbar shows **200 empires** (or your row count) and the chart pans/zooms.

Geographic world map is **not** implemented; “region” here groups rows on the timeline, not map territory.

## GitHub (maintainer)

This repo is set up so you can push from your Mac:

```bash
cd "/Users/oscar/Desktop/Projects/Politics Project/empire-timeline"
git status
git push -u origin main
```

**First-time push:** GitHub no longer accepts account passwords for Git over HTTPS. Use a **Personal Access Token** (fine-grained or classic) as the password when Terminal asks: [GitHub → Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens). Username is your GitHub handle (`photoself-crypto`).

**Publish the site free (GitHub Pages):** Repo → **Settings** → **Pages** → Build: **Deploy from a branch** → Branch **main**, folder **/ (root)** → Save. After a minute, the site is at `https://photoself-crypto.github.io/History-Empires/` (GitHub shows the exact URL on the Pages settings page).

## Licenses

See `THIRD_PARTY_NOTICES.md`.
