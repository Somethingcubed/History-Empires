/**
 * Boots static dataset, integrates D3 timeline, filters, migrations, legends.
 */
(function () {
  "use strict";
  var REGIONS = ["Mesopotamia","North Africa","East Asia","Southeast Asia","Middle East","Europe","Mediterranean","South Asia","Central Asia","North America","South America","Oceania","Eurasia"];
  var SEL = {
    q: "#filter-q",
    region: "#filter-region",
    era: "#filter-era",
    religion: "#filter-religion"
  };
  var DATA = [];
  var mutedRegions = {};

  function populateRegions(sel) {
    var el = document.querySelector(sel);
    if (!el) return;
    REGIONS.forEach(function (rg) {
      var o = document.createElement("option");
      o.value = rg;
      o.textContent = rg;
      el.appendChild(o);
    });
  }

  function buildLegend(domId) {
    var host = document.getElementById(domId);
    if (!host) return;
    host.innerHTML = "";
    REGIONS.forEach(function (r) {
      var b = document.createElement("button");
      b.type = "button";
      b.dataset.region = r;
      b.innerHTML =
        '<span class="swatch-dot" style="background:' +
        hueColor(r) +
        '"></span>' +
        r;
      b.onclick = function () {
        mutedRegions[r] = !mutedRegions[r];
        b.classList.toggle("is-muted", !!mutedRegions[r]);
        redraw();
      };
      host.appendChild(b);
    });
  }

  function hueColor(region) {
    var i = Math.max(0, REGIONS.indexOf(region));
    var pal = "#cdb87c,#d4a743,#e03d4d,#8b6b4f,#4c6bcf,#3aa89b,#e0702a,#8f6b2d,#c77d29,#5a6ea1,#7b9e6b,#4a8b8b,#9b6b9b".split(
      ","
    );
    return pal[i % pal.length];
  }

  function readLayers() {
    function ck(id) {
      var n = document.getElementById(id);
      return !!(n && n.checked);
    }
    return {
      bars: ck("layer-bars"),
      regions: ck("layer-regions"),
      regionLabels: ck("layer-regions-labels"),
      grid: ck("layer-grid"),
      labels: ck("layer-labels")
    };
  }

  function hideLoadMsg() {
    var m = document.getElementById("data-load-msg");
    if (m) m.classList.add("is-done");
  }

  function updateFilterBanner() {
    var el = document.getElementById("filter-status");
    if (!el) return;
    var s = EmpireTimeline.getStats();
    el.textContent =
      s.visible === s.total ? s.total + " empires" : s.visible + " of " + s.total + " shown";
  }

  function resetFiltersUi() {
    var q = document.getElementById("filter-q");
    if (q) q.value = "";
    ["filter-region", "filter-era", "filter-religion"].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) n.value = "";
    });
    redraw();
  }

  function redraw() {
    EmpireTimeline.setMuted(mutedRegions);
    EmpireTimeline.setLayers(readLayers());
    EmpireTimeline.update(EmpireFilters.apply(DATA, SEL), DATA);
    updateFilterBanner();
  }

  function wireFilters() {
    ["filter-q","filter-region","filter-era","filter-religion"].forEach(function (id) {
      var node = document.getElementById(id);
      if (!node) return;
      ["input","change"].forEach(function (evt) {
        node.addEventListener(evt, function () {
          redraw();
        });
      });
    });
    ["layer-bars","layer-regions","layer-regions-labels","layer-grid","layer-labels"].forEach(function (
      id
    ) {
      var n = document.getElementById(id);
      if (n) {
        n.addEventListener(
          "change",
          function () {
            redraw();
          }
        );
      }
    });
  }

  EmpireDetailPanel.mount(document.getElementById("detail-root"), function () {
    EmpireDetailPanel.reset();
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    var root = document.getElementById("detail-root");
    if (!root || root.dataset.open !== "true") return;
    EmpireDetailPanel.reset();
  });

  var rst = document.getElementById("btn-reset-filters");
  if (rst) rst.onclick = resetFiltersUi;

  EmpireTimeline.init({
    host: document.getElementById("timeline-chart"),
    overview: document.getElementById("timeline-overview"),
    onPick: function (empire) {
      EmpireDetailPanel.show(empire);
    },
    zoomButtons: {
      fit: document.getElementById("btn-zoom-fit"),
      ancient: document.getElementById("btn-zoom-ancient"),
      medieval: document.getElementById("btn-zoom-medieval"),
      modern: document.getElementById("btn-zoom-modern")
    }
  });

  fetch("data/empires.json")
    .then(function (r) {
      if (!r.ok) {
        throw new Error("HTTP " + r.status + ": could not fetch data/empires.json.");
      }
      return r.json();
    })
    .then(function (rows) {
      if (!Array.isArray(rows)) {
        throw new Error("data/empires.json must be a JSON array.");
      }
      DATA = rows;
      populateRegions("#filter-region");
      EmpireFilters.wireSelects(DATA);
      wireFilters();
      buildLegend("region-legend");
      EmpireTimeline.resize();
      hideLoadMsg();

      EmpireMigration.maybeRun(function () {
        redraw();
        EmpireDetailPanel.reset();
      });
    })
    .catch(function (err) {
      var viaFile =
        window.location.protocol === "file:" ||
        !!String(err && err.message ? err.message : err).match(/Failed to fetch|NetworkError/i);
      document.body.innerHTML =
        '<div style="padding:28px;font-family:Inter,system-ui,sans-serif;color:#e8eaf0;background:#12151c;margin:0;min-height:100vh;line-height:1.65;max-width:760px">' +
        '<h2 style="margin-top:0;font-weight:600">' +
        (viaFile ? "Your browser blocked the data file" : "Could not start the timeline") +
        "</h2>" +
        (viaFile
          ? "<p>Open this site via a local server instead of opening <code>index.html</code> from Finder (<code>file://</code> blocks loading <code>data/empires.json</code>). Double-click <strong>Open Timeline Website.command</strong> in the <strong>empire-timeline</strong> folder (leave Terminal open). Or paste:</p>" +
            '<pre style="background:#1a2030;padding:14px;border-radius:8px;overflow:auto;overflow-wrap:anywhere;white-space:pre-wrap;font-size:13px;color:#cce"><code>cd "/Users/oscar/Desktop/Projects/Politics Project/empire-timeline"' +
            "\n" +
            "python3 -m http.server 8787</code></pre>" +
            "<p>Then open <strong>http://127.0.0.1:8787/</strong> in your browser.</p>"
          : "<p>Something failed while initializing the timeline. If you were not opening from Finder, this is usually a bug worth reporting (copy the technical message).</p>" +
            '<pre style="background:#1a2030;padding:14px;border-radius:8px;overflow:auto;font-size:13px;color:#cce;margin-top:0.75rem">' +
            "Tip: serving from localhost still works:<br/><code>http://127.0.0.1:8787/</code></pre>") +
        '<p style="color:#aab3ca;font-size:13px;margin-top:1rem">Technical message:</p>' +
        '<pre style="font-size:12px;background:#291518;padding:12px;border-radius:8px;overflow:auto;overflow-wrap:anywhere;color:#f88989">' +
        String(err) +
        "</pre></div>";
    });
})();
