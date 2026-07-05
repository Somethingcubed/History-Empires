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

      function truncatePlain(s, max) {
        if (!s) return "";
        s = String(s);
        return s.length <= max ? s : s.slice(0, max - 1) + "\u2026";
      }

      function fmtKimiDateObj(o) {
        if (!o || typeof o.value !== "number") return "";
        var isBCE = o.unit === "BCE";
        var num = isBCE ? Math.abs(o.value) : o.value;
        var suf = isBCE ? " BCE" : " CE";
        return esc(String(num)) + suf;
      }

      function kimiAppendixHtml(k) {
        if (!k) return "";
        var bits = [];
        bits.push('<div class="detail-kimi-section">');
        bits.push('<p class="detail-kimi-heading">More context (archaeology dataset)</p>');
        bits.push(
          '<p class="detail-kimi-note">Linked automatically when this timeline row overlaps a Kimi ancient-civilizations entry (by name + dates). Useful texture for casual reading — experts disagree on detail.</p>'
        );
        if (k.primary_name || k.englishName) {
          bits.push('<p class="detail-kimi-bilingual">');
          if (k.primary_name) bits.push('<span class="detail-kimi-zh">' + esc(k.primary_name) + "</span>");
          if (k.englishName)
            bits.push(
              (k.primary_name ? " " : "") +
                '<span class="detail-kimi-en">(' +
                esc(k.englishName) +
                ")</span>"
            );
          bits.push("</p>");
        }
        var chron =
          (k.date_begin ? fmtKimiDateObj(k.date_begin) : "") +
          (k.date_begin && k.date_end ? " \u2013 " : "") +
          (k.date_end ? fmtKimiDateObj(k.date_end) : "");
        if (chron) bits.push('<p class="detail-kimi-line"><strong>Archaeological chronology</strong> — ' + chron + "</p>");
        if (k.archaeological_culture)
          bits.push(
            '<p class="detail-kimi-line"><strong>Material culture label</strong> — ' +
              esc(truncatePlain(k.archaeological_culture, 320)) +
              "</p>"
          );
        if (k.period_main)
          bits.push(
            '<p class="detail-kimi-line"><strong>Phasing</strong> — ' + esc(truncatePlain(k.period_main, 280)) + "</p>"
          );
        if (k.confidence_level)
          bits.push('<p class="detail-kimi-line"><strong>Dataset confidence</strong> — ' + esc(String(k.confidence_level)) + "</p>");
        if (k.territory_verified)
          bits.push(
            '<p class="detail-kimi-line"><strong>Where digs anchor the story</strong> — ' +
              esc(truncatePlain(k.territory_verified, 380)) +
              "</p>"
          );
        if (k.territory_inferred)
          bits.push(
            '<p class="detail-kimi-line"><strong>Wider interpretation</strong> — ' +
              esc(truncatePlain(k.territory_inferred, 380)) +
              "</p>"
          );
        var labs = k.core_site_labels && k.core_site_labels.length ? k.core_site_labels : [];
        if (labs.length) {
          bits.push('<p class="detail-kimi-line"><strong>Signature sites</strong></p><ul class="detail-kimi-sites">');
          var si = 0;
          for (; si < labs.length; si++) bits.push("<li>" + esc(labs[si]) + "</li>");
          bits.push("</ul>");
        }
        if (k.research_notes)
          bits.push(
            '<p class="detail-kimi-notes">' + esc(truncatePlain(k.research_notes, 720)) + "</p>"
          );
        var cont = k.controversies && k.controversies.length ? k.controversies : [];
        if (cont.length) {
          bits.push('<p class="detail-kimi-line"><strong>Open debates (dataset notes)</strong></p><ul class="detail-kimi-sites">');
          var ci = 0;
          for (; ci < cont.length; ci++) {
            var co = cont[ci];
            var issue = co && co.issue ? truncatePlain(co.issue, 220) : "";
            if (issue) bits.push("<li>" + esc(issue) + "</li>");
          }
          bits.push("</ul>");
        }
        var src = k.data_sources && k.data_sources.length ? k.data_sources : [];
        if (src.length) {
          bits.push('<p class="detail-kimi-line"><strong>Leads for reading</strong></p><ul class="detail-kimi-sources">');
          var ri = 0;
          for (; ri < src.length; ri++) bits.push("<li>" + esc(truncatePlain(src[ri], 200)) + "</li>");
          bits.push("</ul>");
        }
        if (k.civilization_id)
          bits.push('<p class="detail-kimi-id">Dataset id: <code>' + esc(k.civilization_id) + "</code> \u00b7 CC BY-SA 4.0</p>");
        bits.push("</div>");
        return bits.join("");
      }

      var durYears = Math.max(1, e.endYear - e.startYear || 1);
      var bullets = (e.majorEvents || [])
        .slice(0, 6)
        .map(function (m) {
          return "<li>" + esc(m) + "</li>";
        })
        .join("");
      var kimiHtml = kimiAppendixHtml(e.kimiMatch);

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
        "</ul></div>" +
        kimiHtml +
        "</div>";

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
