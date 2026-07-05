/**
 * Approximate map placement: macro-region centroids + stable per-id offset (not true boundaries).
 */
(function (global) {
  "use strict";
  var CENT = {
    Mesopotamia: [33, 44],
    "North Africa": [18, 12],
    "East Asia": [35, 108],
    "Southeast Asia": [10, 115],
    "Middle East": [32, 48],
    Europe: [50, 12],
    Mediterranean: [38, 18],
    "South Asia": [24, 77],
    "Central Asia": [42, 65],
    "North America": [40, -98],
    "South America": [-12, -58],
    Oceania: [-22, 140],
    Eurasia: [54, 55]
  };

  function hash32(s) {
    var h = 0;
    var i = 0;
    for (; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  global.GeoBase = {
    latLonFor: function (emp) {
      var c = CENT[emp.region] || [15, 0];
      var h = hash32(emp.id);
      var a = (h % 360) * (Math.PI / 180);
      var r = 0.9 + (h % 9) * 0.38;
      return [c[0] + Math.sin(a) * r * 0.85, c[1] + Math.cos(a) * r * 1.25];
    }
  };
})(window);
