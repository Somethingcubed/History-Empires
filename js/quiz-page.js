/**
 * Standalone quiz page (no timeline canvas — Timeline Hunt uses multiple choice).
 */
(function () {
  "use strict";

  fetch("data/empires.json")
    .then(function (r) {
      return r.ok ? r.json() : [];
    })
    .then(function (rows) {
      var msg = document.getElementById("quiz-load-msg");
      if (msg) msg.classList.add("is-done");
      var root = document.getElementById("challenge-root");
      if (window.EmpireChallenges && EmpireChallenges.init) {
        EmpireChallenges.init(root, rows, { timelineLinked: false });
      }
    });
})();
