# Empire History Timeline (`empire-timeline/`)

**Version 1 (current):** interactive timeline + world map with **OpenStreetMap** or **Esri satellite** basemaps, **historical-basemaps** polygon snapshots (~73 MB GeoJSON under `data/historical-basemaps/`, GPL-3.0), **continuous visual boundaries** (`data/empire-boundaries-continuous.geojson`) built from Timelory coordinate snapshots, Cliopatria, historical-basemap anchors, AtlasPI, and local prototype boundaries, plus sample battles/corridors. These map territories are intended for a casual historical-atlas view, not legal or academic border claims.

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

## Stack

Vanilla ES5 JavaScript, D3 v7 (local `vendor/d3.v7.min.js`), Leaflet, and static JSON/GeoJSON data.

## What this build includes

- Zoomable / pannable bar timeline with era presets (Fit, Ancient, Medieval, Modern) and an overview strip for jumping in time.
- Search plus region, era, and religion filters; **Reset filters** restores defaults; status line shows visible vs total empires (muted regions count as hidden).
- Layer toggles for bars, region bands, grid, and name labels; overlap highlighting on hover; clickable bars (keyboard **Enter**/**Space** when a bar is focused).
- Detail side panel (sheet on narrow viewports); **Escape** closes it when open.
- Region legend mute/unmute; on-chart hint when filters and mutes leave nothing visible.
- Intro canvas animation (skippable); skipped automatically when the user prefers reduced motion.
- **World map** tab: **Street (OSM)** or **Satellite (Esri)** via the layer control; optional **historical territories** from bundled **historical-basemaps** GeoJSON (loads the **latest snapshot year <=** the slider). **Continuous visual boundaries** now use real coordinate snapshots first: Timelory sampled-year GeoJSON, then Cliopatria time-slices, historical-basemap anchors, local prototype boundaries, and AtlasPI references. The map keeps one best polygon per empire per selected year and does not scale polygons artificially. Verify boundaries before scholarly use; see `THIRD_PARTY_NOTICES.md`.

### Quick verification

From this directory run `python3 -m http.server 8787`, open `http://127.0.0.1:8787/`, and confirm the toolbar shows **200 empires** (or your row count) and the chart pans/zooms.

**Full scholarly per-year frontiers for all 200 rows** are not complete. The current map is a visual continuity layer: 154 empires currently have sourced polygon references, and the remaining active empires still appear through the existing point/circle layer until better boundary data is added.

### Version 2 research (for another AI)

Use this prompt to produce a review document or structured dataset plan (do not paste secrets):

```text
You are a historical GIS research assistant. The app already has ~200 empire rows in JSON with fields: id, name, region (macro label), startYear, endYear, color, description, etc. Version 2 needs ADDABLE geographic data WITHOUT breaking V1.

TASK
1) Survey **open, reusable** sources for empire/state boundaries over time, with **clear licenses** (public domain, CC-BY, ODbL where attribution is documented). Examples to evaluate (not limited to): Natural Earth (admin), GADM (check license for web use), Wikidata shapes, WHG/Pleiades (antiquity), CHGIS (China), DARMC (late antiquity, check terms), and academic shapefile repositories cited in papers.
2) For each source: **license summary**, **coverage (dates & places)**, **format** (GeoJSON, shapefile, TopoJSON), **granularity** (country vs province), **update cadence**, and **attribution text** we must ship in the UI.
3) Propose a **schema** for “temporal features”: e.g. FeatureCollection where each feature has properties: empireId (match our slug), validFrom (integer year), validTo (integer year), label, sourceId, confidence (high|medium|low), notes. Multiple features per empireId are OK (discontiguous or phase changes).
4) Explain **topological pitfalls**: disputed borders, anachronistic modern coastlines vs historical, projection (EPSG:4326 for storage), generalization for web performance, and simplification tolerance (e.g. Visvalingam).
5) Deliver a **prioritized migration plan**: MVP (10–20 empires with best sources) → full coverage, and a **risk register** (where we must NOT claim precision).
6) Output should end with a **bibliography** and a **recommended folder layout** for the repo: e.g. data/geo/v2/features.geojson + data/geo/v2/SOURCES.md.

CONSTRAINTS
- Assume the web stack is static (GitHub Pages): no server-side PostGIS at first; client can load simplified GeoJSON or vector tiles if size allows.
- Our timeline years use negative integers for BCE; schema must align.
```

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
