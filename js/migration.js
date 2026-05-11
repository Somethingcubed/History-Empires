/**
 * Population intro: lightweight Canvas migration inspired by flow-map arcs in empire/main (reimplemented).
 */
(function (global) {
  "use strict";
  var STORAGE = "empire-timeline-skip-intro";

  global.EmpireMigration = {
    maybeRun: function (onDone) {
      var mq = global.matchMedia("(prefers-reduced-motion: reduce)");
      if ((mq.matches) || global.localStorage.getItem(STORAGE) === "1") return onDone();
      var overlay = global.document.getElementById("migration-overlay");
      if (!overlay || !overlay.querySelector("canvas")) return onDone();

      overlay.dataset.visible = "true";
      setTimeout(function () {
        overlay.dataset.showskip = "true";
      }, 2900);

      var cv = overlay.querySelector("canvas");
      var cx = cv.getContext("2d");
      var w = 1,
        h = 1,
        dpr = 1;
      var dots = [];

      function size() {
        dpr = global.devicePixelRatio || 1;
        w = overlay.clientWidth || global.innerWidth;
        h = overlay.clientHeight || global.innerHeight;
        cv.width = w * dpr;
        cv.height = h * dpr;
        cv.style.width = w + "px";
        cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      function seed() {
        dots = [];
        var n = mq.matches ? 0 : 920;
        for (var i = 0; i < n; i++) {
          dots.push({
            x: w * (0.12 + Math.random() * 0.1),
            y: h * (0.52 + Math.random() * 0.2),
            tx: w * (0.15 + Math.random() * 0.8),
            ty: h * (0.1 + Math.random() * 0.8),
            t: Math.random(),
            spd: 0.33 + Math.random() * 0.5,
            col: Math.random() > 0.45 ? "#caa05a" : "#6da5d9"
          });
        }
      }

      size();
      seed();

      global.addEventListener(
        "resize",
        function () {
          size();
          seed();
        },
        false
      );

      var start = performance.now();
      var dur = 3e4;

      function finish() {
        overlay.dataset.visible = "false";
        overlay.dataset.showskip = "false";
        onDone();
      }

      var skipBtn = global.document.getElementById("migration-skip-btn");
      if (skipBtn) {
        skipBtn.onclick = function () {
          global.localStorage.setItem(STORAGE, "1");
          cancelAnimationFrame(raf);
          finish();
        };
      }

      var raf;
      function frame(now) {
        var t = Math.min(1, (now - start) / dur);
        cx.fillStyle = "rgba(11,13,17,0.22)";
        cx.fillRect(0, 0, w + 40, h + 40);
        var ease = Math.pow(t, 2.05);
        for (var di = 0; di < dots.length; di++) {
          var p = dots[di];
          var tx = (p.tx - p.x) * p.spd * ease;
          var ty = (p.ty - p.y) * p.spd * ease;
          p.x += tx * 0.014;
          p.y += ty * 0.014;
          cx.beginPath();
          cx.fillStyle = p.col;
          cx.globalAlpha = 0.82 * (1 - t * 0.35);
          cx.arc(p.x, p.y, 1 + t * 0.7, 0, Math.PI * 2);
          cx.fill();
        }
        cx.globalAlpha = 1;
        if (t >= 1) {
          global.localStorage.setItem(STORAGE, "1");
          finish();
          return;
        }
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
    }
  };
})(window);
