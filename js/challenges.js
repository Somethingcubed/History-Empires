/**
 * Lightweight educational challenge layer for casual exploration.
 */
(function (global) {
  "use strict";

  var state = {
    host: null,
    empires: [],
    timelineLinked: true,
    mode: "guess",
    current: null,
    score: 0,
    streak: 0,
    answered: false,
    roundLeft: 0
  };

  function fmtYear(y) {
    y = Math.round(y);
    if (y < 0) return Math.abs(y) + "\u202fBCE";
    return y + "\u202fCE";
  }

  function duration(emp) {
    return Math.max(1, emp.endYear - emp.startYear);
  }

  function rand(max) {
    return Math.floor(Math.random() * max);
  }

  function sample(arr) {
    return arr[rand(arr.length)];
  }

  function shuffle(arr) {
    var out = arr.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = rand(i + 1);
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function uniqueOptions(answer, pool, size) {
    var seen = {};
    var out = [answer];
    seen[answer.id] = true;
    var choices = shuffle(pool);
    choices.forEach(function (emp) {
      if (out.length >= size) return;
      if (!emp || seen[emp.id]) return;
      seen[emp.id] = true;
      out.push(emp);
    });
    return shuffle(out);
  }

  function clueText(emp) {
    var events = emp.majorEvents && emp.majorEvents.length ? emp.majorEvents.slice(0, 3).join(", ") : "major turning points";
    return [
      "Region: " + (emp.region || "unknown"),
      "Years: " + fmtYear(emp.startYear) + " to " + fmtYear(emp.endYear),
      "Faith / culture: " + (emp.religion || "mixed or uncertain"),
      "Clues: " + events
    ];
  }

  function makeGuessQuestion() {
    var answer = sample(state.empires);
    var sameRegion = state.empires.filter(function (emp) {
      return emp.region === answer.region && emp.id !== answer.id;
    });
    var pool = sameRegion.length >= 3 ? sameRegion : state.empires;
    return {
      type: "guess",
      prompt: "Guess the empire from these clues.",
      clues: clueText(answer),
      answerId: answer.id,
      options: uniqueOptions(answer, pool, 4),
      explain:
        answer.name +
        " fits the date range " +
        fmtYear(answer.startYear) +
        " to " +
        fmtYear(answer.endYear) +
        " and belongs to " +
        answer.region +
        "."
    };
  }

  function compareValue(emp, kind) {
    if (kind === "older") return -emp.startYear;
    if (kind === "later_end") return emp.endYear;
    if (kind === "longer") return duration(emp);
    if (kind === "science") return Number(emp.science) || 0;
    if (kind === "happiness") return Number(emp.happiness) || 0;
    if (kind === "taxes") return Number(emp.taxes) || 0;
    return duration(emp);
  }

  function compareLabel(kind) {
    if (kind === "older") return "started earlier?";
    if (kind === "later_end") return "ended later (last year on the timeline)?";
    if (kind === "science") return "has the higher science / administration score in this dataset?";
    if (kind === "happiness") return "has the higher happiness score in this dataset?";
    if (kind === "taxes") return "has the higher taxes score in this dataset?";
    return "lasted longer?";
  }

  function compareExplain(a, b, kind, winner) {
    if (kind === "older") {
      return winner.name + " started in " + fmtYear(winner.startYear) + ", earlier than the other option.";
    }
    if (kind === "later_end") {
      return winner.name + " lasted until " + fmtYear(winner.endYear) + ", later than the other option.";
    }
    if (kind === "science") {
      return (
        winner.name +
        " has a science / administration score of " +
        (Number(winner.science) || 0) +
        " in this dataset."
      );
    }
    if (kind === "happiness") {
      return (
        winner.name +
        " has a happiness score of " +
        (Number(winner.happiness) || 0) +
        " in this dataset (illustrative only)."
      );
    }
    if (kind === "taxes") {
      return (
        winner.name +
        " has a taxes score of " +
        (Number(winner.taxes) || 0) +
        " in this dataset (illustrative only)."
      );
    }
    return winner.name + " lasted about " + duration(winner) + " years.";
  }

  function pickCompareKind() {
    var weighted = [
      "longer",
      "longer",
      "science",
      "science",
      "later_end",
      "later_end",
      "happiness",
      "happiness",
      "taxes",
      "taxes",
      "older"
    ];
    return sample(weighted);
  }

  function makeCompareQuestion() {
    var kind = pickCompareKind();
    var a = sample(state.empires);
    var b = sample(state.empires);
    var guard = 0;
    while ((a.id === b.id || compareValue(a, kind) === compareValue(b, kind)) && guard < 50) {
      b = sample(state.empires);
      guard++;
    }
    var winner = compareValue(a, kind) > compareValue(b, kind) ? a : b;
    return {
      type: "compare",
      prompt: "Which empire " + compareLabel(kind),
      clues: [
        a.name + ": " + fmtYear(a.startYear) + " to " + fmtYear(a.endYear),
        b.name + ": " + fmtYear(b.startYear) + " to " + fmtYear(b.endYear)
      ],
      answerId: winner.id,
      options: shuffle([a, b]),
      explain: compareExplain(a, b, kind, winner)
    };
  }

  function countMatching(testFn) {
    var n = 0;
    state.empires.forEach(function (emp) {
      if (testFn(emp)) n++;
    });
    return n;
  }

  function pickDurationThreshold() {
    var candidates = [100, 160, 240, 320, 450, 600, 800, 1100, 1400];
    var viable = candidates.filter(function (t) {
      return countMatching(function (emp) {
        return duration(emp) >= t;
      }) >= 4;
    });
    if (viable.length) return sample(viable);
    return 200;
  }

  function makeHuntQuestionMc() {
    var guard = 0;
    while (guard < 45) {
      guard++;
      var base = makeHuntQuestion();
      if (!base || !base.test) continue;
      var correctPool = state.empires.filter(function (emp) {
        return base.test(emp);
      });
      if (!correctPool.length) continue;
      var answer = sample(correctPool);
      var prompt = base.prompt.replace(/\bclick\b/gi, "pick");
      return {
        type: "hunt_mc",
        prompt: prompt,
        clues: base.clues,
        answerId: answer.id,
        options: uniqueOptions(answer, state.empires, 4),
        explain: base.explain
      };
    }
    return makeCompareQuestion();
  }

  function makeHuntQuestion() {
    var modes = ["region", "overlap", "duration", "active_year", "region_early"];
    var mode = sample(modes);

    if (mode === "overlap") {
      var anchor = sample(state.empires);
      return {
        type: "hunt",
        prompt: "Timeline Hunt: click an empire that overlapped " + anchor.name + ".",
        clues: ["Target span: " + fmtYear(anchor.startYear) + " to " + fmtYear(anchor.endYear)],
        test: function (emp) {
          return emp.id !== anchor.id && !(emp.endYear < anchor.startYear || emp.startYear > anchor.endYear);
        },
        explain: "A correct answer shares at least one year with " + anchor.name + "."
      };
    }

    if (mode === "duration") {
      var threshold = pickDurationThreshold();
      return {
        type: "hunt",
        prompt: "Timeline Hunt: click an empire that lasted at least " + threshold + " years.",
        clues: ["Compare bar lengths on the timeline."],
        test: function (emp) {
          return duration(emp) >= threshold;
        },
        explain: "This empire spans about " + threshold + " years or more from start to end."
      };
    }

    if (mode === "active_year") {
      var seed = sample(state.empires);
      var span = duration(seed);
      var y =
        seed.startYear +
        (span <= 1 ? 0 : rand(span));
      if (countMatching(function (emp) {
        return emp.startYear <= y && emp.endYear >= y;
      }) < 6) {
        mode = "region";
      } else {
        return {
          type: "hunt",
          prompt: "Timeline Hunt: click any empire that existed in " + fmtYear(y) + ".",
          clues: ["The bar should cover that year somewhere along its length."],
          test: function (emp) {
            return emp.startYear <= y && emp.endYear >= y;
          },
          explain: "That empire's timeline includes " + fmtYear(y) + "."
        };
      }
    }

    if (mode === "region_early") {
      var cutoffs = [-500, 1, 500, 800, 1000, 1300, 1600];
      var regions = {};
      state.empires.forEach(function (emp) {
        if (emp.region) regions[emp.region] = true;
      });
      var regionKeys = Object.keys(regions);
      var tries = 0;
      while (tries < 28) {
        tries++;
        var rg = sample(regionKeys);
        var cutoff = sample(cutoffs);
        var ok =
          countMatching(function (emp) {
            return emp.region === rg && emp.startYear < cutoff;
          }) >= 3;
        if (ok) {
          return {
            type: "hunt",
            prompt:
              "Timeline Hunt: click an empire from " +
              rg +
              " that began before " +
              fmtYear(cutoff) +
              ".",
            clues: ["Check region bands and start dates."],
            test: function (emp) {
              return emp.region === rg && emp.startYear < cutoff;
            },
            explain: "That empire is tagged " + rg + " and starts before " + fmtYear(cutoff) + "."
          };
        }
      }
      mode = "region";
    }

    var regions = {};
    state.empires.forEach(function (emp) {
      if (emp.region) regions[emp.region] = true;
    });
    var region = sample(Object.keys(regions));
    return {
      type: "hunt",
      prompt: "Timeline Hunt: click an empire from " + region + ".",
      clues: ["Use the region labels or the legend to scan the timeline."],
      test: function (emp) {
        return emp.region === region;
      },
      explain: "The selected empire belongs to " + region + "."
    };
  }

  function nextQuestion(mode) {
    state.mode = mode || state.mode || "guess";
    state.answered = false;
    if (state.mode === "compare") state.current = makeCompareQuestion();
    else if (state.mode === "hunt")
      state.current = state.timelineLinked ? makeHuntQuestion() : makeHuntQuestionMc();
    else state.current = makeGuessQuestion();
    render();
  }

  function answer(optionId) {
    if (!state.current || state.answered) return;
    if (state.current.type === "hunt") return;
    state.answered = true;
    var ok = optionId === state.current.answerId;
    settle(ok, state.current.explain);
  }

  function settle(ok, message) {
    if (ok) {
      state.score++;
      state.streak++;
      if (state.roundLeft > 0) state.roundLeft--;
    } else {
      state.streak = 0;
      state.roundLeft = 0;
    }
    renderFeedback(ok, message);
  }

  function startRound() {
    state.score = 0;
    state.streak = 0;
    state.roundLeft = 5;
    nextQuestion("guess");
  }

  function render() {
    var host = state.host;
    if (!host || !state.current) return;
    var q = state.current;
    var modeLabel =
      q.type === "hunt" || q.type === "hunt_mc"
        ? "Timeline Hunt"
        : q.type === "compare"
          ? "Quick Compare"
          : "Guess the Empire";
    var html = "";
    html += '<div class="challenge-head">';
    html += '<div><p class="challenge-kicker">Educational challenge</p><h2>' + modeLabel + "</h2></div>";
    html += '<div class="challenge-score" aria-label="Challenge score"><strong>' + state.score + "</strong> score<br/><span>" + state.streak + " streak</span></div>";
    html += "</div>";
    html += '<div class="challenge-modes" role="group" aria-label="Challenge modes">';
    html += modeButton("guess", "Guess");
    html += modeButton("compare", "Compare");
    html += modeButton("hunt", "Timeline Hunt");
    html += '<button type="button" data-action="round">5-question run</button>';
    html += '<button type="button" data-action="reset">Reset</button>';
    html += "</div>";
    if (state.roundLeft > 0) html += '<p class="challenge-round">' + state.roundLeft + " questions left in this run.</p>";
    html += '<p class="challenge-prompt">' + q.prompt + "</p>";
    html += '<ul class="challenge-clues">';
    q.clues.forEach(function (line) {
      html += "<li>" + line + "</li>";
    });
    html += "</ul>";
    if (q.type === "hunt") {
      html += '<p class="challenge-hunt-note">Click a matching empire bar on the timeline to answer.</p>';
    } else if (q.type === "hunt_mc") {
      html += '<p class="challenge-hunt-note">Pick one empire below — timeline hunt mode without the timeline.</p>';
    }
    if (q.type !== "hunt") {
      html += '<div class="challenge-options">';
      q.options.forEach(function (opt) {
        html += '<button type="button" data-answer="' + opt.id + '">' + opt.name + "</button>";
      });
      html += "</div>";
    }
    html += '<p class="challenge-feedback" role="status" aria-live="polite"></p>';
    host.innerHTML = html;
    wireHost();
  }

  function modeButton(mode, label) {
    return (
      '<button type="button" data-mode="' +
      mode +
      '"' +
      (state.mode === mode ? ' class="is-active"' : "") +
      ">" +
      label +
      "</button>"
    );
  }

  function renderFeedback(ok, message) {
    var fb = state.host ? state.host.querySelector(".challenge-feedback") : null;
    if (!fb) return;
    fb.className = "challenge-feedback " + (ok ? "is-correct" : "is-wrong");
    fb.textContent = (ok ? "Correct. " : "Not quite. ") + message;
    window.setTimeout(function () {
      if (!state.host) return;
      nextQuestion(state.mode);
    }, 1450);
  }

  function wireHost() {
    var host = state.host;
    if (!host) return;
    host.querySelectorAll("[data-mode]").forEach(function (btn) {
      btn.onclick = function () {
        state.roundLeft = 0;
        nextQuestion(btn.getAttribute("data-mode"));
      };
    });
    host.querySelectorAll("[data-answer]").forEach(function (btn) {
      btn.onclick = function () {
        answer(btn.getAttribute("data-answer"));
      };
    });
    var round = host.querySelector('[data-action="round"]');
    if (round) round.onclick = startRound;
    var reset = host.querySelector('[data-action="reset"]');
    if (reset)
      reset.onclick = function () {
        state.score = 0;
        state.streak = 0;
        state.roundLeft = 0;
        nextQuestion(state.mode);
      };
  }

  global.EmpireChallenges = {
    init: function (host, empires, opts) {
      opts = opts || {};
      state.timelineLinked = opts.timelineLinked !== false;
      state.host = host;
      state.empires = (empires || []).filter(function (emp) {
        return emp && emp.id && emp.name && typeof emp.startYear === "number" && typeof emp.endYear === "number";
      });
      if (!state.host || !state.empires.length) return;
      nextQuestion("guess");
    },
    handleTimelinePick: function (empire) {
      if (!state.current || state.current.type !== "hunt" || state.answered) return;
      state.answered = true;
      var ok = !!(empire && state.current.test && state.current.test(empire));
      settle(ok, state.current.explain);
    }
  };
})(window);
