/**
 * Slide-out empire detail markup (pattern similar to TimelineJS card hierarchy).
 */
(function (global) {
  "use strict";

  global.EmpireDetailPanel = {
    mount: function (rootEl, onCloseTap) {
      this.root = rootEl;
      this.onCloseTap = onCloseTap || function () {};
    },

    toggleMobile: function (open) {
      if (!this.root) return;
      this.root.dataset.open = open ? "true" : "false";
    },

    show: function (e) {
      if (!this.root) return;

      function esc(s) {
        return String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\"/g, "&quot;");
      }

      function row(label, pct) {
        var v = typeof pct === "number" ? Math.max(0, Math.min(100, pct)) : 0;
        return (
          '<dl class="metric-bar-row"><dt><span>' +
          esc(label) +
          "</span><span>" +
          Math.round(v) +
          '</span></dt><div class="metric-bar-track"><div class="metric-bar-fill" style="width: 0;"></div></div></dl>'
        );
      }

      var durYears = Math.max(1, e.endYear - e.startYear || 1);
      var bullets = (e.majorEvents || [])
        .slice(0, 6)
        .map(function (m) {
          return "<li>" + esc(m) + "</li>";
        })
        .join("");

      this.root.innerHTML =
        '<div class="detail-panel-inner"><div class="panel-close-mobile"><button type="button" id="close-panel-x" aria-label="Close panel">Close</button></div><h2 class="detail-title">' +
        esc(e.name) +
        "</h2>" +
        "<p class=\"detail-meta-line\">" +
        (e.startYear < 0 ? esc(Math.abs(e.startYear)) + " BCE" : esc(e.startYear + " CE")) +
        "\u2192 " +
        (e.endYear < 0 ? esc(Math.abs(e.endYear)) + " BCE" : esc(e.endYear + " CE")) +
        " \u0026middot; " +
        durYears +
        " yrs \u0026middot; " +
        esc(e.region) +
        '</p><div id="metrics-wrap">' +
        row("SCIENCE SCORE", e.science) +
        row("TAX LOAD", e.taxes) +
        row("HAPPINESS (PROXY)", e.happiness) +
        "</div>" +
        '<dl class="metric-bar-row"><dt><span>BELIEF</span><span></span></dt><div class="metric-bar-note">' +
        esc(e.religion) +
        '</div></dl><dl class="metric-bar-row"><dt><span>POLITICS</span><span></span></dt><div class="metric-bar-note">' +
        esc(e.politics) +
        '</div></dl><div class="detail-desc">' +
        esc(e.description) +
        '</div><div class="detail-events"><p style="margin:14px 0 4px;font-size:12px;color:#949db3;text-transform:uppercase;letter-spacing:.08em;">Notable eras</p><ul>' +
        bullets +
        '</ul></div></div>';

      var self = this;
      global.requestAnimationFrame(function () {
        self.root.querySelectorAll(".metric-bar-fill").forEach(function (el, idx) {
          var labels = ["science", "taxes", "happiness"];
          var pct = typeof e[labels[idx]] === "number" ? Math.max(0, Math.min(100, e[labels[idx]])) : 0;
          el.style.width = pct + "%";
        });
      });

      var xc = global.document.getElementById("close-panel-x");
      if (xc) xc.onclick = function () {self.onCloseTap();};

      this.toggleMobile(true);
    },

    reset: function () {
      if (!this.root) return;
      this.root.innerHTML =
        '<div class="detail-panel-inner"><p class="detail-panel-placeholder">Select an empire strip to open its museum-label profile.</p></div>';
      this.toggleMobile(false);
    }
  };
})(window);
