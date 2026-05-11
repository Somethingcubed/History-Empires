(function (global) {
  "use strict";
  var E = {};
  E.eras = [
    { key: "", lo: NaN, hi: NaN },
    { key: "ancient", lo: -4000, hi: 500 },
    { key: "medieval", lo: 500, hi: 1500 },
    { key: "modern", lo: 1500, hi: Infinity }
  ];
  function val(selq) {
    return function () {
      if (!selq) return "";
      var el = global.document.querySelector(selq);
      return (el && el.value) ? String(el.value).trim() : "";
    };
  }
  E.readState = function (mapping) {
    var qFn = val(mapping.q);
    var rFn = val(mapping.region);
    var eFn = val(mapping.era);
    var rlFn = val(mapping.religion);
    return {
      q: qFn().toLowerCase(),
      region: rFn(),
      eraKey: eFn(),
      religion: rlFn().toLowerCase()
    };
  };
  E.intersectsEra = function (ent, bounds) {
    if (!bounds || bounds.lo !== bounds.lo) return true;
    var hi = bounds.hi === bounds.hi && bounds.hi < 1e200 ? bounds.hi : ent.endYear + 1e12;
    return !(ent.endYear < bounds.lo || ent.startYear > hi);
  };
  E.apply = function (list, mapping) {
    var st = E.readState(mapping);
    var eb = NaN,
      eh = NaN;
    E.eras.forEach(function (z) {
      if (z.key === st.eraKey) {
        eb = z.lo;
        eh = z.hi;
      }
    });
    var bounds = eb === eb && eh === eh ? { lo: eb, hi: eh } : null;
    return list.filter(function (emp) {
      if (st.region && emp.region !== st.region) return false;
      if (st.religion) {
        var rq = String(emp.religion || "").toLowerCase();
        if (rq.indexOf(st.religion) === -1) return false;
      }
      if (st.q) {
        var hx = [emp.name, emp.description, emp.region, emp.religion, emp.politics]
          .map(function (p) {
            return p == null ? "" : String(p);
          })
          .join(" ")
          .toLowerCase();
        if (hx.indexOf(st.q) === -1) return false;
      }
      return E.intersectsEra(emp, bounds);
    });
  };
  E.wireSelects = function (empires) {
    var labels = {
      ancient: "\u223c−3000 to 500 CE",
      medieval: "500–1500",
      modern: "1500–today"
    };
    var rr = global.document.getElementById("filter-religion");
    if (rr && rr.dataset.ld !== "y") {
      var u = {};
      empires.forEach(function (z) {
        u[z.religion || "?"] = (z.religion || "").toLowerCase();
      });
      global.Object.keys(u).sort().forEach(function (lab) {
        var op = global.document.createElement("option");
        op.value = u[lab];
        op.textContent = lab;
        rr.appendChild(op);
      });
      rr.dataset.ld = "y";
    }
    var eraEl = global.document.getElementById("filter-era");
    if (eraEl && eraEl.dataset.ld !== "y") {
      E.eras.forEach(function (z) {
        if (!z.key) return;
        var op = global.document.createElement("option");
        op.value = z.key;
        op.textContent = labels[z.key];
        eraEl.appendChild(op);
      });
      eraEl.dataset.ld = "y";
    }
  };
  global.EmpireFilters = E;
})(window);
