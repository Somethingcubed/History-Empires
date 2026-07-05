/**
 * Hypothetical war-room — toy proxies + doctrine/theater/tempo interactives (not historical simulation).
 */
(function () {
  "use strict";

  var DOCTRINES = {
    balanced: {
      label: "Balanced staff college",
      m: 1,
      e: 1,
      mo: 1,
      chaosMul: 1,
      blurb: "no flashy gimmick—just competent bureaucracy cosplay."
    },
    butcher: {
      label: "Shock & butcher drills",
      m: 9,
      e: -4,
      mo: 1,
      chaosMul: 1.14,
      blurb: "front-loaded brutality; supply clerks cry quietly."
    },
    quartermaster: {
      label: "Ledger-first logistics cult",
      m: -2,
      e: 10,
      mo: 0,
      chaosMul: 0.88,
      blurb: "believes wars are won in spreadsheets first."
    },
    zeal: {
      label: "Banner morale maximalism",
      m: 1,
      e: -3,
      mo: 11,
      chaosMul: 1.06,
      blurb: "chants marching songs until morale overflows."
    },
    engineer: {
      label: "Siege braintrust / artillery fantasy",
      m: 6,
      e: 5,
      mo: -3,
      chaosMul: 0.94,
      blurb: "loves trenches, cranes, and trajectories."
    },
    skirmisher: {
      label: "Raiders / asymmetric nibblers",
      m: 5,
      e: 0,
      mo: 4,
      chaosMul: 1.2,
      blurb: "death-by-a-thousand sorties; maps optional."
    }
  };

  var THEATERS = {
    open: {
      label: "Open plains — cav optics crush morale checks",
      wMil: 0.035,
      wEcon: 0,
      wMor: -0.015,
      wScale: -0.02
    },
    choke: {
      label: "Mountain choke — whoever stalls first hemorrhages",
      wMil: 0.025,
      wEcon: 0.015,
      wMor: 0.025,
      wScale: -0.065
    },
    siege: {
      label: "Siege cordon — whoever hoards grain annoys historians later",
      wMil: 0,
      wEcon: 0.048,
      wMor: -0.025,
      wScale: -0.023
    },
    delta: {
      label: "River delta maze — barges arrive whenever logistics RNG smiles",
      wMil: -0.022,
      wEcon: 0.042,
      wMor: 0,
      wScale: -0.02
    },
    steppe: {
      label: "Steppe endurance meme — drag-out pacing favors stamina proxies",
      wMil: 0.018,
      wEcon: -0.022,
      wMor: 0.012,
      wScale: 0.036
    }
  };

  var EPITHETS = [
    "Iron-Bark",
    "Glass-Eye",
    "Nine-Strike",
    "Copper-Tally",
    "Ash-Rider",
    "River-Dog",
    "Ghost-Levy",
    "Storm-Clerk",
    "Rust-Spire",
    "Honeyblade",
    "Salt-Line",
    "Moon-Stirrup",
    "Dust-Braid",
    "Quiet-Arson",
    "Clock-Throat"
  ];

  var ROLES = ["Marshal", "Strategos", "Satrap", "Warlord", "Prefect", "Doge", "Khan", "Hetman"];

  function hashStr(str) {
    var s = 0;
    var i = 0;
    for (; i < str.length; i++) s = (Math.imul(31, s) + str.charCodeAt(i)) | 0;
    return Math.abs(s);
  }

  function clampScore(n) {
    return Math.min(100, Math.max(0, Math.round(n)));
  }

  function fmtYear(y) {
    y = Math.round(y);
    if (y < 0) return Math.abs(y) + "\u202fBCE";
    return y + "\u202fCE";
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/\"/g, "&quot;");
  }

  function commanderTitle(empId, doctrineKey, nonce, sideLetter) {
    var h = hashStr(String(empId) + "|" + doctrineKey + "|" + nonce + "|" + sideLetter);
    var role = ROLES[h % ROLES.length];
    var epithet = EPITHETS[(h >>> 5) % EPITHETS.length];
    return role + " — “" + epithet + "”";
  }

  function chaosBonus(a, b, salt) {
    var str = String(a.id) + "\x1e" + String(b.id) + "\x1e" + salt;
    var s = 0;
    var i = 0;
    for (; i < str.length; i++) s = (Math.imul(31, s) + str.charCodeAt(i)) | 0;
    return (Math.abs(s) % 61) / 10 - 3;
  }

  function proxies(emp) {
    var dur = Math.max(1, emp.endYear - emp.startYear);
    var sci = Number(emp.science) || 0;
    var tax = Number(emp.taxes) || 0;
    var hap = Number(emp.happiness) || 0;
    var scale = Math.min(100, Math.round(18 + (Math.log(dur) / Math.log(4500)) * 82));
    var military = Math.round(0.38 * sci + 0.34 * tax + 0.28 * hap);
    var economy = Math.round(0.44 * tax + 0.36 * sci + 0.2 * hap);
    var morale = Math.round(hap);
    military = clampScore(military);
    economy = clampScore(economy);
    morale = clampScore(morale);
    return { military: military, economy: economy, morale: morale, scale: scale, durationYears: dur };
  }

  function applyDoctrine(raw, doctrineKey) {
    var doc = DOCTRINES[doctrineKey] || DOCTRINES.balanced;
    return {
      bundle: {
        military: clampScore(raw.military + doc.m),
        economy: clampScore(raw.economy + doc.e),
        morale: clampScore(raw.morale + doc.mo),
        scale: raw.scale,
        durationYears: raw.durationYears
      },
      doc: doc
    };
  }

  function normalizedWeights(theaterKey, tempo) {
    var base = { wm: 0.34, we: 0.34, wmo: 0.17, ws: 0.15 };
    var th = THEATERS[theaterKey] || THEATERS.open;
    var w = {
      wm: base.wm + th.wMil,
      we: base.we + th.wEcon,
      wmo: base.wmo + th.wMor,
      ws: base.ws + th.wScale
    };
    if (tempo === "psyop") {
      w.wm -= 0.025;
      w.we -= 0.015;
      w.wmo += 0.045;
      w.ws -= 0.005;
    }
    var sum = w.wm + w.we + w.wmo + w.ws;
    w.wm /= sum;
    w.we /= sum;
    w.wmo /= sum;
    w.ws /= sum;
    return { weights: w, theater: th };
  }

  function tempoChaosMul(tempo) {
    if (tempo === "blitz") return 1.28;
    if (tempo === "grind") return 0.74;
    if (tempo === "psyop") return 1.06;
    return 1;
  }

  function battleTotal(p, chaos, weights) {
    return (
      weights.wm * p.military +
      weights.we * p.economy +
      weights.wmo * p.morale +
      weights.ws * p.scale +
      chaos
    );
  }

  function barRow(label, aVal, bVal, maxVal) {
    maxVal = Math.max(maxVal, 1);
    var pctA = Math.round((100 * aVal) / maxVal);
    var pctB = Math.round((100 * bVal) / maxVal);
    return (
      '<div class="matchup-metric"><div class="matchup-metric-label">' +
      label +
      '</div><div class="matchup-bar-pair"><div class="matchup-bar-track"><div class="matchup-bar-fill matchup-bar-a" style="width:' +
      pctA +
      '%"></div></div><div class="matchup-bar-track"><div class="matchup-bar-fill matchup-bar-b" style="width:' +
      pctB +
      '%"></div></div></div><div class="matchup-metric-nums"><span>' +
      aVal +
      "</span><span>" +
      bVal +
      "</span></div></div>"
    );
  }

  function narrative(meta, winner, loser, pw, pl, scoreW, scoreL) {
    var lines = [];
    lines.push(
      "<strong>" +
        escHtml(meta.cmdWinner) +
        "</strong> (" +
        escHtml(winner.name) +
        ", <em>" +
        escHtml(meta.doctrineLabelW) +
        "</em>) trades blows with <strong>" +
        escHtml(meta.cmdLoser) +
        "</strong> (" +
        escHtml(loser.name) +
        ", <em>" +
        escHtml(meta.doctrineLabelL) +
        "</em>) on <em>" +
        escHtml(meta.theaterLabel) +
        "</em>."
    );
    lines.push(
      "War-room ticker awards it to <strong>" +
        escHtml(winner.name) +
        "</strong> by toy tally <strong>" +
        scoreW.toFixed(1) +
        "</strong> vs <strong>" +
        scoreL.toFixed(1) +
        "</strong> (" +
        escHtml(meta.tempoLabel) +
        " pacing)."
    );
    if (meta.diceStory) lines.push(meta.diceStory);
    var diffs = [
      { label: "force-mix proxy", d: pw.military - pl.military },
      { label: "treasury proxy", d: pw.economy - pl.economy },
      { label: "morale proxy", d: pw.morale - pl.morale },
      { label: "endurance proxy", d: pw.scale - pl.scale }
    ];
    diffs.sort(function (x, y) {
      return Math.abs(y.d) - Math.abs(x.d);
    });
    var top = diffs[0];
    if (top && Math.abs(top.d) >= 4) {
      var fav = top.d > 0 ? winner.name : loser.name;
      lines.push(
        "Largest gap sits on <strong>" +
          escHtml(top.label) +
          "</strong>, leaning toward <strong>" +
          escHtml(fav) +
          "</strong> (~" +
          Math.abs(top.d) +
          " pts)."
      );
    }
    lines.push(
      "Doctrine flavor: <em>" +
        escHtml(meta.blurbW) +
        "</em> versus <em>" +
        escHtml(meta.blurbL) +
        "</em> — pure campfire nonsense."
    );
    lines.push(
      "Reminder: no demographics, no disease rolls, no allies crashing the party—only vibes forged from spreadsheet scraps."
    );
    return "<p>" + lines.join("</p><p>") + "</p>";
  }

  function runBattle(a, b, ctx) {
    var doctrineA = ctx.doctrineA || "balanced";
    var doctrineB = ctx.doctrineB || "balanced";
    var theaterKey = ctx.theaterKey || "open";
    var tempo = ctx.tempo || "blitz";
    var tempoMul = tempoChaosMul(tempo);
    var nw = normalizedWeights(theaterKey, tempo);
    var weights = nw.weights;

    var docMetaA = DOCTRINES[doctrineA] || DOCTRINES.balanced;
    var docMetaB = DOCTRINES[doctrineB] || DOCTRINES.balanced;

    var paRaw = proxies(a);
    var pbRaw = proxies(b);
    var paAdj = applyDoctrine(paRaw, doctrineA);
    var pbAdj = applyDoctrine(pbRaw, doctrineB);
    var pa = paAdj.bundle;
    var pb = pbAdj.bundle;

    var salt = tempo + "|" + theaterKey;
    var baseCa = chaosBonus(a, b, salt + "|a") * docMetaA.chaosMul * tempoMul;
    var baseCb = chaosBonus(b, a, salt + "|b") * docMetaB.chaosMul * tempoMul;

    var fateA = typeof ctx.playerRollA === "number" ? (ctx.playerRollA - 3.5) * 0.92 : 0;
    var fateB = typeof ctx.playerRollB === "number" ? (ctx.playerRollB - 3.5) * 0.92 : 0;
    var wildAmt = 0;
    if (ctx.spicyMercenary && typeof ctx.playerWild === "number") {
      wildAmt = (ctx.playerWild - 3.5) * 0.48;
    }

    var caPre = baseCa + fateA + wildAmt;
    var cbPre = baseCb + fateB + wildAmt;
    var ca = caPre * (ctx.spicyBloodlust ? 1.22 : 1);
    var cb = cbPre * (ctx.spicyBloodlust ? 1.22 : 1);

    var ta = battleTotal(pa, ca, weights);
    var tb = battleTotal(pb, cb, weights);
    var winner = ta >= tb ? a : b;
    var loser = ta >= tb ? b : a;
    var scoreW = Math.max(ta, tb);
    var scoreL = Math.min(ta, tb);
    var pw = winner.id === a.id ? pa : pb;
    var pl = loser.id === a.id ? pa : pb;

    var cmdWinner = winner.id === a.id ? ctx.commanderA : ctx.commanderB;
    var cmdLoser = loser.id === a.id ? ctx.commanderA : ctx.commanderB;
    var doctrineLabelW = winner.id === a.id ? docMetaA.label : docMetaB.label;
    var doctrineLabelL = loser.id === a.id ? docMetaA.label : docMetaB.label;
    var blurbW = winner.id === a.id ? docMetaA.blurb : docMetaB.blurb;
    var blurbL = loser.id === a.id ? docMetaA.blurb : docMetaB.blurb;

    var tempoLabel = tempo === "grind" ? "grindhouse" : tempo === "psyop" ? "psy-op drum" : "blitz";

    var diceStory = "";
    if (typeof ctx.playerRollA === "number" && typeof ctx.playerRollB === "number") {
      diceStory =
        "Your table dice: <strong>" +
        escHtml(String(ctx.playerRollA)) +
        "</strong> vs <strong>" +
        escHtml(String(ctx.playerRollB)) +
        "</strong>";
      if (ctx.spicyMercenary && typeof ctx.playerWild === "number") {
        diceStory +=
          ', mercenary wild <strong>' + escHtml(String(ctx.playerWild)) + "</strong> rattles both camps.";
      } else {
        diceStory += ".";
      }
      if (ctx.spicyBloodlust) diceStory += " <strong>Bloodlust</strong> multiplies the chaos tail.";
    }

    var meta = {
      cmdWinner: cmdWinner,
      cmdLoser: cmdLoser,
      doctrineLabelW: doctrineLabelW,
      doctrineLabelL: doctrineLabelL,
      theaterLabel: nw.theater.label,
      tempoLabel: tempoLabel,
      blurbW: blurbW,
      blurbL: blurbL,
      diceStory: diceStory
    };

    var maxM = Math.max(pa.military, pb.military, 1);
    var maxE = Math.max(pa.economy, pb.economy, 1);
    var maxMo = Math.max(pa.morale, pb.morale, 1);
    var maxS = Math.max(pa.scale, pb.scale, 1);

    var html = "";
    html += '<div class="matchup-aftermath"><p class="matchup-aftermath-kicker">After-action vibes</p></div>';
    html += '<div class="matchup-cards">';
    html += '<article class="matchup-card"><h3>' + escHtml(a.name) + "</h3>";
    html += "<p>" + fmtYear(a.startYear) + " – " + fmtYear(a.endYear) + " · " + escHtml(a.region || "") + "</p>";
    html += '<p class="matchup-card-meta">' + escHtml(ctx.commanderA) + "</p>";
    html += '<p class="matchup-card-tag">' + escHtml(docMetaA.label) + "</p></article>";
    html += '<article class="matchup-card"><h3>' + escHtml(b.name) + "</h3>";
    html += "<p>" + fmtYear(b.startYear) + " – " + fmtYear(b.endYear) + " · " + escHtml(b.region || "") + "</p>";
    html += '<p class="matchup-card-meta">' + escHtml(ctx.commanderB) + "</p>";
    html += '<p class="matchup-card-tag">' + escHtml(docMetaB.label) + "</p></article>";
    html += "</div>";
    html += '<p class="matchup-context-line"><strong>Theater:</strong> ' + escHtml(nw.theater.label) + "</p>";
    html += "<h4 class=\"matchup-chart-title\">Adjusted toy gauges (after doctrine)</h4>";
    html += '<div class="matchup-chart">';
    html += barRow("Military mix", pa.military, pb.military, maxM);
    html += barRow("Economy / haul", pa.economy, pb.economy, maxE);
    html += barRow("Morale drum", pa.morale, pb.morale, maxMo);
    html += barRow("Institutional endurance", pa.scale, pb.scale, maxS);
    html += "</div>";
    html += '<div class="matchup-chaos-ledger"><h4 class="matchup-chart-title">Chaos ledger</h4>';
    html += '<ul class="matchup-chaos-list">';
    html += "<li><strong>Hidden engine A</strong> \u2248 " + baseCa.toFixed(2) + "</li>";
    html += "<li><strong>Hidden engine B</strong> \u2248 " + baseCb.toFixed(2) + "</li>";
    if (typeof ctx.playerRollA === "number") {
      html +=
        "<li><strong>Your die — camp A</strong> rolled " +
        escHtml(String(ctx.playerRollA)) +
        " \u2192 " +
        (fateA >= 0 ? "+" : "") +
        fateA.toFixed(2) +
        " chaos tilt</li>";
    }
    if (typeof ctx.playerRollB === "number") {
      html +=
        "<li><strong>Your die — camp B</strong> rolled " +
        escHtml(String(ctx.playerRollB)) +
        " \u2192 " +
        (fateB >= 0 ? "+" : "") +
        fateB.toFixed(2) +
        " chaos tilt</li>";
    }
    if (ctx.spicyMercenary && typeof ctx.playerWild === "number") {
      html +=
        "<li><strong>Mercenary wild</strong> " +
        escHtml(String(ctx.playerWild)) +
        " \u2192 spillover each camp " +
        (wildAmt >= 0 ? "+" : "") +
        wildAmt.toFixed(2) +
        "</li>";
    } else if (ctx.spicyMercenary) {
      html += "<li><strong>Mercenary wild</strong> — (not rolled)</li>";
    }
    html +=
      "<li><strong>Subtotal</strong> (before Bloodlust) A " +
      caPre.toFixed(2) +
      ", B " +
      cbPre.toFixed(2) +
      "</li>";
    if (ctx.spicyBloodlust) {
      html +=
        "<li><strong>Bloodlust</strong> \u00d7 1.22 \u2192 finals feeding score: A " +
        ca.toFixed(2) +
        ", B " +
        cb.toFixed(2) +
        "</li>";
    } else {
      html += "<li><strong>Bloodlust</strong> off — totals above stand.</li>";
    }
    html += "</ul></div>";
    html += '<div class="matchup-verdict">' + narrative(meta, winner, loser, pw, pl, scoreW, scoreL) + "</div>";
    return html;
  }

  function fillDoctrineSelect(sel) {
    if (!sel) return;
    sel.innerHTML = "";
    Object.keys(DOCTRINES).forEach(function (key) {
      var o = document.createElement("option");
      o.value = key;
      o.textContent = DOCTRINES[key].label;
      sel.appendChild(o);
    });
    sel.value = "balanced";
  }

  function fillTheaterSelect(sel) {
    if (!sel) return;
    sel.innerHTML = "";
    Object.keys(THEATERS).forEach(function (key) {
      var o = document.createElement("option");
      o.value = key;
      o.textContent = THEATERS[key].label;
      sel.appendChild(o);
    });
    sel.value = "open";
  }

  fetch("data/empires.json")
    .then(function (r) {
      if (!r.ok) throw new Error("empires.json HTTP " + r.status);
      return r.json();
    })
    .then(function (rows) {
      var msg = document.getElementById("matchup-load-msg");
      var root = document.getElementById("matchup-root");
      var selA = document.getElementById("matchup-a");
      var selB = document.getElementById("matchup-b");
      var docA = document.getElementById("doctrine-a");
      var docB = document.getElementById("doctrine-b");
      var theaterSel = document.getElementById("matchup-theater");
      var btn = document.getElementById("matchup-run");
      var out = document.getElementById("matchup-result");
      var nameElA = document.getElementById("commander-a-name");
      var nameElB = document.getElementById("commander-b-name");
      var rerollA = document.getElementById("reroll-commander-a");
      var rerollB = document.getElementById("reroll-commander-b");

      if (msg) msg.classList.add("is-done");
      if (!root || !selA || !selB || !btn || !out) return;

      fillDoctrineSelect(docA);
      fillDoctrineSelect(docB);
      fillTheaterSelect(theaterSel);

      var nonceCmd = { a: 0, b: 0 };

      var diceFaceA = document.getElementById("dice-face-a");
      var diceFaceB = document.getElementById("dice-face-b");
      var diceWildFace = document.getElementById("dice-wild-face");
      var diceBtnA = document.getElementById("dice-a");
      var diceBtnB = document.getElementById("dice-b");
      var diceBtnWild = document.getElementById("dice-wild");
      var readoutA = document.getElementById("dice-readout-a");
      var readoutB = document.getElementById("dice-readout-b");
      var readoutW = document.getElementById("dice-readout-wild");
      var diceGate = document.getElementById("matchup-dice-gate");
      var diceAuto = document.getElementById("dice-auto");
      var spicyBloodlustEl = document.getElementById("spicy-bloodlust");
      var spicyMercenaryEl = document.getElementById("spicy-mercenary");
      var wildSlot = document.getElementById("wild-die-slot");

      var rollState = { a: null, b: null, w: null };
      var rolling = { a: false, b: false, w: false };

      function rollD6() {
        return 1 + Math.floor(Math.random() * 6);
      }

      function fateReadout(n) {
        var v = (n - 3.5) * 0.92;
        return (v >= 0 ? "+" : "") + v.toFixed(2) + " chaos tilt";
      }

      function wildReadout(n) {
        var v = (n - 3.5) * 0.48;
        return (v >= 0 ? "+" : "") + v.toFixed(2) + " each camp";
      }

      function updateDiceGate() {
        var merc = spicyMercenaryEl && spicyMercenaryEl.checked;
        if (!btn || !diceGate) return;
        var ok = rollState.a != null && rollState.b != null && (!merc || rollState.w != null);
        btn.disabled = !ok;
        btn.setAttribute("aria-disabled", ok ? "false" : "true");
        btn.classList.toggle("is-ready", ok);
        if (ok) diceGate.textContent = "All fate dice locked in — launch whenever.";
        else if (merc) diceGate.textContent = "Roll camp A, camp B, and the mercenary wild die.";
        else diceGate.textContent = "Roll both camp dice to unlock launch.";
      }

      function resetFateDice() {
        rollState = { a: null, b: null, w: null };
        if (diceFaceA) diceFaceA.textContent = "?";
        if (diceFaceB) diceFaceB.textContent = "?";
        if (diceWildFace) diceWildFace.textContent = "\u2014";
        if (readoutA) readoutA.textContent = "";
        if (readoutB) readoutB.textContent = "";
        if (readoutW) readoutW.textContent = "";
        if (diceBtnA) diceBtnA.classList.remove("has-rolled");
        if (diceBtnB) diceBtnB.classList.remove("has-rolled");
        if (diceBtnWild) diceBtnWild.classList.remove("has-rolled");
        out.innerHTML = "";
        updateDiceGate();
      }

      function syncMercenarySlot() {
        var on = spicyMercenaryEl && spicyMercenaryEl.checked;
        if (!wildSlot || !diceBtnWild) return;
        wildSlot.hidden = !on;
        wildSlot.classList.toggle("is-hidden", !on);
        diceBtnWild.disabled = !on;
        if (!on) {
          rollState.w = null;
          if (diceWildFace) diceWildFace.textContent = "\u2014";
          if (readoutW) readoutW.textContent = "";
          diceBtnWild.classList.remove("has-rolled");
        }
        updateDiceGate();
      }

      function animateDice(faceEl, btn, sideKey) {
        if (!faceEl || !btn || rolling[sideKey]) return;
        rolling[sideKey] = true;
        btn.classList.add("is-rolling");
        var finalVal = rollD6();
        var ticks = 0;
        var t = window.setInterval(function () {
          faceEl.textContent = String(rollD6());
          ticks++;
          if (ticks >= 14) {
            window.clearInterval(t);
            faceEl.textContent = String(finalVal);
            btn.classList.remove("is-rolling");
            rolling[sideKey] = false;
            if (sideKey === "a") {
              rollState.a = finalVal;
              if (readoutA) readoutA.textContent = fateReadout(finalVal);
            } else if (sideKey === "b") {
              rollState.b = finalVal;
              if (readoutB) readoutB.textContent = fateReadout(finalVal);
            } else {
              rollState.w = finalVal;
              if (readoutW) readoutW.textContent = wildReadout(finalVal);
            }
            btn.classList.add("has-rolled");
            updateDiceGate();
          }
        }, 44);
      }

      function autoRollDice() {
        rollState.a = rollD6();
        rollState.b = rollD6();
        if (diceFaceA) diceFaceA.textContent = String(rollState.a);
        if (diceFaceB) diceFaceB.textContent = String(rollState.b);
        if (readoutA) readoutA.textContent = fateReadout(rollState.a);
        if (readoutB) readoutB.textContent = fateReadout(rollState.b);
        if (diceBtnA) diceBtnA.classList.add("has-rolled");
        if (diceBtnB) diceBtnB.classList.add("has-rolled");
        if (spicyMercenaryEl && spicyMercenaryEl.checked) {
          rollState.w = rollD6();
          if (diceWildFace) diceWildFace.textContent = String(rollState.w);
          if (readoutW) readoutW.textContent = wildReadout(rollState.w);
          if (diceBtnWild) diceBtnWild.classList.add("has-rolled");
        }
        updateDiceGate();
      }

      function numYear(y) {
        if (typeof y === "number" && !isNaN(y)) return y;
        var n = parseFloat(y);
        return isNaN(n) ? NaN : n;
      }

      var raw = Array.isArray(rows) ? rows : [];
      var empires = raw.filter(function (e) {
        if (!e || !e.id || !e.name) return false;
        var sy = numYear(e.startYear);
        var ey = numYear(e.endYear);
        if (isNaN(sy) || isNaN(ey)) return false;
        e.startYear = sy;
        e.endYear = ey;
        return true;
      });
      empires.sort(function (x, y) {
        return x.name.localeCompare(y.name);
      });

      function fillSelect(sel) {
        sel.innerHTML = "";
        var placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Choose…";
        sel.appendChild(placeholder);
        empires.forEach(function (emp) {
          var o = document.createElement("option");
          o.value = emp.id;
          o.textContent = emp.name;
          sel.appendChild(o);
        });
      }

      function syncDisable() {
        var va = selA.value;
        var vb = selB.value;
        Array.prototype.forEach.call(selA.options, function (opt) {
          if (!opt.value) {
            opt.disabled = false;
            return;
          }
          opt.disabled = !!(vb && opt.value === vb);
        });
        Array.prototype.forEach.call(selB.options, function (opt) {
          if (!opt.value) {
            opt.disabled = false;
            return;
          }
          opt.disabled = !!(va && opt.value === va);
        });
      }

      function empById(id) {
        return empires.filter(function (e) {
          return e.id === id;
        })[0];
      }

      function refreshCommander(side) {
        var nonce = nonceCmd[side];
        var empSel = side === "a" ? selA : selB;
        var docSel = side === "a" ? docA : docB;
        var el = side === "a" ? nameElA : nameElB;
        if (!el) return;
        var emp = empById(empSel.value);
        if (!emp) {
          el.textContent = "— pick an empire first —";
          return;
        }
        var dk = docSel.value || "balanced";
        el.textContent = commanderTitle(emp.id, dk, nonce, side);
      }

      fillSelect(selA);
      fillSelect(selB);
      syncDisable();
      selA.addEventListener("change", function () {
        syncDisable();
        refreshCommander("a");
        resetFateDice();
      });
      selB.addEventListener("change", function () {
        syncDisable();
        refreshCommander("b");
        resetFateDice();
      });
      if (docA) docA.addEventListener("change", function () { refreshCommander("a"); });
      if (docB) docB.addEventListener("change", function () { refreshCommander("b"); });
      if (rerollA)
        rerollA.addEventListener("click", function () {
          nonceCmd.a++;
          refreshCommander("a");
        });
      if (rerollB)
        rerollB.addEventListener("click", function () {
          nonceCmd.b++;
          refreshCommander("b");
        });

      if (diceBtnA && diceFaceA) diceBtnA.addEventListener("click", function () { animateDice(diceFaceA, diceBtnA, "a"); });
      if (diceBtnB && diceFaceB) diceBtnB.addEventListener("click", function () { animateDice(diceFaceB, diceBtnB, "b"); });
      if (diceBtnWild && diceWildFace)
        diceBtnWild.addEventListener("click", function () { animateDice(diceWildFace, diceBtnWild, "w"); });
      if (diceAuto) diceAuto.addEventListener("click", autoRollDice);
      if (spicyMercenaryEl) spicyMercenaryEl.addEventListener("change", syncMercenarySlot);
      syncMercenarySlot();
      updateDiceGate();

      root.hidden = false;
      root.classList.remove("is-hidden");

      btn.addEventListener("click", function () {
        var idA = selA.value;
        var idB = selB.value;
        if (!idA || !idB || idA === idB) {
          out.innerHTML = '<p class="matchup-error">Pick two different empires.</p>';
          return;
        }
        if (rollState.a == null || rollState.b == null || ((spicyMercenaryEl && spicyMercenaryEl.checked) && rollState.w == null)) {
          out.innerHTML = '<p class="matchup-error">Roll the fate dice first — or hit auto-roll.</p>';
          return;
        }
        refreshCommander("a");
        refreshCommander("b");
        var empA = empById(idA);
        var empB = empById(idB);
        var tempoEl = document.querySelector('input[name="matchup-tempo"]:checked');
        var tempo = tempoEl ? tempoEl.value : "blitz";
        var ctx = {
          doctrineA: docA ? docA.value : "balanced",
          doctrineB: docB ? docB.value : "balanced",
          theaterKey: theaterSel ? theaterSel.value : "open",
          tempo: tempo,
          commanderA: nameElA ? nameElA.textContent.trim() : "Unknown commander",
          commanderB: nameElB ? nameElB.textContent.trim() : "Unknown commander",
          playerRollA: rollState.a,
          playerRollB: rollState.b,
          playerWild: spicyMercenaryEl && spicyMercenaryEl.checked ? rollState.w : null,
          spicyBloodlust: !!(spicyBloodlustEl && spicyBloodlustEl.checked),
          spicyMercenary: !!(spicyMercenaryEl && spicyMercenaryEl.checked)
        };
        out.innerHTML = runBattle(empA, empB, ctx);
      });
    })
    .catch(function () {
      var msg = document.getElementById("matchup-load-msg");
      if (msg) {
        msg.textContent =
          "Could not load empire data — open this site over HTTP (not file://) or check that data/empires.json exists.";
        msg.classList.remove("is-done");
      }
    });
})();
