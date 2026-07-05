#!/usr/bin/env python3
import json
import re
import ssl
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "empire-boundaries-continuous.geojson"
ATLASPI_URL = "https://atlaspi.cra-srl.com/v1/export/geojson"
TIMELORY_URL = "https://api.timelory.com/api/regions/postgis?year={year}"

SNAPSHOT_MATCHES = {
    "russian-empire": ["russia", "russian empire", "russian federation"],
    "british-empire": ["british empire", "united kingdom", "great britain", "britain"],
    "french-empire-napoleonic": ["french empire", "france"],
    "kingdom-of-france": ["france", "kingdom of france"],
    "spanish-habsburg-empire": ["spain", "spanish empire"],
    "bourbon-spain": ["spain", "spanish empire"],
    "portuguese-empire": ["portugal", "portuguese empire"],
    "dutch-republic": ["netherlands", "dutch empire", "dutch republic"],
    "ottoman-empire": ["ottoman empire", "turkey"],
    "holy-roman-empire": ["holy roman empire", "germany"],
    "mongol-empire": ["mongol empire", "mongols"],
    "roman-empire": ["roman empire", "rome"],
    "byzantine-empire": ["byzantine empire", "eastern roman empire"],
    "mughal-empire": ["mughal empire", "mughals"],
    "qing-dynasty": ["qing", "qing dynasty", "china"],
    "ming-dynasty": ["ming", "ming dynasty", "china"],
    "safavid-empire": ["safavid", "persia"],
    "qajar-dynasty": ["qajar", "persia", "iran"],
    "soviet-union": ["soviet union", "ussr"],
    "german-empire": ["german empire", "germany"],
    "austro-hungarian-empire": ["austria-hungary", "austro-hungarian empire", "austria"],
}

ATLASPI_ALIASES = {
    "Royaume de France": "kingdom-of-france",
    "British Empire": "british-empire",
    "Imperium Romanum": "roman-empire",
    "Roma": "roman-empire",
    "Byzantine Empire": "byzantine-empire",
    "Ottoman Empire": "ottoman-empire",
    "Mongol Empire": "mongol-empire",
    "Russian Empire": "russian-empire",
    "Empire russe": "russian-empire",
    "Soviet Union": "soviet-union",
}

TIMELORY_CONTAINS = {
    "british-empire": ["british", "united kingdom", "great britain"],
    "russian-empire": ["russian empire"],
    "ottoman-empire": ["ottoman"],
    "mongol-empire": ["mongol"],
    "roman-empire": ["roman empire"],
    "holy-roman-empire": ["holy roman"],
    "portuguese-empire": ["portuguese", "portugal"],
    "dutch-republic": ["dutch", "netherlands"],
    "spanish-habsburg-empire": ["spanish", "spain"],
    "bourbon-spain": ["spanish", "spain"],
    "french-empire-napoleonic": ["french empire"],
    "kingdom-of-france": ["kingdom of france", "france"],
    "austro-hungarian-empire": ["austro", "austria hungary"],
    "german-empire": ["german empire"],
    "soviet-union": ["soviet"],
    "british-raj": ["british raj"],
}

TIMELORY_EXACT_ALIASES = {
    "Imperial Japan (Fujiwara)": "heian-japan",
    "British Raj": "british-raj",
}


def load_json(path):
    return json.loads(path.read_text())


def norm(text):
    text = re.sub(r"[^a-z0-9]+", " ", str(text or "").lower())
    return re.sub(r"\s+", " ", text).strip()


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", str(text or "").lower()).strip("-")


def year_mid(emp):
    return round((emp["startYear"] + emp["endYear"]) / 2)


def feature_area(props):
    return props.get("areaKm2") or props.get("peakAreaKm2") or 0


def round_coord(value):
    return round(float(value), 3)


def compact_coords(coords):
    if isinstance(coords, list) and coords and isinstance(coords[0], (int, float)):
        return [round_coord(coords[0]), round_coord(coords[1])]
    return [compact_coords(item) for item in coords]


def compact_geometry(geometry):
    if not geometry:
        return None
    return {"type": geometry.get("type"), "coordinates": compact_coords(geometry.get("coordinates", []))}


def copy_feature(ft, props):
    geom = compact_geometry(ft.get("geometry"))
    if not geom:
        return None
    return {"type": "Feature", "properties": props, "geometry": geom}


def best_peak_years(cli_features, empires):
    peaks = {e["id"]: year_mid(e) for e in empires}
    best_area = {}
    for ft in cli_features:
        props = ft.get("properties") or {}
        emp_id = props.get("id")
        area = feature_area(props)
        if emp_id and area > best_area.get(emp_id, -1):
            best_area[emp_id] = area
            peaks[emp_id] = props.get("peakYear") or props.get("toYear") or props.get("fromYear") or peaks.get(emp_id)
    return peaks


def add_cliopatria(features, cli, empires_by_id, peak_years):
    for ft in cli.get("features", []):
        p = ft.get("properties") or {}
        emp_id = p.get("id")
        emp = empires_by_id.get(emp_id)
        if not emp:
            continue
        props = dict(p)
        props.update(
            {
                "id": emp_id,
                "name": emp["name"],
                "source": "cliopatria",
                "sourceUrl": "https://github.com/Seshat-Global-History-Databank/cliopatria",
                "confidence": 0.88,
                "generationMethod": "source-time-slice",
                "temporalAccuracy": "slice",
                "coverageStart": emp["startYear"],
                "coverageEnd": emp["endYear"],
                "peakYear": peak_years.get(emp_id, year_mid(emp)),
            }
        )
        copied = copy_feature(ft, props)
        if copied:
            features.append(copied)


def add_prototype(features, proto, empires_by_id, peak_years):
    for ft in proto.get("features", []):
        p = ft.get("properties") or {}
        emp_id = p.get("id")
        emp = empires_by_id.get(emp_id)
        if not emp:
            continue
        props = dict(p)
        props.update(
            {
                "id": emp_id,
                "name": emp["name"],
                "fromYear": props.get("peakYear") or peak_years.get(emp_id, year_mid(emp)),
                "toYear": props.get("peakYear") or peak_years.get(emp_id, year_mid(emp)),
                "source": "prototype-boundaries",
                "sourceUrl": "local:data/empire-boundaries-30.geojson",
                "confidence": 0.72,
                "generationMethod": "source-peak-reference",
                "temporalAccuracy": "reference",
                "coverageStart": emp["startYear"],
                "coverageEnd": emp["endYear"],
                "peakYear": props.get("peakYear") or peak_years.get(emp_id, year_mid(emp)),
            }
        )
        copied = copy_feature(ft, props)
        if copied:
            features.append(copied)


def add_historical_snapshots(features, index, empires_by_id, peak_years):
    wanted = {emp_id: [norm(x) for x in labels] for emp_id, labels in SNAPSHOT_MATCHES.items()}
    for snap in index.get("years", []):
        year = snap.get("year")
        filename = snap.get("filename")
        if not isinstance(year, int) or not filename:
            continue
        path = DATA / "historical-basemaps" / "geojson" / filename
        if not path.exists():
            continue
        geo = load_json(path)
        for ft in geo.get("features", []):
            p = ft.get("properties") or {}
            labels = [norm(p.get("NAME")), norm(p.get("SUBJECTO")), norm(p.get("PARTOF"))]
            joined = " ".join(labels)
            for emp_id, aliases in wanted.items():
                emp = empires_by_id.get(emp_id)
                if not emp or year < emp["startYear"] or year > emp["endYear"]:
                    continue
                if not any(a and a in joined for a in aliases):
                    continue
                props = {
                    "id": emp_id,
                    "name": emp["name"],
                    "fromYear": year,
                    "toYear": year,
                    "source": "historical-basemap",
                    "sourceUrl": "https://github.com/aourednik/historical-basemaps",
                    "confidence": 0.62,
                    "generationMethod": "source-snapshot-anchor",
                    "temporalAccuracy": "snapshot",
                    "coverageStart": emp["startYear"],
                    "coverageEnd": emp["endYear"],
                    "peakYear": peak_years.get(emp_id, year_mid(emp)),
                    "sourceName": p.get("NAME") or p.get("SUBJECTO") or "",
                    "sourceYear": year,
                }
                copied = copy_feature(ft, props)
                if copied:
                    features.append(copied)


def atlaspi_export():
    context = ssl._create_unverified_context()
    with urllib.request.urlopen(ATLASPI_URL, timeout=80, context=context) as response:
        return json.loads(response.read().decode("utf-8"))


def match_atlaspi(props, empires_by_slug):
    names = [props.get("name"), props.get("name_original")]
    for name in names:
        if name in ATLASPI_ALIASES:
            return ATLASPI_ALIASES[name]
        s = slug(name)
        if s in empires_by_slug:
            return empires_by_slug[s]["id"]
    return None


def add_atlaspi(features, empires_by_id, empires_by_slug, peak_years):
    atlas = atlaspi_export()
    for ft in atlas.get("features", []):
        p = ft.get("properties") or {}
        emp_id = match_atlaspi(p, empires_by_slug)
        emp = empires_by_id.get(emp_id)
        if not emp:
            continue
        peak = peak_years.get(emp_id, year_mid(emp))
        props = {
            "id": emp_id,
            "name": emp["name"],
            "fromYear": peak,
            "toYear": peak,
            "source": "atlaspi",
            "sourceUrl": "https://github.com/Soil911/AtlasPI",
            "confidence": min(0.75, float(p.get("confidence_score") or 0.62)),
            "generationMethod": "visual-atlas-lifetime-reference",
            "temporalAccuracy": "reference",
            "coverageStart": emp["startYear"],
            "coverageEnd": emp["endYear"],
            "peakYear": peak,
            "sourceName": p.get("name") or p.get("name_original") or "",
            "sourceEntityType": p.get("entity_type") or "",
        }
        copied = copy_feature(ft, props)
        if copied:
            features.append(copied)


def timelory_years(empires):
    years = set(range(-1000, 2027, 50))
    years.update(range(1000, 2027, 25))
    years.update(
        [
            -550,
            -221,
            -27,
            117,
            395,
            476,
            632,
            750,
            800,
            962,
            1206,
            1279,
            1299,
            1453,
            1492,
            1526,
            1530,
            1600,
            1648,
            1683,
            1715,
            1721,
            1757,
            1783,
            1804,
            1815,
            1858,
            1880,
            1900,
            1914,
            1918,
            1920,
            1926,
            1938,
            1945,
            1960,
            1991,
            1994,
            2000,
            2010,
        ]
    )
    return sorted(y for y in years if -1000 <= y <= 2026 and y != 0)


def timelory_fetch(year, context):
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json", "Referer": "https://timelory.com/atlas"}
    request = urllib.request.Request(TIMELORY_URL.format(year=year), headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=15, context=context) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        print("skip timelory", year, exc.code)
        return []
    if data.get("success") and isinstance(data.get("data"), dict):
        return data["data"].get("features", [])
    return []


def timelory_match_ids(name, year, empires_by_id, empires_by_slug):
    if not name or name == "Unnamed Region":
        return []
    if name in TIMELORY_EXACT_ALIASES:
        emp_id = TIMELORY_EXACT_ALIASES[name]
        emp = empires_by_id.get(emp_id)
        return [emp_id] if emp and emp["startYear"] <= year <= emp["endYear"] else []
    s = slug(name)
    if s in empires_by_slug:
        emp = empires_by_slug[s]
        if emp["startYear"] <= year <= emp["endYear"]:
            return [emp["id"]]
    n = norm(name)
    matches = []
    for emp_id, aliases in TIMELORY_CONTAINS.items():
        emp = empires_by_id.get(emp_id)
        if not emp or year < emp["startYear"] or year > emp["endYear"]:
            continue
        if any(alias in n for alias in aliases):
            if emp_id == "roman-empire" and "holy roman" in n:
                continue
            if emp_id == "russian-empire" and "soviet" in n:
                continue
            matches.append(emp_id)
    return matches


def geometry_to_polygons(geometry):
    if not geometry:
        return []
    if geometry.get("type") == "Polygon":
        return [geometry.get("coordinates", [])]
    if geometry.get("type") == "MultiPolygon":
        return geometry.get("coordinates", [])
    return []


def add_timelory(features, empires, empires_by_id, empires_by_slug, peak_years):
    context = ssl._create_unverified_context()
    years = timelory_years(empires)
    for index, year in enumerate(years):
        print("timelory", year, flush=True)
        next_year = years[index + 1] - 1 if index + 1 < len(years) else year
        grouped = {}
        for ft in timelory_fetch(year, context):
            p = ft.get("properties") or {}
            name = p.get("name") or p.get("NAME") or ""
            polygons = geometry_to_polygons(ft.get("geometry"))
            if not polygons:
                continue
            for emp_id in timelory_match_ids(name, year, empires_by_id, empires_by_slug):
                grouped.setdefault(emp_id, {"names": set(), "polygons": []})
                grouped[emp_id]["names"].add(str(name))
                grouped[emp_id]["polygons"].extend(polygons)
        for emp_id, item in grouped.items():
            emp = empires_by_id[emp_id]
            from_year = max(year, emp["startYear"])
            to_year = min(next_year, emp["endYear"])
            if from_year > to_year:
                continue
            props = {
                "id": emp_id,
                "name": emp["name"],
                "fromYear": from_year,
                "toYear": to_year,
                "source": "timelory",
                "sourceUrl": "https://timelory.com/api-docs.html",
                "confidence": 0.74,
                "generationMethod": "visual-atlas-yearly-geojson",
                "temporalAccuracy": "snapshot-series",
                "coverageStart": emp["startYear"],
                "coverageEnd": emp["endYear"],
                "peakYear": peak_years.get(emp_id, year_mid(emp)),
                "sourceName": "; ".join(sorted(item["names"])[:8]),
                "sourceYear": year,
            }
            features.append(
                {
                    "type": "Feature",
                    "properties": props,
                    "geometry": compact_geometry({"type": "MultiPolygon", "coordinates": item["polygons"]}),
                }
            )


def main():
    empires = load_json(DATA / "empires.json")
    empires_by_id = {e["id"]: e for e in empires}
    empires_by_slug = {slug(e["name"]): e for e in empires}
    cli = load_json(DATA / "cliopatria-expanded-boundaries.geojson")
    proto = load_json(DATA / "empire-boundaries-30.geojson")
    index = load_json(DATA / "historical-basemaps" / "index.json")
    peak_years = best_peak_years(cli.get("features", []), empires)

    features = []
    add_timelory(features, empires, empires_by_id, empires_by_slug, peak_years)
    add_cliopatria(features, cli, empires_by_id, peak_years)
    add_prototype(features, proto, empires_by_id, peak_years)
    add_historical_snapshots(features, index, empires_by_id, peak_years)
    add_atlaspi(features, empires_by_id, empires_by_slug, peak_years)

    out = {
        "type": "FeatureCollection",
        "properties": {
            "name": "Empire continuous visual boundary references",
            "description": "Mixed-source historical boundary anchors for casual visual continuity.",
            "sources": ["timelory", "cliopatria", "historical-basemap", "prototype-boundaries", "atlaspi"],
        },
        "features": features,
    }
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    ids = {f["properties"]["id"] for f in features}
    print("features", len(features))
    print("covered_empires", len(ids), "of", len(empires))
    print("output", OUT)


main()
