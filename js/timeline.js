/**
 * Bar timeline layering follows MIT-licensed hpno/d3.timeline.js (clip-path, rects, zoom/rescaleX).
 * Overlap-highlighting echoes Cooper Hewitt BSD-3-Clause d3.timeline.event-horizon (no jQuery).
 */
(function (global) {
  "use strict";
  var d3 = global.d3;
  if (!d3) throw new Error("timeline.js needs window.d3 (vendor/d3.v7.min.js)");

  var REGION_ORDER = [
    "Mesopotamia",
    "North Africa",
    "East Asia",
    "Southeast Asia",
    "Middle East",
    "Europe",
    "Mediterranean",
    "South Asia",
    "Central Asia",
    "North America",
    "South America",
    "Oceania",
    "Eurasia"
  ];

  var META = {};

  function fmtYear(y) {
    y = Math.round(y);
    if (y < 0) return Math.abs(y) + "\u202fBCE";
    return y + "\u202fCE";
  }

  function ivOverlap(a0, a1, b0, b1) {
    return !(a1 < b0 || b1 < a0);
  }

  function packLanes(items, getStart, getEnd) {
    getStart = getStart || function (d) {
      return d.startYear;
    };
    getEnd = getEnd || function (d) {
      return d.endYear;
    };
    var ends = [];
    items.forEach(function (d) {
      var s = getStart(d);
      var e = getEnd(d);
      var lane = 0;
      while (ends[lane] !== undefined && ends[lane] > s) lane++;
      d.__lane = lane;
      ends[lane] = e;
    });
    return Math.max(1, ends.length);
  }

  function layoutByRegion(emps, barH, laneGap, pad, topOffset) {
    var byRegion = d3.group(emps, function (r) {
      return r.region;
    });
    var tail = Array.from(byRegion.keys()).filter(function (k) {
      return REGION_ORDER.indexOf(k) < 0;
    });
    var order = REGION_ORDER.concat(tail);
    var yCursor = topOffset;
    var bands = [];
    order.forEach(function (reg) {
      if (!byRegion.has(reg)) return;
      var slice = byRegion.get(reg).slice().sort(function (a, b) {
        return a.startYear - b.startYear || a.endYear - b.endYear;
      });
      var lanes = Math.max(1, packLanes(slice));
      var top = yCursor;
      var innerH = lanes * (barH + laneGap) + pad * 2;
      yCursor += innerH;
      slice.forEach(function (e) {
        e.__y = top + pad + e.__lane * (barH + laneGap);
      });
      bands.push({ region: reg, y0: top, h: innerH });
    });
    return { bands: bands, height: Math.max(yCursor, topOffset + 140) };
  }

  function overlapMap(active, corpus) {
    if (!active) return null;
    var m = Object.create(null);
    corpus.forEach(function (x) {
      if (active.id !== x.id && ivOverlap(active.startYear, active.endYear, x.startYear, x.endYear))
        m[x.id] = true;
    });
    m[active.id] = true;
    return m;
  }

  function pickTicks(xs, pixW, maxTicks) {
    maxTicks = maxTicks || 140;
    var span = xs.invert(Math.min(pixW, 980)) - xs.invert(0);
    var ad = Math.abs(span);
    var step = Math.pow(10, Math.floor(Math.log10(Math.max(ad / 14, 0.005))));
    if (ad / step > maxTicks / 22) step *= 5;
    else if (ad / step > maxTicks / 40) step *= 2;
    var ticks = [];
    var d0 = xs.domain()[0];
    var d1 = xs.domain()[1];
    var t = Math.floor(d0 / step - 2) * step;
    while (t <= Math.ceil(d1 / step + 2) * step) {
      ticks.push(t);
      t += step;
    }
    return ticks;
  }

  function viewTransform(lo, hi) {
    var xz = META.baseX;
    var w = META.plotW;
    if (!xz || !w || w < 40) return d3.zoomIdentity;
    var xL = xz(lo);
    var xR = xz(hi);
    var dx = Math.max(xR - xL, 1e-9);
    var k = w / dx;
    var mn = META.zoom.scaleExtent()[0];
    var mx = META.zoom.scaleExtent()[1];
    if (k < mn) k = mn;
    if (k > mx) k = mx;
    var tx = -xL * k;
    return d3.zoomIdentity.translate(tx + (w / 2) * (1 - k), 0).scale(k);
  }

  function paint(reducedMotion) {
    if (!META.gBars || !META.baseX) return;
    var xz = META.t ? META.t.rescaleX(META.baseX) : META.baseX;
    META.xzNow = xz;
    var wm = META.working || [];
    var barH = META.barH || 11;

    META.gBands
      .selectAll("rect.rb")
      .data(META.layers.regions ? META.regionBands || [] : [], function (b) {
        return b.region;
      })
      .join("rect")
      .attr("class", "rb")
      .attr("x", 0)
      .attr("width", META.plotW)
      .attr("y", function (b) {
        return b.y0;
      })
      .attr("height", function (b) {
        return b.h;
      })
      .attr(
        "fill",
        META.layers.regions
          ? function (b) {
              return META.shade[b.region] || "#1a1d28";
            }
          : "#000")
      .attr("opacity", META.layers.regions ? 0.9 : 0);

    META.gRegionsLabel
      .selectAll("text.rb-lab")
      .data(META.layers.regions && META.layers.regionLabels ? META.regionBands || [] : [], function (b) {
        return b.region;
      })
      .join("text")
      .attr("class", "rb-lab")
      .attr("pointer-events", "none")
      .style("fill", "rgba(150,159,178,0.55)")
      .style("font-size", "10px")
      .attr("text-anchor", "start")
      .attr("x", 6)
      .attr(
        "y",
        function (b) {
          return b.y0 + 13;
        }
      )
      .text(function (b) {
        return b.region.toUpperCase();
      });

    if (META.layers.grid) {
      var ticks = pickTicks(xz, META.plotW, 260);
      META.gGrid
        .selectAll("line")
        .data(ticks)
        .join("line")
        .attr("stroke", "rgba(136,154,182,0.11)")
        .attr("y1", META.axisTrack)
        .attr("y2", META.innerPlotH + META.axisTrack + 48)
        .attr("stroke-width", 1)
        .attr("x1", function (d) {
          return xz(d);
        })
        .attr("x2", function (d) {
          return xz(d);
        });
    } else META.gGrid.selectAll("line").remove();

    META.gAxisSel
      .attr("transform", "translate(0," + META.axisTrack + ")")
      .call(
        d3
          .axisTop(xz)
          .tickValues(pickTicks(xz, META.plotW))
          .tickFormat(function (yr) {
            return fmtYear(yr);
          })
          .tickSizeOuter(6)
      )
      .call(function (gx) {
        gx.select(".domain").attr("stroke", "rgba(154,167,188,0.35)");
      })
      .selectAll(".tick text")
      .style("fill", "#b4bfda")
      .style("font-size", "11px");

    META.gBars
      .selectAll("rect.bar-emp")
      .data(META.layers.bars ? wm : [], function (d) {
        return d.id;
      })
      .join(
        function (enter) {
          return enter
            .append("rect")
            .attr("class", "bar-emp")
            .attr("rx", 4)
            .attr("stroke-width", 1);
        },
        function (update) {
          return update.attr("stroke-width", META.layers.bars ? 1 : 0);
        },
        function (exit) {
          return exit.remove();
        }
      )
      .attr("tabindex", META.layers.bars ? 0 : -1)
      .attr(
        "aria-label",
        function (h) {
          return h.name + ", " + fmtYear(h.startYear) + ", " + fmtYear(h.endYear);
        }
      )
      .attr("opacity", META.layers.bars ? 1 : 0)
      .attr("pointer-events", META.layers.bars ? "visiblePainted" : "none")
      .attr(
        "y",
        META.layers.bars
          ? function (d) {
              return d.__y;
            }
          : 0
      )
      .attr("height", barH)
      .attr(
        "fill",
        META.layers.bars
          ? function (d) {
              return d.color || "#888";
            }
          : "#000")
      .attr(
        "stroke",
        META.layers.bars ? "rgba(240,246,252,0.18)" : "none"
      )
      .on("mousemove", barStyle)
      .on("mouseover", mouseOverBar)
      .on("mouseout", mouseLeaveBar)
      .on(
        "click",
        META.layers.bars
          ? function (ev, d) {
              META.onPick(d);
            }
          : null
      )
      .attr(
        "x",
        function (d) {
          return xz(d.startYear);
        }
      )
      .attr(
        "width",
        function (d) {
          return Math.max(1, xz(Math.max(d.endYear, d.startYear + 0.001)) - xz(d.startYear));
        }
      );

    function mouseOverBar(ev, dRow) {
      if (!META.layers.bars) return;
      META.hov = dRow;
      META.hovOv = overlapMap(dRow, META.full || []);
      barStyle();
    }

    function mouseLeaveBar() {
      META.hov = undefined;
      META.hovOv = undefined;
      barStyle();
    }

    function barStyle() {
      if (!META.layers.bars) return;
      META.gBars.selectAll("rect.bar-emp").each(function (dEach) {
        var op = !META.hov || (META.hovOv && META.hovOv[dEach.id]);
        var baseOp = META.layers.bars ? 1 : 0;
        d3.select(this).attr(
          "opacity",
          META.hov ? (op ? baseOp : 0.26) : baseOp
        );
        var gold = !!(META.hov && META.hovOv && META.hovOv[dEach.id] && META.hov.id !== dEach.id);
        var br = META.hov && META.hov.id === dEach.id;
        d3.select(this).attr(
          "stroke",
          gold ? "#fdd67a" : br ? "#fffbf0" : "rgba(240,246,252,0.18)"
        );
      });
    }

    var lblMin = META.layers.labels && META.layers.bars ? wm : [];
    META.gLbl
      .selectAll("text.emp-name")
      .data(lblMin, function (d) {
        return d.id;
      })
      .join("text")
      .attr("class", "emp-name")
      .attr("pointer-events", "none")
      .style("fill", "rgba(232,239,251,0.95)")
      .style("font-size", "11px")
      .attr(
        "x",
        function (dL) {
          return xz(dL.startYear) + 5;
        }
      )
      .attr(
        "y",
        function (dL) {
          return dL.__y + barH * 0.78;
        }
      )
      .text(function (dT) {
        var span = xz(dT.endYear) - xz(dT.startYear);
        return span > 92 ? (dT.name.length > 32 ? dT.name.slice(0, 31) + "…" : dT.name) : "";
      });

    var fullCt = (META.full || []).length;
    META.gEmpty
      .selectAll("text.empty-msg")
      .data(fullCt > 0 && wm.length === 0 ? [1] : [], function () {
        return 0;
      })
      .join("text")
      .attr("class", "empty-msg")
      .attr("text-anchor", "middle")
      .attr("x", META.plotW * 0.5)
      .attr("y", META.axisTrack + 96)
      .style("fill", "rgba(170,178,204,0.58)")
      .style("font-size", "13px")
      .text("No empires in view — adjust filters or unmute regions in the legend.");

    drawOverviewVp();
    if (!reducedMotion)
      META.gBars.selectAll("rect.bar-emp").interrupt();
  }

  function drawOverviewOv() {
    if (!META.overviewX || !META.ovBands) return;
    var list = META.full || META.working || [];
    META.ovBands
      .selectAll("rect.ov")
      .data(list, function (d) {
        return d.id;
      })
      .join("rect")
      .attr("class", "ov")
      .attr("y", function (d, ii) {
        return 48 + ((ii * 71) % 180) / 9;
      })
      .attr("height", 3)
      .attr(
        "fill",
        function (x) {
          return x.color;
        }
      )
      .attr("opacity", 0.62)
      .attr("x", function (dd) {
        return META.overviewX(dd.startYear);
      })
      .attr(
        "width",
        function (dd) {
          return Math.max(
            1,
            META.overviewX(dd.endYear) - META.overviewX(dd.startYear)
          );
        }
      );
    drawOverviewVp();
  }

  function drawOverviewVp() {
    if (!META.overviewVp || !META.xzNow || !META.overviewX) return;
    var i0 = META.xzNow.invert(0);
    var i1 = META.xzNow.invert(META.plotW);
    var xa = META.ovPadLeft + META.overviewX(i0);
    var xb = META.ovPadLeft + META.overviewX(i1);
    var left = Math.min(xa, xb);
    var span = Math.max(6, Math.abs(xb - xa));
    META.overviewVp
      .attr("x", left)
      .attr("width", span)
      .attr("visibility", META.layers.bars ? "visible" : "hidden");
  }

  global.EmpireTimeline = {};

  global.EmpireTimeline.init = function (opts) {
    META.host = d3.select(opts.host);
    META.ovHost = opts.overview ? d3.select(opts.overview) : undefined;
    META.margin = opts.margin || { top: 16, right: 14, bottom: 36, left: 16 };
    META.barH = opts.barHeight || 11;
    META.laneGap = opts.laneGap || 4;
    META.regBandPad = opts.regionPadding || 8;
    META.axisTrack = 48;
    META.onPick = opts.onPick || function () {};
    META.layers = {
      bars: true,
      regions: true,
      regionLabels: true,
      grid: true,
      labels: true
    };
    META.shade = opts.regionShades || {
      Mesopotamia: "#241e18",
      "North Africa": "#1f241d",
      "East Asia": "#191f28",
      "Southeast Asia": "#172420",
      "Middle East": "#201d22",
      Europe: "#1e1d24",
      Mediterranean: "#1a2229",
      "South Asia": "#291e1b",
      "Central Asia": "#262018",
      "North America": "#151e22",
      "South America": "#141c18",
      Oceania: "#152018",
      Eurasia: "#161a22"
    };
    META.t = d3.zoomIdentity;
    META.svg = META.host
      .append("svg")
      .attr("class", "chart-svg")
      .style("touch-action", "none");
    META.root = META.svg.append("g").attr("class", "root-g");
    var cid = "eclip_" + Math.random().toString(36).slice(2);
    var defsNode = META.svg.append("defs");
    META.clipR = defsNode
      .append("clipPath")
      .attr("id", cid)
      .append("rect")
      .attr("fill", "none")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", 100)
      .attr("height", 100);

    META.gGrid = META.root.append("g").attr("class", "tim-grid");
    META.gBands = META.root.append("g").attr("class", "tim-bands");
    META.gRegionsLabel = META.root.append("g").attr("class", "tim-region-lab");

    META.plotClip = META.root
      .append("g")
      .attr("class", "plot-clip-wrap")
      .attr("clip-path", "url(#" + cid + ")");
    META.gBars = META.plotClip.append("g").attr("class", "tim-bars");
    META.gLbl = META.plotClip.append("g").attr("class", "tim-lbl");
    META.gEmpty = META.plotClip
      .append("g")
      .attr("class", "tim-empty-hint")
      .attr("pointer-events", "none");

    META.gAxisSel = META.root.append("g").attr("class", "tim-axis");

    META.baseX = d3.scaleLinear();
    META.zoom = d3
      .zoom()
      .scaleExtent([0.046, 512])
      .filter(function (ev) {
        if ((ev.ctrlKey || ev.metaKey) && ev.type !== "wheel") return false;
        if (ev.type === "dblclick") return false;
        return !(ev.button && ev.button !== 0 && ev.button !== undefined);
      })
      .on("zoom", function (evt) {
        META.t = evt.transform;
        paint(global.matchMedia("(prefers-reduced-motion: reduce)").matches);
      });
    META.svg.call(META.zoom);

    META.ovSvg = META.ovHost ? META.ovHost.append("svg").style("display", "block") : null;
    if (META.ovSvg) {
      META.ovBands = META.ovSvg.append("g").attr("transform", "translate(0,52)");
      META.overviewVp = META.ovSvg
        .append("rect")
        .attr("rx", 2)
        .attr("stroke", "rgba(237,217,154,0.45)")
        .attr("fill", "rgba(239,229,173,0.13)")
        .attr("y", 34)
        .attr("height", 13);
      META.ovClick = META.ovSvg
        .append("rect")
        .attr("fill", "transparent")
        .style("cursor", "pointer")
        .on("click", function (ev) {
          if (!META.overviewInnerW || !META.baseX || !META.svg) return;
          var bbox = META.ovSvg.node().getBoundingClientRect();
          var lx = Math.max(0, Math.min(ev.clientX - bbox.left - META.ovPadLeft, META.overviewInnerW));
          var frac = META.overviewInnerW ? lx / META.overviewInnerW : 0.5;
          var D = META.baseX.domain();
          var yr = D[0] + frac * (D[1] - D[0]);
          var xzV = META.t.rescaleX(META.baseX);
          var vx = xzV(yr) - META.plotW / 2;
          META.svg.transition().duration(420).call(META.zoom.translateBy, vx, 0);
        });
    }

    META.zbuttons = opts.zoomButtons || {};

    wireZoomShortcuts();

    if (typeof ResizeObserver === "function")
      META.ro = new ResizeObserver(function () {
        global.EmpireTimeline.resize();
      });
    if (META.ro) META.ro.observe(META.host.node());

    global.addEventListener("keydown", keyboardNavBars);
    global.addEventListener("keyup", function () {});

    return global.EmpireTimeline;
  };

  function keyboardNavBars(ev) {
    if (!META.gBars) return;
    var tg = ev.target;
    if (!tg || tg.tagName !== "rect") return;
    var dSel = d3.select(tg).datum();
    if (!dSel || !dSel.id || !META.layers.bars) return;
    if (ev.key === "Enter" || ev.key === " ") META.onPick(dSel);
  }

  function wireZoomShortcuts() {
    var zb = META.zbuttons || {};
    if (!META.svg || !META.zoom) return;

    function applyTF(fn) {
      return function () {
        META.svg.transition().duration(560).call(META.zoom.transform, fn());
      };
    }

    if (zb.fit) zb.fit.onclick = applyTF(function () {
      return d3.zoomIdentity;
    });
    if (zb.ancient)
      zb.ancient.onclick = applyTF(function () {
        return viewTransform(-3100, 500);
      });
    if (zb.medieval)
      zb.medieval.onclick = applyTF(function () {
        return viewTransform(498, 1500);
      });
    if (zb.modern)
      zb.modern.onclick = applyTF(function () {
        var hi =
          META.extentHiSafe !== undefined ? META.extentHiSafe + 80 : 2100;
        return viewTransform(1498, hi);
      });
  }

  global.EmpireTimeline.setMuted = function (mutedMap) {
    META.muted = mutedMap || {};
  };

  global.EmpireTimeline.setLayers = function (nextL) {
    for (var k in nextL) if (nextL.hasOwnProperty(k)) META.layers[k] = !!nextL[k];
    paint();
  };

  global.EmpireTimeline.update = function (workingSet, fullSet) {
    META.full = (fullSet && fullSet.slice()) || META.full || workingSet.slice();
    META.working = workingSet.slice().filter(function (e) {
      return !(META.muted && META.muted[e.region]);
    });

    var mn = d3.min(META.full, function (d) {
      return d.startYear;
    });
    var mx = d3.max(META.full, function (d) {
      return d.endYear;
    });
    if (mn !== mn || mx !== mx || !(mn <= mx)) {
      mn = -3500;
      mx = 2030;
    }
    META.extentLoSafe = mn - 260;
    META.extentHiSafe = mx + 220;

    global.EmpireTimeline.resize();

    META.baseX.domain([META.extentLoSafe, META.extentHiSafe]).range([
      0,
      META.plotW || 760
    ]);

    var yStart = (META.axisTrack || 52) + 52;
    var layout = layoutByRegion(
      META.working,
      META.barH,
      META.laneGap,
      META.regBandPad,
      yStart
    );
    META.regionBands = layout.bands;
    META.innerPlotH = layout.height + 36;

    global.EmpireTimeline.resize();

    META.overviewX = d3
      .scaleLinear()
      .domain([META.extentLoSafe, META.extentHiSafe])
      .range([0, META.plotW || 760]);
    META.overviewInnerW = META.plotW || 760;

    META.full.forEach(function (e, jj) {
      e.__oxid = jj;
    });
    META.t = META.t || d3.zoomIdentity;
    paint(global.matchMedia("(prefers-reduced-motion: reduce)").matches);
    drawOverviewOv();
    wireZoomShortcuts();
  };

  global.EmpireTimeline.resize = function () {
    if (!META.svg || !META.host) return;
    var box = META.host.node().getBoundingClientRect();
    var cwRaw =
      box.width ||
      META.host.node().parentElement.clientWidth ||
      global.innerWidth ||
      800;
    var cw = Math.max(280, cwRaw);
    var m = META.margin;
    META.innerSvgW = cw;
    META.plotW = Math.max(220, cw - m.left - m.right);
    META.ovPadLeft = m.left;

    var content =
      META.innerPlotH ||
      (META.axisTrack || 52) + 420;
    var totalH = m.top + (META.axisTrack || 52) + content + 36 + m.bottom;

    META.svg.attr("width", cw).attr("height", Math.max(320, totalH));
    META.root.attr(
      "transform",
      "translate(" + m.left + "," + m.top + ")"
    );

    if (META.clipR)
      META.clipR
        .attr("width", META.plotW)
        .attr(
          "height",
          META.innerPlotH
            ? META.innerPlotH + (META.axisTrack || 52) + 96
            : 520
        );

    META.baseX.range([0, META.plotW]);

    if (META.ovSvg) {
      META.ovSvg.attr("width", cw).attr("height", 86);
      if (META.ovBands)
        META.ovBands.attr(
          "transform",
          "translate(" + META.ovPadLeft + ",52)"
        );
      if (META.ovClick)
        META.ovClick
          .attr("x", META.ovPadLeft)
          .attr("width", META.plotW)
          .attr("height", 62);
      if (
        META.extentLoSafe !== undefined &&
        META.extentHiSafe !== undefined
      ) {
        META.overviewX = d3
          .scaleLinear()
          .domain([META.extentLoSafe, META.extentHiSafe])
          .range([0, META.plotW]);
        META.overviewInnerW = META.plotW;
      }
    }

    META.t = META.t || d3.zoomIdentity;
    paint(global.matchMedia("(prefers-reduced-motion: reduce)").matches);
    drawOverviewVp();
  };

  global.EmpireTimeline.getStats = function () {
    return {
      visible: META.working ? META.working.length : 0,
      total: META.full ? META.full.length : 0
    };
  };
})(window);
