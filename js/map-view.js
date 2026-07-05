/**
 * World map: Leaflet, OSM + Esri satellite basemaps, historical-basemaps GeoJSON (GPL-3.0),
 * empire circles (GeoBase), battles/routes, optional Kimi ancient-civilizations markers (CC BY-SA 4.0).
 */
(function (global) {
  "use strict";

  var state = {
    map: null,
    baseOSM: null,
    baseSat: null,
    historicalGrp: null,
    exactGrp: null,
    empireLay: null,
    battleLay: null,
    routeLay: null,
    ancientCivLay: null,
    empires: [],
    events: [],
    ancientCivFeatures: [],
    exactBoundaries: [],
    historicalYears: [],
    loadedFilename: null,
    histReq: 0,
    histDebounce: null,
    year: 1000,
    battleWindow: 45,
    showBattles: true,
    showRoutes: true,
    showHistorical: false,
    showExact: true,
    showAncientCiv: false
  };

  var BASemap_INDEX = "data/historical-basemaps/index.json";
  var BASemap_GEO = "data/historical-basemaps/geojson/";
  var EXACT_BOUNDARIES = "data/empire-boundaries-continuous.geojson";
  var ANCIENT_CIV_GEOJSON = "data/kimi-ancient-civilizations.geojson";

  function fmtY(y) {
    y = Math.round(y);
    if (y < 0) return Math.abs(y) + "\u202fBCE";
    return y + "\u202fCE";
  }

  function spanYears(e) {
    return Math.max(1, e.endYear - e.startYear);
  }

  function radiusM(e) {
    var sp = spanYears(e);
    return Math.min(950000, 55000 + Math.sqrt(sp) * 4200);
  }

  function yearFromDateObj(o) {
    if (!o || typeof o.value !== "number") return null;
    if (o.unit === "CE") return o.value;
    if (o.unit === "BCE") return o.value <= 0 ? o.value : -Math.abs(o.value);
    return o.value;
  }

  function civYearSpan(p) {
    var y0 = yearFromDateObj(p.date_begin);
    var y1 = yearFromDateObj(p.date_end);
    var dur = typeof p.duration_years === "number" ? p.duration_years : null;
    if (y0 != null && y1 != null) return { start: Math.min(y0, y1), end: Math.max(y0, y1) };
    if (y0 != null) {
      var end = y1;
      if (end == null && dur != null) end = y0 + dur;
      if (end == null) end = y0 + 400;
      return { start: Math.min(y0, end), end: Math.max(y0, end) };
    }
    if (y1 != null) {
      var start = y0;
      if (start == null && dur != null) start = y1 - dur;
      if (start == null) start = y1 - 400;
      return { start: Math.min(start, y1), end: Math.max(start, y1) };
    }
    return null;
  }

  function civConfidencePalette(conf) {
    var c = String(conf || "D").charAt(0).toUpperCase();
    if (c === "A") return { color: "#5eead4", fill: "#14b8a6" };
    if (c === "B") return { color: "#7dd3fc", fill: "#0ea5e9" };
    if (c === "C") return { color: "#fcd34d", fill: "#d97706" };
    return { color: "#94a3b8", fill: "#475569" };
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function civPopupHtml(props) {
    var p = props || {};
    var span = civYearSpan(p);
    var en = p.alt_names && typeof p.alt_names === "object" ? p.alt_names.en : "";
    var lines = [];
    lines.push("<strong>" + escHtml(p.primary_name || p.civilization_id || "?") + "</strong>");
    if (en) lines.push(escHtml(en));
    if (p.period_main) lines.push(escHtml(p.period_main));
    if (span) lines.push(fmtY(span.start) + " \u2013 " + fmtY(span.end));
    if (p.confidence_level) lines.push("\u7f6e\u4fe1\u5ea6\uff1a " + escHtml(String(p.confidence_level)));
    lines.push("<small>\u53e4\u6587\u660e GIS \u6807\u6ce8\uff08\u7814\u7a76\u7528\u6570\u636e\u96c6\uff0c\u975e\u7586\u57df\u4e3b\u5f20\uff09</small>");
    return lines.join("<br/>");
  }

  function fillForLabel(s) {
    var h = 0;
    s = String(s || "?");
    var i = 0;
    for (; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    var hue = Math.abs(h) % 360;
    return "hsla(" + hue + ",42%,48%,0.34)";
  }

  function exactBoundaryActive(emp, props) {
    if (!emp || !props) return false;
    if (props.temporalAccuracy === "reference") return false;
    var from = typeof props.fromYear === "number" ? props.fromYear : emp.startYear;
    var to = typeof props.toYear === "number" ? props.toYear : emp.endYear;
    if (state.year < from || state.year > to) return false;
    return true;
  }

  function empireActive(emp) {
    return !!(emp && state.year >= emp.startYear && state.year <= emp.endYear);
  }

  function exactBoundaryOpacity(emp, props) {
    if (!emp) return 0.18;
    var peakYear = typeof props.peakYear === "number" ? props.peakYear : state.year;
    var from = typeof props.fromYear === "number" ? props.fromYear : emp.startYear;
    var to = typeof props.toYear === "number" ? props.toYear : emp.endYear;
    var dur = Math.max(20, to - from || 20);
    var dist = Math.abs(state.year - peakYear);
    var closeness = Math.max(0, 1 - dist / dur);
    return 0.16 + closeness * 0.28;
  }

  function snapshotForYear(y, arr) {
    if (!arr || !arr.length) return null;
    var lo = 0;
    var hi = arr.length - 1;
    var ans = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (arr[mid].year <= y) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return arr[ans];
  }

  function setSnapshotLabel(snap) {
    var el = global.document.getElementById("map-snapshot-label");
    if (!el) return;
    if (!snap || !state.showHistorical) {
      el.textContent = "";
      return;
    }
    el.textContent =
      "Historical territories (snapshot): " +
      fmtY(snap.year) +
      " \u2014 " +
      snap.filename;
  }

  function setBoundaryStatus(count) {
    var el = global.document.getElementById("map-boundary-status");
    if (!el) return;
    if (!state.showExact) {
      el.textContent = "";
      return;
    }
    el.textContent =
      "Detailed boundaries: " +
      count +
      " shown for the selected year";
  }

  function styleHistoricalFeature(ft) {
    var p = ft.properties || {};
    var lab = p.SUBJECTO || p.NAME || "?";
    var prec = +p.BORDERPRECISION || 1;
    return {
      fillColor: fillForLabel(lab),
      fillOpacity: 0.16 + Math.min(prec, 3) * 0.06,
      color: "rgba(210,218,238,0.42)",
      weight: prec === 3 ? 0.95 : prec === 2 ? 0.55 : 0.38,
      dashArray: prec === 1 ? "5 8" : null
    };
  }

  function loadHistoricalForCurrentYear() {
    if (!state.map || !global.L || !state.historicalGrp) return;
    var L = global.L;
    if (!state.showHistorical || !state.historicalYears.length) {
      state.historicalGrp.clearLayers();
      state.loadedFilename = null;
      setSnapshotLabel(null);
      return;
    }
    var y = state.year;
    var snap = snapshotForYear(y, state.historicalYears);
    if (!snap) return;
    setSnapshotLabel(snap);
    var url = BASemap_GEO + snap.filename;
    state.histReq++;
    var my = state.histReq;
    global
      .fetch(url)
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (geo) {
        if (my !== state.histReq || !geo || !state.showHistorical) return;
        state.historicalGrp.clearLayers();
        L.geoJSON(geo, {
          style: styleHistoricalFeature,
          onEachFeature: function (f, layer) {
            var p = f.properties || {};
            var name = p.NAME != null ? String(p.NAME) : "";
            var sub = p.SUBJECTO != null ? String(p.SUBJECTO) : "";
            var pop =
              "<strong>" +
              name +
              "</strong>" +
              (sub && sub !== name ? "<br/><span style='opacity:0.85'>" + sub + "</span>" : "");
            layer.bindPopup(pop);
          }
        }).addTo(state.historicalGrp);
        state.loadedFilename = snap.filename;
      });
  }

  function sourceRank(source) {
    if (source === "timelory") return 6;
    if (source === "cliopatria") return 5;
    if (source === "historical-basemap") return 4;
    if (source === "prototype-boundaries") return 3;
    if (source === "atlaspi") return 2;
    return 0;
  }

  function redrawExactBoundaries() {
    if (!state.exactGrp || !global.L) return;
    state.exactGrp.clearLayers();
    if (!state.showExact || !state.exactBoundaries.length) {
      setBoundaryStatus(0);
      return;
    }
    var L = global.L;
    var byId = Object.create(null);
    var choiceById = Object.create(null);
    state.empires.forEach(function (e) {
      byId[e.id] = e;
    });

    function distanceToSlice(props) {
      if (props.temporalAccuracy === "reference") {
        var peak = typeof props.peakYear === "number" ? props.peakYear : state.year;
        return Math.abs(state.year - peak);
      }
      var from = typeof props.fromYear === "number" ? props.fromYear : state.year;
      var to = typeof props.toYear === "number" ? props.toYear : state.year;
      if (state.year >= from && state.year <= to) return 0;
      return state.year < from ? from - state.year : state.year - to;
    }

    function betterCandidate(next, prev) {
      if (!prev) return true;
      if (next.exact !== prev.exact) return next.exact;
      if (next.distance !== prev.distance) return next.distance < prev.distance;
      if (next.sourceRank !== prev.sourceRank) return next.sourceRank > prev.sourceRank;
      if (next.substantial !== prev.substantial) return next.substantial;
      return (next.area || 0) > (prev.area || 0);
    }

    state.exactBoundaries.forEach(function (ft) {
      var p = ft.properties || {};
      var id = p.id;
      var emp = byId[id];
      if (!empireActive(emp)) return;
      var candidate = {
        feature: ft,
        exact: exactBoundaryActive(emp, p),
        distance: distanceToSlice(p),
        area: p.areaKm2 || 0,
        sourceRank: sourceRank(p.source),
        substantial:
          (p.areaKm2 || 0) >=
          Math.min(100000, (p.peakAreaKm2 || p.areaKm2 || 0) * 0.03)
      };
      if (betterCandidate(candidate, choiceById[id])) choiceById[id] = candidate;
    });

    function drawChosen(choice) {
      var ft = choice.feature;
      var p = ft.properties || {};
      var id = p.id;
      var emp = byId[id];
      var peakYear = typeof p.peakYear === "number" ? p.peakYear : null;
      var fill = emp && emp.color ? emp.color : p.color || "#b98f5c";
      L.geoJSON(ft, {
        style: function () {
          return {
            fillColor: fill,
            fillOpacity: Math.max(0.28, exactBoundaryOpacity(emp, p)),
            color: fill,
            weight: 2,
            opacity: 0.92,
            dashArray: null
          };
        },
        onEachFeature: function (f, layer) {
          var name = p.name || (emp && emp.name) || id || "Empire";
          var bits = ["<strong>" + String(name) + "</strong>"];
          bits.push("Boundary reference for " + fmtY(state.year));
          if (p.source) bits.push("Source: " + String(p.source));
          if (typeof p.confidence === "number") bits.push("Confidence: " + Math.round(p.confidence * 100) + "%");
          if (p.generationMethod) bits.push("Method: " + String(p.generationMethod));
          if (p.cliopatriaName && p.cliopatriaName !== name) bits.push("Cliopatria: " + String(p.cliopatriaName));
          if (peakYear !== null) bits.push("Peak-boundary reference: " + fmtY(peakYear));
          if (typeof p.fromYear === "number" && typeof p.toYear === "number")
            bits.push("Source range: " + fmtY(p.fromYear) + " – " + fmtY(p.toYear));
          if (typeof p.areaKm2 === "number")
            bits.push("Area: " + Math.round(p.areaKm2).toLocaleString() + " km²");
          if (emp) bits.push("Timeline span: " + fmtY(emp.startYear) + " – " + fmtY(emp.endYear));
          layer.bindPopup(bits.join("<br/>"));
        }
      }).addTo(state.exactGrp);
    }

    var count = 0;
    for (var id in choiceById) {
      if (Object.prototype.hasOwnProperty.call(choiceById, id)) {
        count++;
        drawChosen(choiceById[id]);
      }
    }
    setBoundaryStatus(count);
  }

  function scheduleHistoricalLoad() {
    if (state.histDebounce) global.clearTimeout(state.histDebounce);
    state.histDebounce = global.setTimeout(function () {
      state.histDebounce = null;
      loadHistoricalForCurrentYear();
    }, 320);
  }

  function redrawEmpires() {
    if (!state.empireLay || !global.L || !global.GeoBase) return;
    state.empireLay.clearLayers();
    var y = state.year;
    var L = global.L;
    var panel = global.EmpireDetailPanel;
    var exactIds = Object.create(null);
    if (state.showExact) {
      state.exactBoundaries.forEach(function (ft) {
        var p = ft.properties || {};
        var maybeEmp = null;
        state.empires.forEach(function (e) {
          if (e.id === p.id) maybeEmp = e;
        });
        if (p.id && empireActive(maybeEmp)) exactIds[p.id] = true;
      });
    }
    state.empires.forEach(function (e) {
      if (y < e.startYear || y > e.endYear) return;
      if (exactIds[e.id]) return;
      var ll = global.GeoBase.latLonFor(e);
      L.circle(ll, {
        radius: radiusM(e),
        color: e.color || "#888",
        fillColor: e.color || "#888",
        fillOpacity: 0.28,
        weight: 1,
        opacity: 0.92
      })
        .bindPopup("<strong>" + String(e.name) + "</strong><br/>" + fmtY(e.startYear) + " \u2013 " + fmtY(e.endYear))
        .on("click", function () {
          if (panel && panel.show) panel.show(e);
        })
        .addTo(state.empireLay);
    });
  }

  function redrawBattles() {
    if (!state.battleLay || !global.L) return;
    state.battleLay.clearLayers();
    if (!state.showBattles) return;
    var L = global.L;
    var y = state.year;
    var w = state.battleWindow;
    state.events.forEach(function (ev) {
      if (ev.kind !== "battle" || ev.lat == null || ev.lon == null) return;
      if (typeof ev.year !== "number") return;
      if (Math.abs(ev.year - y) > w) return;
      var op = 0.35 + 0.65 * (1 - Math.abs(ev.year - y) / (w + 1));
      L.circleMarker([ev.lat, ev.lon], {
        radius: 7,
        color: ev.color || "#f0d080",
        fillColor: ev.color || "#f0d080",
        fillOpacity: op,
        weight: 2
      })
        .bindPopup("<strong>" + String(ev.name) + "</strong><br/>" + fmtY(ev.year))
        .addTo(state.battleLay);
    });
  }

  function redrawAncientCivilizations() {
    if (!state.ancientCivLay || !global.L) return;
    state.ancientCivLay.clearLayers();
    if (!state.showAncientCiv || !state.ancientCivFeatures.length) return;
    var L = global.L;
    var y = state.year;
    var active = [];
    var i = 0;
    for (; i < state.ancientCivFeatures.length; i++) {
      var ft = state.ancientCivFeatures[i];
      var span = civYearSpan(ft.properties || {});
      if (!span || y < span.start || y > span.end) continue;
      active.push(ft);
    }
    if (!active.length) return;
    L.geoJSON(
      { type: "FeatureCollection", features: active },
      {
        pointToLayer: function (feature, latlng) {
          var sty = civConfidencePalette(feature.properties && feature.properties.confidence_level);
          return L.circleMarker(latlng, {
            radius: 5,
            color: sty.color,
            fillColor: sty.fill,
            fillOpacity: 0.66,
            weight: 1,
            opacity: 0.9
          });
        },
        onEachFeature: function (feature, layer) {
          layer.bindPopup(civPopupHtml(feature.properties));
        }
      }
    ).addTo(state.ancientCivLay);
  }

  function redrawRoutes() {
    if (!state.routeLay || !global.L) return;
    state.routeLay.clearLayers();
    if (!state.showRoutes) return;
    var L = global.L;
    var y = state.year;
    state.events.forEach(function (ev) {
      if (ev.kind !== "route") return;
      var y0 = ev.yearStart;
      var y1 = ev.yearEnd;
      if (typeof y0 !== "number" || typeof y1 !== "number") return;
      if (y < y0 || y > y1) return;
      if (ev.latFrom == null || ev.lonFrom == null || ev.latTo == null || ev.lonTo == null) return;
      L.polyline(
        [
          [ev.latFrom, ev.lonFrom],
          [ev.latTo, ev.lonTo]
        ],
        {
          color: ev.color || "rgba(201,169,98,0.75)",
          weight: 2,
          dashArray: "6 8",
          opacity: 0.85
        }
      )
        .bindPopup(String(ev.name || "Corridor"))
        .addTo(state.routeLay);
    });
  }

  function redrawOverlays() {
    redrawExactBoundaries();
    redrawEmpires();
    redrawBattles();
    redrawRoutes();
    redrawAncientCivilizations();
  }

  global.EmpireMap = {
    init: function (rootId) {
      var L = global.L;
      if (!L) return;
      var el = global.document.getElementById(rootId);
      if (!el) return;
      state.map = L.map(el, { worldCopyJump: true }).setView([18, 25], 2);

      state.baseOSM = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      });
      state.baseSat = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution:
            "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
        }
      );
      state.baseOSM.addTo(state.map);
      L.control
        .layers(
          { "Street (OSM)": state.baseOSM, "Satellite (Esri)": state.baseSat },
          {},
          { collapsed: false }
        )
        .addTo(state.map);

      state.historicalGrp = L.layerGroup().addTo(state.map);
      state.exactGrp = L.layerGroup().addTo(state.map);
      state.routeLay = L.layerGroup().addTo(state.map);
      state.ancientCivLay = L.layerGroup().addTo(state.map);
      state.battleLay = L.layerGroup().addTo(state.map);
      state.empireLay = L.layerGroup().addTo(state.map);

      var yr = global.document.getElementById("map-year");
      var yo = global.document.getElementById("map-year-out");
      if (yr) {
        state.year = +yr.value || 1000;
        if (yo) yo.textContent = fmtY(state.year);
        yr.addEventListener("input", function () {
          state.year = +yr.value;
          if (yo) yo.textContent = fmtY(state.year);
          redrawOverlays();
          scheduleHistoricalLoad();
        });
      }

      var cbB = global.document.getElementById("map-layer-battles");
      var cbR = global.document.getElementById("map-layer-routes");
      var cbH = global.document.getElementById("map-layer-historical");
      var cbE = global.document.getElementById("map-layer-exact");
      var cbA = global.document.getElementById("map-layer-ancient-civ");
      if (cbB) {
        state.showBattles = !!cbB.checked;
        cbB.addEventListener("change", function () {
          state.showBattles = !!cbB.checked;
          redrawBattles();
        });
      }
      if (cbR) {
        state.showRoutes = !!cbR.checked;
        cbR.addEventListener("change", function () {
          state.showRoutes = !!cbR.checked;
          redrawRoutes();
        });
      }
      if (cbH) {
        state.showHistorical = !!cbH.checked;
        cbH.addEventListener("change", function () {
          state.showHistorical = !!cbH.checked;
          state.histReq++;
          loadHistoricalForCurrentYear();
        });
      }
      if (cbE) {
        state.showExact = !!cbE.checked;
        cbE.addEventListener("change", function () {
          state.showExact = !!cbE.checked;
          redrawOverlays();
        });
      }
      if (cbA) {
        state.showAncientCiv = !!cbA.checked;
        cbA.addEventListener("change", function () {
          state.showAncientCiv = !!cbA.checked;
          redrawAncientCivilizations();
        });
      }

      global
        .fetch(BASemap_INDEX)
        .then(function (r) {
          return r.ok ? r.json() : { years: [] };
        })
        .then(function (data) {
          state.historicalYears = data.years && data.years.length ? data.years : [];
          loadHistoricalForCurrentYear();
        });

      global
        .fetch(EXACT_BOUNDARIES)
        .then(function (r) {
          return r.ok ? r.json() : { features: [] };
        })
        .then(function (data) {
          state.exactBoundaries = Array.isArray(data.features) ? data.features : [];
          redrawOverlays();
        });

      global
        .fetch(ANCIENT_CIV_GEOJSON)
        .then(function (r) {
          return r.ok ? r.json() : { features: [] };
        })
        .then(function (data) {
          state.ancientCivFeatures = Array.isArray(data.features) ? data.features : [];
          redrawAncientCivilizations();
        });
    },

    invalidate: function () {
      if (state.map) state.map.invalidateSize(true);
    },

    setYear: function (y) {
      var yr = global.document.getElementById("map-year");
      if (yr) {
        var mn = +yr.getAttribute("min");
        var mx = +yr.getAttribute("max");
        var v = Math.round(y);
        if (v < mn) v = mn;
        if (v > mx) v = mx;
        yr.value = String(v);
        state.year = v;
      } else state.year = Math.round(y);
      var yo = global.document.getElementById("map-year-out");
      if (yo) yo.textContent = fmtY(state.year);
      redrawOverlays();
      scheduleHistoricalLoad();
    },

    loadEvents: function (url) {
      return global
        .fetch(url)
        .then(function (r) {
          return r.ok ? r.json() : [];
        })
        .then(function (rows) {
          state.events = Array.isArray(rows) ? rows : [];
          redrawBattles();
          redrawRoutes();
        });
    },

    refreshEmpires: function (list) {
      state.empires = list ? list.slice() : [];
      redrawExactBoundaries();
      redrawEmpires();
    },

    setBattleYearFocus: function (years) {
      if (typeof years === "number") state.battleWindow = years;
    }
  };
})(window);
