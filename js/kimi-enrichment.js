/**
 * Links Kimi ancient-civilizations GeoJSON rows to timeline empires by English-name similarity
 * plus chronological overlap. CC BY-SA 4.0 dataset — see THIRD_PARTY_NOTICES.md.
 */
(function (global) {
  "use strict";

  var NAME_STOP = {
    empire: true,
    kingdom: true,
    dynasty: true,
    caliphate: true,
    republic: true,
    cultures: true,
    culture: true,
    confederation: true,
    civilization: true,
    period: true,
    states: true,
    state: true,
    city: true,
    age: true,
    polities: true,
    polity: true
  };

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

  function normalizeRough(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function stripBoilerplate(s) {
    return normalizeRough(s)
      .split(/\s+/)
      .filter(function (t) {
        return t && !NAME_STOP[t];
      })
      .join(" ");
  }

  function applyAliases(s) {
    return stripBoilerplate(s)
      .replace(/\bsassanid\b/g, "sasanian")
      .replace(/\bsasanian\b/g, "sasanian")
      .replace(/\bpersian\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function kimiSegments(alt) {
    if (!alt || typeof alt.en !== "string") return [];
    return alt.en.split("/").map(function (x) {
      return x.trim();
    }).filter(Boolean);
  }

  function containmentScore(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 0.88;
    var ta = Object.create(null);
    var pa = a.split(/\s+/).filter(Boolean);
    var i = 0;
    for (; i < pa.length; i++) ta[pa[i]] = true;
    var tb = b.split(/\s+/).filter(Boolean);
    var inter = 0;
    var j = 0;
    for (; j < tb.length; j++) {
      if (ta[tb[j]]) inter++;
    }
    var uni = pa.length + tb.length - inter;
    return uni ? inter / uni : 0;
  }

  function bestNameScore(empName, alt) {
    var emp = applyAliases(empName);
    var empFull = normalizeRough(empName);
    var best = 0;
    var segs = kimiSegments(alt);
    var k = 0;
    for (; k < segs.length; k++) {
      var seg = segs[k];
      var kk = applyAliases(seg);
      var kFull = normalizeRough(seg);
      best = Math.max(best, containmentScore(emp, kk), containmentScore(empFull, kFull) * 0.95);
    }
    return best;
  }

  function overlapYears(emp, span) {
    if (!span) return 0;
    var lo = Math.max(emp.startYear, span.start);
    var hi = Math.min(emp.endYear, span.end);
    return hi >= lo ? hi - lo + 1 : 0;
  }

  function summarizeProps(props) {
    var sites = [];
    var cs = props.core_sites;
    if (Array.isArray(cs)) {
      var i = 0;
      for (; i < Math.min(cs.length, 8); i++) {
        var s = cs[i];
        var label = (s && (s.name_en || s.name)) || "";
        if (label) sites.push(label);
      }
    }
    return {
      civilization_id: props.civilization_id,
      primary_name: props.primary_name,
      englishName: props.alt_names && props.alt_names.en,
      archaeological_culture: props.archaeological_culture,
      period_main: props.period_main,
      region_category: props.region_category,
      confidence_level: props.confidence_level,
      territory_verified: props.territory_verified,
      territory_inferred: props.territory_inferred,
      research_notes: props.research_notes,
      date_begin: props.date_begin,
      date_end: props.date_end,
      core_site_labels: sites,
      data_sources: Array.isArray(props.data_sources) ? props.data_sources.slice(0, 5) : [],
      controversies: Array.isArray(props.controversies) ? props.controversies.slice(0, 2) : []
    };
  }

  function pickBest(emp, features) {
    var best = null;
    var idx = 0;
    for (; idx < features.length; idx++) {
      var ft = features[idx];
      var props = ft.properties;
      if (!props) continue;
      var span = civYearSpan(props);
      var empDur = Math.max(1, emp.endYear - emp.startYear);
      var kimiDur = span ? Math.max(1, span.end - span.start) : 1;
      var oy = overlapYears(emp, span);
      if (oy < 25 && oy / Math.min(empDur, kimiDur) < 0.06) continue;
      var ns = bestNameScore(emp.name, props.alt_names);
      if (ns < 0.22) continue;
      var score = ns * 1000 + Math.min(oy, 500);
      if (!best || score > best.score) best = { score: score, nameScore: ns, overlapYears: oy, props: props };
    }
    return best;
  }

  var MIN_NAME_SCORE = 0.32;

  global.EmpireKimiEnrichment = {
    attachToEmpires: function (empires, geojson, overrides) {
      overrides = overrides && typeof overrides === "object" ? overrides : {};
      var features = geojson && Array.isArray(geojson.features) ? geojson.features : [];
      var byCiv = Object.create(null);
      var c = 0;
      for (; c < features.length; c++) {
        var p = features[c].properties;
        if (p && p.civilization_id) byCiv[p.civilization_id] = p;
      }
      var e = 0;
      for (; e < empires.length; e++) {
        var emp = empires[e];
        delete emp.kimiMatch;
        var forcedId = overrides[emp.id];
        if (forcedId && byCiv[forcedId]) {
          emp.kimiMatch = summarizeProps(byCiv[forcedId]);
          continue;
        }
        var hit = pickBest(emp, features);
        if (hit && hit.nameScore >= MIN_NAME_SCORE) emp.kimiMatch = summarizeProps(hit.props);
      }
    }
  };
})(window);
