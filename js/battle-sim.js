/**
 * Lane RTS: simulation + rendering. Battle view runs on Phaser 3 (Canvas / CPU 2D renderer) when available —
 * drawing targets a CanvasTexture refreshed each frame; CDN failure falls back to a DOM canvas.
 */
(function () {
  "use strict";

  var RECIPES = {
    miner: { cost: 44, hp: 24, speed: 72, range: 0, dmg: 0, cd: 0, mineRate: 11 },
    swordsman: { cost: 76, hp: 62, speed: 88, range: 36, dmg: 13, cd: 0.72 },
    archer: { cost: 118, hp: 42, speed: 76, range: 138, dmg: 9, cd: 1.05 },
    tower: { cost: 195, hp: 210, speed: 0, range: 168, dmg: 16, cd: 0.95 }
  };

  var BASE_HP = 520;
  var PASSIVE_GOLD = 3.2;
  var PICKUP_INTERVAL_MIN = 14;
  var PICKUP_INTERVAL_MAX = 28;

  /** Famous polities first — matched to ids in data/empires.json */
  var CURATED_BATTLE_IDS = [
    "roman-empire",
    "carthaginian-empire",
    "byzantine-empire",
    "ottoman-empire",
    "british-empire",
    "french-empire-napoleonic",
    "russian-empire",
    "soviet-union",
    "peoples-republic-of-china",
    "mongol-empire",
    "sumer",
    "akkadian-empire"
  ];

  /** Rough historical foils for the “suggest rival” button (education vibe, not predictions). */
  var RIVAL_HINTS = {
    "roman-empire": "carthaginian-empire",
    "carthaginian-empire": "roman-empire",
    "byzantine-empire": "ottoman-empire",
    "ottoman-empire": "byzantine-empire",
    "british-empire": "french-empire-napoleonic",
    "french-empire-napoleonic": "british-empire",
    "russian-empire": "french-empire-napoleonic",
    "soviet-union": "british-empire",
    "peoples-republic-of-china": "british-empire",
    "mongol-empire": "russian-empire",
    sumer: "akkadian-empire",
    "akkadian-empire": "sumer"
  };

  var canvas = null;
  var ctx = null;
  var phaserCanvasTexRefresh = null;
  var phaserSceneRef = null;
  var phaserGameRef = null;
  var goldEl = document.getElementById("sim-gold");
  var incomeEl = document.getElementById("sim-income");
  var buffsEl = document.getElementById("sim-buffs");
  var overlayEl = document.getElementById("sim-overlay-msg");
  var diffSel = document.getElementById("sim-difficulty");
  var pauseBtn = document.getElementById("sim-pause");
  var restartBtn = document.getElementById("sim-restart");
  var upgradeBtn = document.getElementById("sim-upgrade-all");
  var selYou = document.getElementById("sim-empire-you");
  var selRival = document.getElementById("sim-empire-rival");
  var btnSuggest = document.getElementById("sim-suggest-rival");
  var readoutEl = document.getElementById("sim-matchup-readout");
  var perkTitleEl = document.getElementById("sim-perk-title");
  var perkTaglineEl = document.getElementById("sim-perk-tagline");
  var abilityBtn = document.getElementById("sim-empire-ability");
  var abilityCdEl = document.getElementById("sim-ability-cd");

  var empireCatalog = {};
  /** Loaded from data/battle-empire-perks.json — empire id → perk bundle */
  var perksById = {};

  var DEFAULT_PERK = {
    title: "Balanced staff college",
    tagline: "No doctrinal gimmicks — generic drills.",
    passive: {},
    active: null
  };

  var state = {
    gold: 130,
    entities: [],
    projectiles: [],
    pickups: [],
    paused: false,
    outcome: null,
    lastT: 0,
    pickupTimer: 10,
    playerForge: 0,
    enemyForge: 0,
    enemyBrainTimer: 0,
    enemyGold: 130,
    drumUntil: 0,
    baseHp: [BASE_HP, BASE_HP],
    enemyUpgradeTicker: 0,
    playerEmpire: null,
    rivalEmpire: null,
    vfx: [],
    playerTestudoUntil: 0,
    playerTestudoFactor: 0.68,
    playerTowerInfernoUntil: 0,
    playerTowerInfernoMult: 1,
    playerArcherVolleyUntil: 0,
    playerArcherVolleyMult: 1,
    playerBurstOutgoingUntil: 0,
    playerBurstOutgoingMult: 1,
    playerSteppeWindUntil: 0,
    playerSteppeWindMult: 1,
    playerStalinEcoUntil: 0,
    playerStalinEcoMult: 1,
    playerAbilityReadyAt: 0,
    playerTowerMarkdownGold: 0,
    freeSwordsmanCharges: 0,
    /** Comic hit-stop shake (pixels peak); damped every frame */
    screenShake: 0,
    /** Freeze simulation briefly on impacts (seconds remaining); uses real-time clock */
    hitStopSec: 0,
    /** Subtle zoom punch around battlefield pivot; eases back toward 1 */
    camZoom: 1
  };

  var W = 960;
  var H = 420;
  var groundY = 300;
  var quarry = [152, 0];

  function hexToRgb(hex) {
    var h = (hex || "#888888").replace("#", "");
    if (h.length === 3)
      h = h
        .split("")
        .map(function (c) {
          return c + c;
        })
        .join("");
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbStr(o, a) {
    if (a != null) return "rgba(" + o.r + "," + o.g + "," + o.b + "," + a + ")";
    return "rgb(" + o.r + "," + o.g + "," + o.b + ")";
  }

  function mix(a, b, t) {
    return {
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t)
    };
  }

  function lighten(rgb, f) {
    return mix(rgb, { r: 255, g: 255, b: 255 }, f);
  }

  function darken(rgb, f) {
    return mix(rgb, { r: 8, g: 10, b: 14 }, f);
  }

  function citadelKind(emp) {
    if (!emp) return "bastion";
    var id = emp.id;
    if (id === "sumer" || id === "akkadian-empire") return "ziggurat";
    if (id === "byzantine-empire") return "byzantine";
    if (id === "ottoman-empire") return "ottoman";
    if (id === "peoples-republic-of-china") return "gate_prc";
    if (id === "soviet-union") return "brutalist_star";
    if (id === "british-empire") return "neoclassical";
    if (id === "french-empire-napoleonic") return "triumph";
    if (id === "mongol-empire") return "steppe_fort";
    if (id === "roman-empire" || id === "carthaginian-empire") return "classical_block";
    var y = emp.startYear;
    if (y < 600) return "classical_block";
    if (y < 1500) return "medieval_curtain";
    if (y < 1918) return "bastion";
    return "modern_slabs";
  }

  function empireScienceMul(emp) {
    if (!emp || emp.science == null) return 1;
    var d = (emp.science - 65) / 200;
    if (d > 0.06) d = 0.06;
    if (d < -0.06) d = -0.06;
    return 1 + d;
  }

  function themeForEmpire(emp) {
    var base = hexToRgb(emp && emp.color ? emp.color : "#78909c");
    return {
      emp: emp,
      primary: base,
      trim: lighten(base, 0.35),
      dark: darken(base, 0.45),
      armor: mix(base, { r: 90, g: 96, b: 110 }, 0.55),
      stone: mix(base, { r: 58, g: 62, b: 72 }, 0.35),
      banner: lighten(base, 0.22),
      citadel: citadelKind(emp)
    };
  }

  function themeForSide(side) {
    var emp = side === 0 ? state.playerEmpire : state.rivalEmpire;
    return themeForEmpire(emp);
  }

  function getPerkForEmpire(emp) {
    if (!emp || !emp.id) return DEFAULT_PERK;
    var p = perksById[emp.id];
    if (!p) return DEFAULT_PERK;
    return {
      title: p.title || DEFAULT_PERK.title,
      tagline: p.tagline || "",
      passive: p.passive || {},
      active: p.active || null
    };
  }

  function refreshPerkUi() {
    var pk = getPerkForEmpire(state.playerEmpire);
    if (perkTitleEl) perkTitleEl.textContent = pk.title;
    if (perkTaglineEl)
      perkTaglineEl.textContent =
        pk.tagline + (pk.active ? " Use the signature doctrine button when it is ready." : "");
    if (abilityBtn) {
      abilityBtn.textContent = pk.active && pk.active.label ? pk.active.label : "No signature doctrine";
    }
  }

  function effectiveUpgradeCost() {
    var pk = getPerkForEmpire(state.playerEmpire).passive || {};
    return Math.ceil((140 + state.playerForge * 85) * (pk.forgeUpgradeCostMult || 1));
  }

  function effectiveCost(type, side) {
    var base = RECIPES[type].cost;
    var emp = side === 0 ? state.playerEmpire : state.rivalEmpire;
    var pk = getPerkForEmpire(emp).passive || {};
    if (type === "tower") base *= pk.towerCostMult || 1;
    if (type === "swordsman") base *= pk.swordsmanCostMult || 1;
    if (side === 0 && type === "tower" && state.playerTowerMarkdownGold > 0) {
      base = Math.max(28, base - state.playerTowerMarkdownGold);
    }
    return Math.max(0, Math.ceil(base));
  }

  function outgoingDamageModifier(from, now) {
    var m = 1;
    if (from.side !== 0) return m;
    if (now < state.playerBurstOutgoingUntil) m *= state.playerBurstOutgoingMult;
    if (from.type === "archer" && now < state.playerArcherVolleyUntil) m *= state.playerArcherVolleyMult;
    if (from.type === "tower" && now < state.playerTowerInfernoUntil) m *= state.playerTowerInfernoMult;
    return m;
  }

  function juiceBump(amt) {
    state.screenShake = Math.min(15, state.screenShake + amt);
    state.camZoom += Math.min(0.045, amt * 0.0055);
    if (state.camZoom > 1.075) state.camZoom = 1.075;
  }

  function requestHitStop(sec) {
    if (sec <= 0) return;
    state.hitStopSec = Math.min(0.135, state.hitStopSec + sec);
  }

  function spawnHitBurst(px, py, rgb, dealt, dirX) {
    while (state.vfx.length > 240) state.vfx.shift();
    var d = dealt == null ? 12 : dealt;
    requestHitStop(Math.min(0.078, 0.014 + Math.min(d, 90) * 0.001));
    state.vfx.push({
      kind: "shockRing",
      x: px,
      y: py,
      vx: 0,
      vy: 0,
      life: 0.26,
      maxLife: 0.26,
      r0: 5,
      dr: 130,
      rgb: rgb,
      width: 5.5
    });
    var n = Math.min(36, 11 + Math.floor(d * 0.62));
    var i = 0;
    for (; i < n; i++) {
      var ang = Math.random() * Math.PI * 2;
      if (dirX != null && typeof dirX === "number") {
        ang = (dirX >= 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 2.25;
      }
      var sp = 88 + Math.random() * 230;
      var ember = Math.random() < 0.44;
      var life = ember ? 0.52 + Math.random() * 0.42 : 0.32 + Math.random() * 0.24;
      state.vfx.push({
        kind: ember ? "ember" : "spark",
        x: px,
        y: py,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - (ember ? 25 : 52),
        life: life,
        maxLife: life,
        rgb: ember ? mix(rgb, { r: 255, g: 140, b: 55 }, 0.38) : rgb,
        sz: ember ? 4.5 : 3
      });
    }
  }

  function hurtUnit(target, rawDamage, attackerSide, now, sparkRgb) {
    if (!target || target.hp <= 0) return;
    var dmg = rawDamage;
    if (target.side === 0 && target.type === "swordsman" && attackerSide === 1 && now < state.playerTestudoUntil) {
      dmg *= state.playerTestudoFactor;
    }
    var mitig = target.type === "tower" ? 0.88 : 1;
    var dealt = dmg * mitig;
    target.hp -= dealt;
    juiceBump(Math.min(5.5, dealt * 0.15));
    var rgb = sparkRgb || { r: 255, g: 245, b: 215 };
    var hy = target.type === "tower" ? groundY - 4 - 52 : target.y - 30;
    var knock = attackerSide === 0 ? 1 : -1;
    spawnHitBurst(target.x, hy, rgb, dealt, knock);
  }

  function triggerPlayerAbility(now) {
    if (state.paused || state.outcome || now < state.playerAbilityReadyAt) return;
    var pk = getPerkForEmpire(state.playerEmpire);
    var ac = pk.active;
    if (!ac || !ac.effect) return;
    switch (ac.effect) {
      case "testudo":
        state.playerTestudoUntil = now + (ac.durationMs || 5000);
        state.playerTestudoFactor = ac.damageTakenMult != null ? ac.damageTakenMult : 0.68;
        break;
      case "subsidy":
        state.gold += ac.goldBonus != null ? ac.goldBonus : 78;
        break;
      case "greek_fire":
        state.playerTowerInfernoUntil = now + (ac.durationMs || 4800);
        state.playerTowerInfernoMult = ac.towerDamageMult != null ? ac.towerDamageMult : 1.46;
        break;
      case "timariot_levy":
        spawn("swordsman", 0);
        break;
      case "volley_fire":
        state.playerArcherVolleyUntil = now + (ac.durationMs || 6500);
        state.playerArcherVolleyMult = ac.archerDamageMult != null ? ac.archerDamageMult : 1.38;
        break;
      case "grand_battery":
        state.playerBurstOutgoingUntil = now + (ac.durationMs || 5200);
        state.playerBurstOutgoingMult = ac.allOutgoingDamageMult != null ? ac.allOutgoingDamageMult : 1.2;
        break;
      case "trace_heal":
        state.baseHp[0] = Math.min(BASE_HP, state.baseHp[0] + (ac.healBaseHp != null ? ac.healBaseHp : 58));
        break;
      case "planned_surge":
        state.playerStalinEcoUntil = now + (ac.durationMs || 9000);
        state.playerStalinEcoMult = ac.economyMult != null ? ac.economyMult : 2.15;
        break;
      case "peoples_mobilization":
        state.freeSwordsmanCharges += ac.freeSwordsmanCharges != null ? ac.freeSwordsmanCharges : 1;
        break;
      case "steppe_wind":
        state.playerSteppeWindUntil = now + (ac.durationMs || 5600);
        state.playerSteppeWindMult = ac.speedMult != null ? ac.speedMult : 1.29;
        break;
      case "monument_reprieve":
        state.playerTowerMarkdownGold = Math.max(state.playerTowerMarkdownGold, ac.towerMarkdownGold != null ? ac.towerMarkdownGold : 74);
        break;
      case "imperial_edict":
        state.playerBurstOutgoingUntil = now + (ac.durationMs || 5400);
        state.playerBurstOutgoingMult = ac.allOutgoingDamageMult != null ? ac.allOutgoingDamageMult : 1.26;
        break;
      default:
        return;
    }
    state.playerAbilityReadyAt = now + (ac.cooldownMs || 40000);
  }

  function resizeCanvas() {
    var wrap = document.querySelector(".battle-sim-canvas-wrap");
    if (!wrap) return;
    var rect = wrap.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var cw = Math.max(320, Math.floor(rect.width));
    var ch = Math.floor(Math.min(480, Math.max(300, rect.width * 0.46)));

    if (phaserSceneRef && phaserSceneRef.canvasTex) {
      var tex = phaserSceneRef.canvasTex;
      var tw = Math.floor(cw * dpr);
      var th = Math.floor(ch * dpr);
      if (typeof tex.setSize === "function") tex.setSize(tw, th);
      else {
        tex.canvas.width = tw;
        tex.canvas.height = th;
      }
      ctx = tex.context;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      if (typeof ctx.imageSmoothingQuality === "string") {
        ctx.imageSmoothingQuality = "medium";
      }
      W = cw;
      H = ch;
      groundY = H * 0.72;
      quarry[0] = Math.max(100, W * 0.16);
      quarry[1] = W - quarry[0];
      phaserSceneRef.battleImg.setDisplaySize(cw, ch);
      if (phaserGameRef && phaserGameRef.scale) {
        phaserGameRef.scale.resize(Math.floor(rect.width), Math.floor(rect.height));
      }
      tex.refresh();
      return;
    }

    if (!canvas || !ctx) return;

    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    canvas.style.width = cw + "px";
    canvas.style.height = ch + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    if (typeof ctx.imageSmoothingQuality === "string") {
      ctx.imageSmoothingQuality = "medium";
    }
    W = cw;
    H = ch;
    groundY = H * 0.72;
    quarry[0] = Math.max(100, W * 0.16);
    quarry[1] = W - quarry[0];
  }

  function forgeMul(side) {
    var f = side === 0 ? state.playerForge : state.enemyForge;
    return 1 + f * 0.14;
  }

  function applyRecipe(type, side) {
    var r = RECIPES[type];
    var m = forgeMul(side);
    var emp = side === 0 ? state.playerEmpire : state.rivalEmpire;
    var sm = empireScienceMul(emp);
    var pk = getPerkForEmpire(emp).passive || {};

    var hpMult = 1;
    var dmgMult = 1;
    var rngAdd = 0;
    var spdMult = 1;
    var mineMult = 1;

    if (type === "swordsman") {
      hpMult *= pk.infantryHpMult || 1;
      spdMult *= pk.infantrySpeedMult || 1;
    }
    if (type === "archer") {
      dmgMult *= pk.archerDmgMult || 1;
      rngAdd += pk.archerRangeBonus || 0;
      spdMult *= pk.archerSpeedMult || 1;
    }
    if (type === "tower") {
      hpMult *= pk.towerHpMult || 1;
      rngAdd += pk.towerRangeBonus || 0;
    }
    if (type !== "miner") {
      dmgMult *= pk.combatDamageMult || 1;
    }
    mineMult *= pk.minerYieldMult || 1;

    return {
      hp: Math.round(r.hp * m * sm * hpMult),
      maxHp: Math.round(r.hp * m * sm * hpMult),
      dmg: r.dmg * m * sm * dmgMult,
      range: r.range + rngAdd,
      speed: r.speed * spdMult,
      cd: r.cd,
      mineRate: (r.mineRate || 0) * mineMult
    };
  }

  function spawn(type, side) {
    var bx = side === 0 ? 56 : W - 56;
    var stats = applyRecipe(type, side);
    var ent = {
      type: type,
      side: side,
      x: bx + (side === 0 ? 28 : -28),
      y: groundY - 8 + (Math.random() - 0.5) * 8,
      hp: stats.hp,
      maxHp: stats.maxHp,
      dmg: stats.dmg,
      range: stats.range,
      speed: stats.speed,
      cd: stats.cd,
      atkT: 0,
      mineRate: stats.mineRate,
      vx: side === 0 ? 1 : -1,
      mining: false,
      quarryX: side === 0 ? quarry[0] : quarry[1],
      animSeed: Math.random() * Math.PI * 2
    };

    if (type === "tower") {
      var towersSameSide = 0;
      var i = 0;
      for (; i < state.entities.length; i++) {
        if (state.entities[i].side === side && state.entities[i].type === "tower") towersSameSide++;
      }
      var slot = side === 0 ? 95 + towersSameSide * 72 : W - 95 - towersSameSide * 72;
      ent.x = slot;
      ent.vx = 0;
      ent.y = groundY - 6;
    }

    state.entities.push(ent);
  }

  function enemyTrySpend() {
    var agg = parseFloat(diffSel.value) || 1.35;
    var eg = state.enemyGold;
    var miners = 0;
    var swords = 0;
    var arches = 0;
    var towers = 0;
    var i = 0;
    for (; i < state.entities.length; i++) {
      var e = state.entities[i];
      if (e.side !== 1) continue;
      if (e.type === "miner") miners++;
      if (e.type === "swordsman") swords++;
      if (e.type === "archer") arches++;
      if (e.type === "tower") towers++;
    }

    function buy(t) {
      var c = effectiveCost(t, 1);
      if (eg < c) return false;
      state.enemyGold -= c;
      spawn(t, 1);
      return true;
    }

    if (miners < 2 && buy("miner")) return;
    if (towers < 2 && arches + swords > 4 && Math.random() < 0.35 && buy("tower")) return;
    if (Math.random() < 0.55 && buy("swordsman")) return;
    buy("archer");
  }

  function combatTarget(from) {
    var bx = from.side === 0 ? W - 56 : 56;
    var baseD = Math.abs(bx - from.x);
    var best = null;
    var bestD = Infinity;
    var i = 0;
    for (; i < state.entities.length; i++) {
      var e = state.entities[i];
      if (e.side === from.side || e.hp <= 0) continue;
      var d = Math.abs(e.x - from.x);
      if (d <= from.range && d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (baseD <= from.range) {
      var bTarg = { isBase: true, x: bx, side: 1 - from.side };
      if (baseD < bestD) return bTarg;
    }
    return best;
  }

  function dealDamage(target, amount, attackerSide, sparkRgb) {
    var now = performance.now();
    var rgb = sparkRgb || { r: 255, g: 248, b: 228 };
    if (target && target.isBase) {
      state.baseHp[target.side] -= amount;
      juiceBump(Math.min(9, amount * 0.14));
      var waveDir = target.side === 0 ? -1 : 1;
      spawnHitBurst(target.x, groundY - 92, rgb, amount * 2.2, waveDir);
      return;
    }
    hurtUnit(target, amount, attackerSide, now, rgb);
  }

  function launchProjectile(from, toX, dmg) {
    var dir = toX >= from.x ? 1 : -1;
    var th = themeForSide(from.side);
    var tr = th.trim || { r: 200, g: 190, b: 175 };
    var now = performance.now();
    var out = outgoingDamageModifier(from, now);
    state.projectiles.push({
      x: from.x + dir * 14,
      y: from.y - 22,
      vx: dir * 340,
      dmg: dmg * out,
      side: from.side,
      ttl: 2.4,
      rgb: { r: tr.r, g: tr.g, b: tr.b },
      trail: [],
      trailAcc: 0
    });
  }

  function updateEntity(e, dt) {
    if (e.hp <= 0) return;

    if (e.type === "miner") {
      var qx = e.quarryX;
      if (!e.mining) {
        if (Math.abs(e.x - qx) > 10) {
          e.x += (qx > e.x ? 1 : -1) * e.speed * dt;
        } else {
          e.mining = true;
        }
      }
      if (e.mining && e.side === 0) {
        state.gold += e.mineRate * dt;
      }
      if (e.mining && e.side === 1) {
        state.enemyGold += e.mineRate * dt;
      }
      return;
    }

    var targ = combatTarget(e);

    if (targ) {
      e.atkT -= dt;
      if (e.atkT <= 0) {
        e.atkT = e.cd;
        var aimX = targ.isBase ? (e.side === 0 ? W - 56 : 56) : targ.x;
        if (e.type === "archer" || e.type === "tower") {
          launchProjectile(e, aimX, e.dmg * drumBonus(e.side));
        } else {
          var attRgb = themeForSide(e.side).trim;
          dealDamage(
            targ,
            e.dmg * drumBonus(e.side) * outgoingDamageModifier(e, performance.now()),
            e.side,
            attRgb
          );
        }
      }
      return;
    }

    var bxGoal = e.side === 0 ? W - 56 : 56;
    var march = bxGoal > e.x ? 1 : -1;
    var spdBoost = 1;
    if (e.side === 0 && performance.now() < state.playerSteppeWindUntil && e.type !== "tower" && e.type !== "miner") {
      spdBoost *= state.playerSteppeWindMult;
    }
    if (Math.abs(bxGoal - e.x) > 8) e.x += march * e.speed * spdBoost * dt;
  }

  function drumBonus(side) {
    if (side !== 0) return 1;
    var now = performance.now();
    if (now < state.drumUntil) return 1.42;
    return 1;
  }

  function updateProjectiles(dt, now) {
    var i = state.projectiles.length;
    while (i--) {
      var p = state.projectiles[i];
      p.trailAcc = (p.trailAcc || 0) + dt;
      while (p.trailAcc >= 0.014) {
        p.trailAcc -= 0.014;
        if (!p.trail) p.trail = [];
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 14) p.trail.shift();
      }
      p.x += p.vx * dt;
      p.ttl -= dt;
      var hit = false;
      var j = 0;
      for (; j < state.entities.length; j++) {
        var e = state.entities[j];
        if (e.side === p.side || e.hp <= 0) continue;
        if (Math.abs(e.x - p.x) < 22 && Math.abs(e.y - p.y) < 40) {
          hurtUnit(e, p.dmg, p.side, now, p.rgb);
          hit = true;
          break;
        }
      }
      if (!hit) {
        var bx = p.side === 0 ? W - 56 : 56;
        if (Math.abs(bx - p.x) < 28) {
          state.baseHp[1 - p.side] -= p.dmg * 0.85;
          juiceBump(5);
          spawnHitBurst(bx, groundY - 92, p.rgb, p.dmg * 2.4, p.vx >= 0 ? 1 : -1);
          hit = true;
        }
      }
      if (hit || p.ttl <= 0) {
        state.projectiles.splice(i, 1);
      }
    }
  }

  function pickupSpawn() {
    var kind = Math.random() < 0.55 ? "coffers" : "drum";
    state.pickups.push({
      kind: kind,
      x: W * (0.28 + Math.random() * 0.44),
      y: groundY - 4,
      bob: Math.random() * Math.PI * 2
    });
  }

  function updatePickups(dt, now) {
    var i = state.pickups.length;
    while (i--) {
      var pu = state.pickups[i];
      pu.bob += dt * 3;
      var collect = false;
      var j = 0;
      for (; j < state.entities.length; j++) {
        var e = state.entities[j];
        if (e.side !== 0 || e.hp <= 0 || e.type === "tower") continue;
        if (Math.abs(e.x - pu.x) < 26) collect = true;
      }
      if (collect) {
        if (pu.kind === "coffers") state.gold += 58;
        if (pu.kind === "drum") state.drumUntil = now + 7000;
        state.pickups.splice(i, 1);
      }
    }
  }

  function passiveIncome(dt) {
    var now = performance.now();
    var pp = getPerkForEmpire(state.playerEmpire).passive || {};
    var rp = getPerkForEmpire(state.rivalEmpire).passive || {};
    var pg = PASSIVE_GOLD * (pp.passiveGoldMult || 1);
    if (now < state.playerStalinEcoUntil) pg *= state.playerStalinEcoMult;
    state.gold += pg * dt;
    state.enemyGold += PASSIVE_GOLD * 0.92 * (rp.passiveGoldMult || 1) * dt;
  }

  function cullDead() {
    state.entities = state.entities.filter(function (e) {
      return e.hp > 0;
    });
  }

  function checkOutcome() {
    if (state.baseHp[0] <= 0) return "loss";
    if (state.baseHp[1] <= 0) return "win";
    return null;
  }

  function updateVfx(dt) {
    var i = state.vfx.length;
    while (i--) {
      var v = state.vfx[i];
      v.life -= dt;
      if (v.kind === "shockRing") {
        if (v.life <= 0) state.vfx.splice(i, 1);
        continue;
      }
      var grav = v.kind === "ember" ? 52 : 220;
      v.vy += grav * dt;
      v.x += v.vx * dt;
      v.y += v.vy * dt;
      if (v.kind === "ember") v.vx *= 0.987;
      if (v.life <= 0) state.vfx.splice(i, 1);
    }
  }

  function drawVfx() {
    var i = 0;
    for (; i < state.vfx.length; i++) {
      var v = state.vfx[i];
      if (v.kind === "shockRing") {
        var tr = 1 - v.life / v.maxLife;
        var rad = v.r0 + tr * v.dr;
        var aa = Math.max(0, v.life / v.maxLife);
        var lw = v.width * (1 - tr * 0.68);
        ctx.lineCap = "round";
        ctx.strokeStyle = rgbStr(v.rgb, 0.2 * aa);
        ctx.lineWidth = lw + 12;
        ctx.beginPath();
        ctx.arc(v.x, v.y, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = rgbStr(v.rgb, 0.38 * aa);
        ctx.lineWidth = lw + 4;
        ctx.beginPath();
        ctx.arc(v.x, v.y, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = rgbStr(v.rgb, 0.62 * aa);
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.arc(v.x, v.y, rad, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      var a = Math.max(0, v.life / v.maxLife);
      var sz = v.sz != null ? v.sz : 2.8;
      var halo = v.kind === "ember" ? 2.35 : 1.95;
      var prevComp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = a * 0.55;
      ctx.fillStyle = rgbStr(v.rgb);
      ctx.beginPath();
      ctx.arc(v.x, v.y, sz * halo, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(v.x, v.y, sz * 0.92, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = prevComp;
      ctx.globalAlpha = 1;
    }
  }

  function smoothstep01(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t * t * (3 - 2 * t);
  }

  function marchingBob(e, nowMs) {
    var march =
      e.type !== "miner" || !e.mining ? Math.sin(nowMs * 0.008 + (e.animSeed || 0)) * 2.2 : Math.sin(nowMs * 0.003 + (e.animSeed || 0)) * 1;
    return march;
  }

  function drawSkyAndGround(nowMs) {
    var ty = themeForEmpire(state.playerEmpire);
    var ry = themeForEmpire(state.rivalEmpire);
    var pulse = nowMs * 0.00035;

    var duel = ctx.createLinearGradient(0, 0, W, groundY + 50);
    duel.addColorStop(0, rgbStr(darken(ty.primary, 0.62)));
    duel.addColorStop(0.4, "#0f0718");
    duel.addColorStop(0.6, "#0f0718");
    duel.addColorStop(1, rgbStr(darken(ry.primary, 0.62)));
    ctx.fillStyle = duel;
    ctx.fillRect(0, 0, W, H);

    var beam = ctx.createLinearGradient(W * 0.5, 0, W * 0.5, groundY * 0.88);
    beam.addColorStop(0, rgbStr(lighten(mix(ty.primary, ry.primary, 0.5), 0.18), 0.28));
    beam.addColorStop(0.45, "rgba(255,255,255,0)");
    beam.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, W, groundY);

    ctx.strokeStyle = "rgba(255, 214, 140, 0.78)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-12, groundY - 8);
    ctx.lineTo(W + 12, groundY - 12);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.42)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-12, groundY - 2);
    ctx.lineTo(W + 12, groundY - 6);
    ctx.stroke();

    var hp = 0;
    for (; hp < 320; hp++) {
      var px = (hp * 71 + Math.floor(W * 0.03)) % W;
      var py = (hp * 51) % Math.floor(groundY * 0.62);
      var a = 0.09 + 0.07 * Math.sin(pulse + hp * 0.17);
      var tw = hp % 6 === 0 ? 3 : 2;
      ctx.fillStyle = "rgba(255,255,255," + a + ")";
      ctx.fillRect(px, py + 8, tw, hp % 9 === 0 ? 3 : 2);
    }

    ctx.fillStyle = "#141b26";
    ctx.fillRect(0, groundY - 12, W, H - groundY + 24);

    ctx.strokeStyle = "rgba(255,255,255,0.065)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    var gx = 0;
    for (; gx < W; gx += 34) {
      ctx.moveTo(gx + Math.sin(nowMs * 0.002 + gx * 0.01) * 4, groundY);
      ctx.lineTo(gx * 1.03 + 14, H + 24);
    }
    ctx.stroke();

    function drawQuarrySpot(cx, rgbBase) {
      ctx.fillStyle = rgbStr(lighten(rgbBase, 0.06), 0.58);
      ctx.beginPath();
      ctx.ellipse(cx, groundY + 5, 54, 19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#07090e";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = rgbStr(lighten(rgbBase, 0.58), 0.72);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = rgbStr(lighten(rgbBase, 0.42), 0.38);
      var r = 0;
      for (; r < 7; r++) {
        ctx.beginPath();
        ctx.moveTo(cx - 38 + r * 11, groundY + 1);
        ctx.lineTo(cx - 30 + r * 11, groundY + 15);
        ctx.stroke();
      }
      ctx.fillStyle = rgbStr(lighten(rgbBase, 0.42), 0.38);
      ctx.beginPath();
      ctx.arc(cx, groundY + 2, 12 + Math.sin(nowMs * 0.005 + cx) * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    drawQuarrySpot(quarry[0], ty.primary);
    drawQuarrySpot(quarry[1], ry.primary);
  }

  function drawBanner(ctx2, centerX, face, th, topY) {
    ctx2.save();
    ctx2.translate(centerX + face * 26, topY);
    ctx2.rotate(face * -0.18);
    var pole = ctx2.createLinearGradient(face * -3, -28, face * 4, 8);
    pole.addColorStop(0, "#6d695f");
    pole.addColorStop(1, "#3e3c38");
    ctx2.fillStyle = pole;
    ctx2.fillRect(face * -2, -36, face * 4, 42);

    var cloth = ctx2.createLinearGradient(0, -14, face * 20, 10);
    cloth.addColorStop(0, rgbStr(lighten(th.banner, 0.28)));
    cloth.addColorStop(0.55, rgbStr(th.banner));
    cloth.addColorStop(1, rgbStr(darken(th.banner, 0.22)));
    ctx2.fillStyle = cloth;
    ctx2.beginPath();
    ctx2.moveTo(face * 2, -18);
    ctx2.lineTo(face * 26, -22);
    ctx2.quadraticCurveTo(face * 30, 0, face * 22, 12);
    ctx2.lineTo(face * 4, 10);
    ctx2.quadraticCurveTo(face * -2, -2, face * 2, -18);
    ctx2.closePath();
    ctx2.fill();

    ctx2.strokeStyle = rgbStr(lighten(th.primary, 0.55));
    ctx2.lineWidth = 1.5;
    ctx2.stroke();

    ctx2.strokeStyle = "rgba(201, 169, 98, 0.5)";
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    ctx2.moveTo(face * 8, -14);
    ctx2.lineTo(face * 18, 0);
    ctx2.stroke();

    ctx2.restore();
  }

  function drawHpBar(cx, top, frac, goodCol) {
    ctx.fillStyle = "#07090e";
    ctx.fillRect(cx - 22, top - 2, 44, 11);
    ctx.strokeStyle = "rgba(255,255,255,0.38)";
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 22, top - 2, 44, 11);
    ctx.fillStyle = frac > 0.35 ? goodCol : "#ff5c6c";
    ctx.fillRect(cx - 19, top + 1, 38 * frac, 5);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(cx - 18, top + 1, Math.max(0, 36 * frac - 0.5), 2);
  }

  function drawSoldierFigure(e, nowMs) {
    var face = e.side === 0 ? 1 : -1;
    var th = themeForSide(e.side);
    var bob = marchingBob(e, nowMs);
    var y = e.y + bob;
    var phase = (e.animSeed || 0) + nowMs * 0.008;
    var stride = Math.sin(phase);
    var atkWind = e.cd > 0 ? smoothstep01(Math.max(0, 1 - e.atkT / e.cd)) : 0;

    var ink = "#07090e";
    var glow = rgbStr(lighten(th.primary, 0.32));
    var cloth = rgbStr(th.primary);
    var trim = rgbStr(lighten(th.primary, 0.48));

    ctx.save();
    ctx.translate(e.x, y);
    ctx.scale(face, 1);

    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(0, 18, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(stride * 3, bob * 0.12);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    function limb(x0, y0, x1, y1, wOuter, wInner, innerCol) {
      ctx.strokeStyle = ink;
      ctx.lineWidth = wOuter + 4;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.strokeStyle = glow;
      ctx.globalAlpha = 0.44;
      ctx.lineWidth = wInner + 9;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = innerCol;
      ctx.lineWidth = wInner;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    var hipY = 8;
    var spineTop = -26;

    if (e.type === "miner") {
      var dig = e.mining ? 1 : 0;
      var lean = 10 * dig;
      limb(0, spineTop + lean * 0.35, 0, hipY, 5, 5, cloth);
      limb(0, hipY, -11 + stride * 9, 22, 5, 5, cloth);
      limb(0, hipY, 11 - stride * 9, 22, 5, 5, cloth);
      limb(-2, spineTop + lean * 0.35 + 6, -18 - stride * 4, 6 + lean * 0.4, 4, 4, cloth);
      var ax = 22;
      var ay = -40 + dig * 14 + stride * 4;
      limb(2, spineTop + lean * 0.35 + 6, ax, ay, 4, 4, cloth);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(ax + 6, ay - 8);
      ctx.lineTo(ax + 22, ay - 18 - dig * 6);
      ctx.stroke();
      ctx.strokeStyle = "#cfd6e6";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = rgbStr(lighten(th.stone, 0.12));
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ax + 26, ay - 6 + dig * 4, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (e.type === "archer") {
      limb(0, spineTop, 0, hipY, 5, 5, cloth);
      limb(0, hipY, -11 + stride * 10, 22, 5, 5, cloth);
      limb(0, hipY, 11 - stride * 10, 22, 5, 5, cloth);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(16, -28, 24, -2.05, -0.72);
      ctx.stroke();
      ctx.strokeStyle = trim;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-14 - atkWind * 16, -30);
      ctx.quadraticCurveTo(14, -14, 40, -32);
      ctx.stroke();
      limb(-2, spineTop + 6, -16 - atkWind * 10, -26, 4, 4, cloth);
      limb(2, spineTop + 6, 20, -30, 4, 4, cloth);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-8 - atkWind * 14, -28);
      ctx.lineTo(36, -34);
      ctx.stroke();
    } else {
      limb(0, spineTop, 0, hipY, 5, 5, cloth);
      limb(0, hipY, -11 + stride * 10, 22, 5, 5, cloth);
      limb(0, hipY, 11 - stride * 10, 22, 5, 5, cloth);
      var sx = -34 - atkWind * 22;
      ctx.fillStyle = cloth;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sx, -18);
      ctx.lineTo(sx + 16, -18);
      ctx.lineTo(sx + 18, 12);
      ctx.lineTo(sx - 4, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = trim;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 3, -12, 8, 18);
      limb(2, spineTop + 6, 14, -18, 4, 4, cloth);
      var sw = atkWind * 20;
      limb(-2, spineTop + 6, -12 - sw * 0.3, 4 + sw * 0.15, 4, 4, cloth);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(24, -22 + sw * 0.2);
      ctx.lineTo(54 + sw * 0.4, -38 + sw * 0.35);
      ctx.stroke();
      ctx.strokeStyle = "#eef2fa";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(0, -44, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#f6dcc9";
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -44, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(-5, -46, 2.2, 0, Math.PI * 2);
    ctx.arc(5, -46, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = trim;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -44, 15, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();

    ctx.restore();

    drawHpBar(e.x, y - 62, e.hp / e.maxHp, rgbStr(lighten(th.primary, 0.38)));
  }

  function drawTowerFigure(e, nowMs) {
    var th = themeForSide(e.side);
    var x = e.x;
    var y = groundY - 4;
    var face = e.side === 0 ? 1 : -1;
    var ink = "#07090e";
    var glow = rgbStr(lighten(th.primary, 0.35));
    var cloth = rgbStr(th.primary);
    var trim = rgbStr(lighten(th.primary, 0.5));
    var pulse = 0.55 + 0.45 * Math.sin(nowMs * 0.007 + x * 0.09);
    var bh = 94;
    var bw = 46;

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(0,0,0,0.36)";
    ctx.beginPath();
    ctx.ellipse(0, 10, 30, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.scale(face, 1);

    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(-bw / 2 - 6, -bh - 6, bw + 12, bh + 12);
    ctx.globalAlpha = 1;
    ctx.fillStyle = cloth;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.rect(-bw / 2, -bh, bw, bh);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = ink;
    ctx.lineWidth = 5;
    var mx = -bw / 2 + 6;
    for (; mx < bw / 2 - 4; mx += 14) {
      ctx.strokeRect(mx, -bh - 16, 12, 16);
    }

    ctx.strokeStyle = ink;
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(16, -52);
    ctx.lineTo(54 + pulse * 10, -56 - pulse * 4);
    ctx.stroke();
    ctx.strokeStyle = trim;
    ctx.lineWidth = 4;
    ctx.stroke();

    function tinyStick(px, py) {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - 20);
      ctx.stroke();
      ctx.fillStyle = "#f6dcc9";
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py - 26, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    tinyStick(-14, -bh + 6);
    tinyStick(6, -bh + 10);

    ctx.restore();

    drawHpBar(e.x, y - bh - 38, e.hp / e.maxHp, rgbStr(lighten(th.primary, 0.4)));
  }

  function drawCitadel(side, hpFrac, nowMs) {
    var emp = side === 0 ? state.playerEmpire : state.rivalEmpire;
    var th = themeForEmpire(emp);
    var x = side === 0 ? 42 : W - 42;
    var baseY = groundY - 4;
    var face = side === 0 ? 1 : -1;
    var flick = 0.55 + 0.45 * Math.sin(nowMs * 0.007 + side * 2.1);
    ctx.save();

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.ellipse(x, baseY + 16, 64, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    function bodyRect(h) {
      var wall = ctx.createLinearGradient(x - face * 36, baseY - h, x + face * 36, baseY);
      wall.addColorStop(0, rgbStr(darken(th.stone, 0.28)));
      wall.addColorStop(0.4, rgbStr(th.stone));
      wall.addColorStop(1, rgbStr(lighten(th.stone, 0.18)));
      ctx.fillStyle = wall;
      ctx.fillRect(x - face * 36, baseY - h, face * 72, h);
      ctx.strokeStyle = rgbStr(darken(th.stone, 0.55));
      ctx.lineWidth = 1;
      ctx.strokeRect(x - face * 36, baseY - h, face * 72, h);
      var ly = baseY - h + 8;
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      for (; ly < baseY - 4; ly += 14) {
        ctx.beginPath();
        ctx.moveTo(x - face * 34, ly);
        ctx.lineTo(x + face * 34, ly);
        ctx.stroke();
      }
    }

    var k = th.citadel;
    if (k === "ziggurat") {
      bodyRect(44);
      ctx.fillStyle = rgbStr(darken(th.stone, 0.15));
      ctx.fillRect(x - face * 30, baseY - 72, face * 60, 28);
      ctx.fillRect(x - face * 22, baseY - 96, face * 44, 24);
      ctx.fillRect(x - face * 14, baseY - 114, face * 28, 18);
    } else if (k === "byzantine") {
      bodyRect(62);
      ctx.fillStyle = rgbStr(lighten(th.primary, 0.25));
      ctx.beginPath();
      ctx.arc(x, baseY - 78, 26, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - face * 10, baseY - 78, face * 20, 18);
    } else if (k === "ottoman") {
      bodyRect(58);
      ctx.fillStyle = rgbStr(lighten(th.primary, 0.2));
      ctx.beginPath();
      ctx.arc(x - face * 12, baseY - 76, 14, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgbStr(darken(th.stone, 0.2));
      ctx.fillRect(x - face * 6, baseY - 110, face * 12, 44);
    } else if (k === "gate_prc") {
      bodyRect(54);
      ctx.fillStyle = rgbStr(darken(th.primary, 0.35));
      ctx.fillRect(x - face * 34, baseY - 100, face * 68, 46);
      ctx.fillStyle = rgbStr(lighten(th.primary, 0.45));
      ctx.fillRect(x - face * 14, baseY - 88, face * 28, 34);
    } else if (k === "brutalist_star") {
      bodyRect(68);
      ctx.fillStyle = rgbStr(darken(th.stone, 0.25));
      ctx.fillRect(x - face * 28, baseY - 108, face * 56, 40);
      ctx.fillStyle = rgbStr(th.trim);
      ctx.font = "bold 22px serif";
      ctx.textAlign = "center";
      ctx.fillText("★", x, baseY - 84);
    } else if (k === "neoclassical") {
      bodyRect(56);
      ctx.fillStyle = rgbStr(lighten(th.stone, 0.08));
      ctx.fillRect(x - face * 32, baseY - 102, face * 64, 26);
      var col = -24;
      for (; col <= 24; col += 24) {
        ctx.fillRect(x + face * col - 5, baseY - 54, face * 10, 54);
      }
    } else if (k === "triumph") {
      bodyRect(50);
      ctx.fillStyle = rgbStr(lighten(th.stone, 0.06));
      ctx.beginPath();
      ctx.moveTo(x, baseY - 118);
      ctx.lineTo(x + face * 38, baseY - 46);
      ctx.lineTo(x - face * 38, baseY - 46);
      ctx.closePath();
      ctx.fill();
    } else if (k === "steppe_fort") {
      bodyRect(48);
      ctx.fillStyle = rgbStr(darken(th.stone, 0.3));
      ctx.beginPath();
      ctx.arc(x, baseY - 68, 34, Math.PI, Math.PI * 2);
      ctx.lineTo(x + face * 34, baseY - 34);
      ctx.lineTo(x - face * 34, baseY - 34);
      ctx.closePath();
      ctx.fill();
    } else if (k === "classical_block") {
      bodyRect(52);
      ctx.fillStyle = rgbStr(lighten(th.stone, 0.1));
      ctx.fillRect(x - face * 34, baseY - 106, face * 68, 28);
      ctx.strokeStyle = rgbStr(th.trim);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - face * 34, baseY - 106);
      ctx.lineTo(x, baseY - 124);
      ctx.lineTo(x + face * 34, baseY - 106);
      ctx.stroke();
      var cx = -20;
      for (; cx <= 20; cx += 20) {
        ctx.fillRect(x + face * cx - 4, baseY - 98, face * 8, 56);
      }
    } else if (k === "medieval_curtain") {
      bodyRect(56);
      var bx = -32;
      for (; bx <= 32; bx += 16) {
        ctx.fillStyle = rgbStr(darken(th.stone, 0.12));
        ctx.fillRect(x + face * bx - 8, baseY - 110, face * 16, 14);
      }
    } else if (k === "modern_slabs") {
      ctx.fillStyle = rgbStr(th.stone);
      ctx.fillRect(x - face * 32, baseY - 96, face * 64, 94);
      ctx.fillStyle = rgbStr(darken(th.stone, 0.35));
      ctx.fillRect(x - face * 14, baseY - 112, face * 28, 18);
    } else {
      bodyRect(56);
      ctx.fillStyle = rgbStr(darken(th.stone, 0.25));
      ctx.beginPath();
      ctx.moveTo(x - face * 40, baseY - 56);
      ctx.lineTo(x - face * 52, baseY - 96);
      ctx.lineTo(x + face * 52, baseY - 96);
      ctx.lineTo(x + face * 40, baseY - 56);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "#0c0e12";
    ctx.fillRect(x - face * 36, baseY - 24, face * 72, 12);
    ctx.strokeStyle = "rgba(201, 169, 98, 0.35)";
    ctx.strokeRect(x - face * 36, baseY - 24, face * 72, 12);

    ctx.fillStyle = hpFrac > 0.35 ? "#d4b872" : "#b34444";
    ctx.fillRect(x - face * 34, baseY - 21, face * 68 * hpFrac, 6);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(x - face * 33, baseY - 21, face * 66 * hpFrac, 2);

    ctx.fillStyle = "rgba(255, 214, 170, " + (0.09 * flick) + ")";
    ctx.fillRect(x - 22, baseY - 56, 11, 13);
    ctx.fillRect(x + 11, baseY - 72, 11, 13);

    ctx.restore();
  }

  function drawPickup(pu, nowMs) {
    var bob = Math.sin(pu.bob) * 6;
    var x = pu.x;
    var y = pu.y - 36 + bob;
    var spin = nowMs * 0.0026;
    var colA = pu.kind === "coffers" ? "#ffe566" : "#ff7eb3";
    var colB = pu.kind === "coffers" ? "#f5a623" : "#e84870";
    var ink = "#07090e";

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);

    ctx.fillStyle = colA;
    ctx.globalAlpha = 0.42;
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.lineTo(23, 0);
    ctx.lineTo(0, 26);
    ctx.lineTo(-23, 0);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = colA;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(18, 0);
    ctx.lineTo(0, 20);
    ctx.lineTo(-18, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = colB;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(10, 0);
    ctx.lineTo(0, 12);
    ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = ink;
    ctx.font = "bold 14px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pu.kind === "coffers" ? "¤" : "♪", 0, 1);

    ctx.restore();
  }

  function drawProj(p, nowMs) {
    var dir = p.vx >= 0 ? 1 : -1;
    var rgb = p.rgb || { r: 240, g: 220, b: 190 };
    var col = rgbStr(rgb);
    var ink = "#07090e";

    if (p.trail && p.trail.length > 1) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      var ti = 0;
      for (; ti < p.trail.length - 1; ti++) {
        var segA = ((ti + 1) / p.trail.length) * 0.55;
        ctx.strokeStyle = rgbStr(rgb, segA);
        ctx.lineWidth = 4 + (ti / p.trail.length) * 4;
        ctx.beginPath();
        ctx.moveTo(p.trail[ti].x, p.trail[ti].y);
        ctx.lineTo(p.trail[ti + 1].x, p.trail[ti + 1].y);
        ctx.stroke();
      }
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(dir === 1 ? 0 : Math.PI);

    ctx.strokeStyle = ink;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.38;
    ctx.beginPath();
    ctx.moveTo(-38, 0);
    ctx.lineTo(-8, 0);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.lineTo(24, 0);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.lineTo(24, 0);
    ctx.stroke();

    ctx.fillStyle = "#fffaf2";
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(11, -6);
    ctx.lineTo(11, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(-10 + Math.sin(nowMs * 0.08) * 3, 0, 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function render(nowMs) {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    var pivotY = groundY * 0.52;
    ctx.translate(W * 0.5, pivotY);
    ctx.scale(state.camZoom, state.camZoom);
    ctx.translate(-W * 0.5, -pivotY);

    var sk = state.screenShake;
    if (sk > 0.03) {
      ctx.translate(Math.sin(nowMs * 0.083) * sk * 3.2, Math.cos(nowMs * 0.071) * sk * 2.9);
    }

    drawSkyAndGround(nowMs);
    var hp0 = Math.max(0, state.baseHp[0] / BASE_HP);
    var hp1 = Math.max(0, state.baseHp[1] / BASE_HP);
    drawCitadel(0, hp0, nowMs);
    drawCitadel(1, hp1, nowMs);

    var i = 0;
    for (; i < state.pickups.length; i++) drawPickup(state.pickups[i], nowMs);

    state.entities.sort(function (a, b) {
      return a.y - b.y;
    });
    for (i = 0; i < state.entities.length; i++) {
      var ent = state.entities[i];
      if (ent.type === "tower") drawTowerFigure(ent, nowMs);
      else drawSoldierFigure(ent, nowMs);
    }

    for (i = 0; i < state.projectiles.length; i++) drawProj(state.projectiles[i], nowMs);

    drawVfx();

    ctx.restore();

    if (phaserCanvasTexRefresh) phaserCanvasTexRefresh();
  }

  function frame(now) {
    if (!state.lastT) state.lastT = now;
    var dtReal = Math.min(0.05, (now - state.lastT) / 1000);
    state.lastT = now;

    var dtSim = dtReal;
    if (state.hitStopSec > 0) {
      state.hitStopSec -= dtReal;
      if (state.hitStopSec < 0) state.hitStopSec = 0;
      if (state.hitStopSec > 0) dtSim = 0;
    }

    state.camZoom += (1 - state.camZoom) * Math.min(1, dtReal * 10);

    if (!state.paused && !state.outcome) {
      passiveIncome(dtSim);
      state.pickupTimer -= dtSim;
      if (state.pickupTimer <= 0) {
        pickupSpawn();
        state.pickupTimer = PICKUP_INTERVAL_MIN + Math.random() * (PICKUP_INTERVAL_MAX - PICKUP_INTERVAL_MIN);
      }

      state.enemyBrainTimer -= dtSim;
      if (state.enemyBrainTimer <= 0) {
        enemyTrySpend();
        state.enemyBrainTimer = 1.1 / (parseFloat(diffSel.value) || 1.35);
      }

      state.enemyUpgradeTicker += dtSim;
      if (state.enemyUpgradeTicker > 55 && state.enemyForge < 5 && state.enemyGold >= 160) {
        state.enemyUpgradeTicker = 0;
        state.enemyGold -= 130;
        state.enemyForge++;
        var ku = 0;
        for (; ku < state.entities.length; ku++) {
          var ee = state.entities[ku];
          if (ee.side !== 1) continue;
          var stE = applyRecipe(ee.type, 1);
          var ratioE = ee.hp / ee.maxHp;
          ee.maxHp = stE.hp;
          ee.hp = Math.max(1, stE.hp * ratioE);
          ee.dmg = stE.dmg;
        }
      }

      var ei = 0;
      for (; ei < state.entities.length; ei++) updateEntity(state.entities[ei], dtSim);
      updateProjectiles(dtSim, now);
      updatePickups(dtSim, now);
      cullDead();
      state.outcome = checkOutcome();
    }

    updateVfx(dtSim);

    state.screenShake *= Math.exp(-dtSim * 13);
    if (state.screenShake < 0.035) state.screenShake = 0;

    render(now);
    updateHud(now);
    requestAnimationFrame(frame);
  }

  function minerIncomePreview() {
    var now = performance.now();
    var pp = getPerkForEmpire(state.playerEmpire).passive || {};
    var passivePart = PASSIVE_GOLD * (pp.passiveGoldMult || 1);
    if (now < state.playerStalinEcoUntil) passivePart *= state.playerStalinEcoMult;
    var quarrySum = 0;
    var i = 0;
    for (; i < state.entities.length; i++) {
      var e = state.entities[i];
      if (e.side === 0 && e.type === "miner" && e.mining && e.hp > 0) quarrySum += e.mineRate;
    }
    return passivePart + quarrySum;
  }

  function updateHud(now) {
    goldEl.textContent = Math.floor(state.gold);
    incomeEl.textContent = "+" + minerIncomePreview().toFixed(1);

    buffsEl.innerHTML = "";
    function pushBuff(label) {
      var s = document.createElement("span");
      s.className = "battle-sim-buff-tag";
      s.textContent = label;
      buffsEl.appendChild(s);
    }

    if (now < state.drumUntil) pushBuff("Battle fervor · volleys bite harder");
    if (now < state.playerTestudoUntil) pushBuff("Testudo brace · infantry endure");
    if (now < state.playerTowerInfernoUntil) pushBuff("Greek fire · batteries sear");
    if (now < state.playerArcherVolleyUntil) pushBuff("Volley cadence · bows sting");
    if (now < state.playerBurstOutgoingUntil) pushBuff("Massed fire · all arms up");
    if (now < state.playerSteppeWindUntil) pushBuff("Steppe wind · march surge");
    if (now < state.playerStalinEcoUntil) pushBuff("Planned economy · tribute spike");
    if (state.playerTowerMarkdownGold > 0) pushBuff("Temple stipend · battery rebate");
    if (state.freeSwordsmanCharges > 0)
      pushBuff("Mobilization · " + state.freeSwordsmanCharges + " levy token(s)");

    var uc = effectiveUpgradeCost();
    var ucLab = document.getElementById("sim-upgrade-cost-label");
    if (ucLab) ucLab.textContent = "(" + uc + " g)";

    var buys = document.querySelectorAll(".battle-sim-buy[data-buy]");
    var bi = 0;
    for (; bi < buys.length; bi++) {
      var btn = buys[bi];
      var t = btn.getAttribute("data-buy");
      var cost = effectiveCost(t, 0);
      btn.disabled = state.gold < cost || !!state.outcome;
    }
    upgradeBtn.disabled = state.gold < uc || state.playerForge >= 6 || !!state.outcome;

    var pkAb = getPerkForEmpire(state.playerEmpire);
    if (abilityBtn) {
      abilityBtn.disabled = !pkAb.active || !!state.outcome || state.paused;
    }
    if (abilityCdEl) {
      if (!pkAb.active || state.outcome) abilityCdEl.textContent = "";
      else if (now >= state.playerAbilityReadyAt) abilityCdEl.textContent = "Ready";
      else abilityCdEl.textContent = "Cooldown · " + Math.ceil((state.playerAbilityReadyAt - now) / 1000) + "s";
    }

    var py = state.playerEmpire && state.playerEmpire.name ? state.playerEmpire.name : "Your coalition";
    var rv = state.rivalEmpire && state.rivalEmpire.name ? state.rivalEmpire.name : "Rival capital";

    if (state.outcome === "win") {
      overlayEl.textContent = py + " — citadel stormed. The rival seat (" + rv + ") yields (abstract win).";
      overlayEl.classList.remove("is-hidden");
      overlayEl.hidden = false;
    } else if (state.outcome === "loss") {
      overlayEl.textContent = rv + " breaks your camp — rally fresh levies and reopen the quarry.";
      overlayEl.classList.remove("is-hidden");
      overlayEl.hidden = false;
    } else {
      overlayEl.classList.add("is-hidden");
      overlayEl.hidden = true;
    }
  }

  function wireCosts() {
    var nodes = document.querySelectorAll("[data-cost-for]");
    var i = 0;
    for (; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-cost-for");
      nodes[i].textContent = "(" + effectiveCost(key, 0) + " g)";
    }
  }

  function syncEmpiresFromUi() {
    if (!selYou || !selRival) return;
    var idA = selYou.value;
    var idB = selRival.value;
    state.playerEmpire = empireCatalog[idA] || state.playerEmpire;
    state.rivalEmpire = empireCatalog[idB] || state.rivalEmpire;
    updateMatchupReadout();
    wireCosts();
    refreshPerkUi();
  }

  function updateMatchupReadout() {
    var a = state.playerEmpire;
    var b = state.rivalEmpire;
    if (!a || !b) return;
    var da = a.description ? a.description.slice(0, 160) + (a.description.length > 160 ? "…" : "") : "";
    readoutEl.innerHTML =
      "<strong>" +
      a.name +
      "</strong> (" +
      a.startYear +
      "–" +
      a.endYear +
      ") vs <strong>" +
      b.name +
      "</strong> (" +
      b.startYear +
      "–" +
      b.endYear +
      "). <span class=\"battle-sim-readout-muted\">" +
      da +
      "</span>";
  }

  function resetGame() {
    state.gold = 130;
    state.enemyGold = 130;
    state.entities = [];
    state.projectiles = [];
    state.pickups = [];
    state.outcome = null;
    state.paused = false;
    state.pickupTimer = 8;
    state.playerForge = 0;
    state.enemyForge = 0;
    state.enemyBrainTimer = 0;
    state.drumUntil = 0;
    state.baseHp = [BASE_HP, BASE_HP];
    state.enemyUpgradeTicker = 0;
    state.playerTestudoUntil = 0;
    state.playerTowerInfernoUntil = 0;
    state.playerArcherVolleyUntil = 0;
    state.playerBurstOutgoingUntil = 0;
    state.playerSteppeWindUntil = 0;
    state.playerStalinEcoUntil = 0;
    state.playerAbilityReadyAt = 0;
    state.playerTowerMarkdownGold = 0;
    state.freeSwordsmanCharges = 0;
    state.screenShake = 0;
    state.hitStopSec = 0;
    state.camZoom = 1;
    if (pauseBtn) pauseBtn.textContent = "Pause";
    state.vfx = [];
    syncEmpiresFromUi();
    spawn("miner", 0);
    spawn("swordsman", 0);
    spawn("miner", 1);
    refreshPerkUi();
  }

  function fillEmpireSelect(sel, preferredId) {
    if (!sel) return;
    sel.innerHTML = "";
    var i = 0;
    for (; i < CURATED_BATTLE_IDS.length; i++) {
      var id = CURATED_BATTLE_IDS[i];
      var emp = empireCatalog[id];
      if (!emp) continue;
      var opt = document.createElement("option");
      opt.value = id;
      opt.textContent = emp.name;
      sel.appendChild(opt);
    }
    if (preferredId && empireCatalog[preferredId]) sel.value = preferredId;
  }

  var FALLBACK_EMPIRES = [
    {
      id: "roman-empire",
      name: "Roman Empire",
      region: "Mediterranean",
      startYear: -27,
      endYear: 476,
      color: "#F9A825",
      description: "Latin imperial state — roads, legions, law (placeholder blurb if JSON fails).",
      science: 80
    },
    {
      id: "carthaginian-empire",
      name: "Carthaginian Empire",
      region: "Mediterranean",
      startYear: -814,
      endYear: -146,
      color: "#FDD835",
      description: "Phoenician Mediterranean trading empire.",
      science: 60
    },
    {
      id: "byzantine-empire",
      name: "Byzantine Empire",
      region: "Mediterranean",
      startYear: 330,
      endYear: 1453,
      color: "#EF6C00",
      description: "Eastern Roman imperial continuity at Constantinople.",
      science: 75
    },
    {
      id: "ottoman-empire",
      name: "Ottoman Empire",
      region: "Middle East",
      startYear: 1299,
      endYear: 1922,
      color: "#00ACC1",
      description: "Turco-Islamic dynasty spanning three continents.",
      science: 75
    },
    {
      id: "british-empire",
      name: "British Empire",
      region: "Europe",
      startYear: 1583,
      endYear: 1997,
      color: "#303F9F",
      description: "Maritime-industrial empire with global reach.",
      science: 90
    },
    {
      id: "french-empire-napoleonic",
      name: "French Empire (Napoleonic)",
      region: "Europe",
      startYear: 1804,
      endYear: 1815,
      color: "#3949AB",
      description: "French revolutionary armies under Napoleon.",
      science: 80
    },
    {
      id: "russian-empire",
      name: "Russian Empire",
      region: "Eurasia",
      startYear: 1721,
      endYear: 1917,
      color: "#1A237E",
      description: "Romanov continental empire.",
      science: 70
    },
    {
      id: "soviet-union",
      name: "Soviet Union",
      region: "Eurasia",
      startYear: 1922,
      endYear: 1991,
      color: "#283593",
      description: "Soviet socialist federal state — WWII and Cold War.",
      science: 85
    },
    {
      id: "peoples-republic-of-china",
      name: "People's Republic of China",
      region: "East Asia",
      startYear: 1949,
      endYear: 2026,
      color: "#EF5350",
      description: "Modern Chinese socialist state.",
      science: 85
    },
    {
      id: "mongol-empire",
      name: "Mongol Empire",
      region: "Eurasia",
      startYear: 1206,
      endYear: 1368,
      color: "#A1887F",
      description: "Great Mongol khans — continental steppe hegemony.",
      science: 70
    },
    {
      id: "sumer",
      name: "Sumer",
      region: "Mesopotamia",
      startYear: -4500,
      endYear: -1900,
      color: "#00695C",
      description: "Early Mesopotamian city-states and literacy.",
      science: 40
    },
    {
      id: "akkadian-empire",
      name: "Akkadian Empire",
      region: "Mesopotamia",
      startYear: -2334,
      endYear: -2154,
      color: "#00796B",
      description: "Sargon's imperial unification of Mesopotamia.",
      science: 50
    }
  ];

  function mountLegacyCanvas() {
    var wrap = document.querySelector(".battle-sim-canvas-wrap");
    var root = document.getElementById("battle-phaser-root");
    if (root) root.style.display = "none";
    var c = document.createElement("canvas");
    c.id = "battle-canvas-fallback";
    c.setAttribute("aria-label", "Battlefield");
    wrap.insertBefore(c, wrap.firstChild);
    canvas = c;
    ctx = canvas.getContext("2d");
    phaserCanvasTexRefresh = null;
    phaserSceneRef = null;
    phaserGameRef = null;
  }

  function createPhaserBattle() {
    var wrap = document.querySelector(".battle-sim-canvas-wrap");
    var root = document.getElementById("battle-phaser-root");
    if (!wrap || !root || typeof Phaser === "undefined") return false;

    var SceneClass = Phaser.Class({
      Extends: Phaser.Scene,
      initialize: function BattleScene() {
        Phaser.Scene.call(this, { key: "battle" });
      },
      create: function () {
        phaserSceneRef = this;
        phaserGameRef = this.sys.game;
        this.canvasTex = this.textures.createCanvas("battleDynamic", 640, 480);
        ctx = this.canvasTex.context;
        canvas = this.canvasTex.canvas;
        phaserCanvasTexRefresh = function () {
          this.canvasTex.refresh();
        }.bind(this);

        var rw = Math.max(320, Math.floor(wrap.getBoundingClientRect().width));
        var rh = Math.floor(Math.min(480, Math.max(300, rw * 0.46)));
        this.scale.resize(rw, rh);

        this.battleImg = this.add.image(0, 0, "battleDynamic").setOrigin(0);
        resizeCanvas();
        resetGame();
        state.lastT = 0;
      },
      update: function (time) {
        frame(time);
      }
    });

    try {
      var gw = Math.max(320, Math.floor(wrap.getBoundingClientRect().width));
      var gh = Math.floor(Math.min(480, Math.max(300, gw * 0.46)));
      phaserGameRef = new Phaser.Game({
        type: Phaser.CANVAS,
        parent: "battle-phaser-root",
        width: gw,
        height: gh,
        transparent: true,
        banner: false,
        audio: { noAudio: true },
        roundPixels: true,
        render: {
          antialias: true
        },
        scene: SceneClass,
        scale: {
          mode: Phaser.Scale.NONE
        }
      });
      return true;
    } catch (err) {
      console.warn("Phaser battle boot failed:", err);
      phaserSceneRef = null;
      phaserGameRef = null;
      phaserCanvasTexRefresh = null;
      ctx = null;
      canvas = null;
      return false;
    }
  }

  function bootEmpires(list) {
    var use = list && list.length ? list : FALLBACK_EMPIRES;
    var i = 0;
    empireCatalog = {};
    for (; i < use.length; i++) {
      empireCatalog[use[i].id] = use[i];
    }
    if (selYou && selRival) {
      fillEmpireSelect(selYou, "roman-empire");
      fillEmpireSelect(selRival, "carthaginian-empire");
      selYou.value = "roman-empire";
      selRival.value = "carthaginian-empire";
      syncEmpiresFromUi();
    }

    if (document.getElementById("battle-phaser-root") && typeof Phaser !== "undefined" && createPhaserBattle()) {
      return;
    }

    mountLegacyCanvas();
    resizeCanvas();
    resetGame();
    requestAnimationFrame(frame);
  }

  document.querySelectorAll(".battle-sim-buy[data-buy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var t = btn.getAttribute("data-buy");
      if (state.outcome) return;
      if (t === "swordsman" && state.freeSwordsmanCharges > 0) {
        state.freeSwordsmanCharges--;
        spawn(t, 0);
        wireCosts();
        return;
      }
      var c = effectiveCost(t, 0);
      if (state.gold < c) return;
      state.gold -= c;
      spawn(t, 0);
      if (t === "tower") state.playerTowerMarkdownGold = 0;
      wireCosts();
    });
  });

  if (upgradeBtn) {
    upgradeBtn.addEventListener("click", function () {
      var uc = effectiveUpgradeCost();
      if (state.gold >= uc && state.playerForge < 6 && !state.outcome) {
        state.gold -= uc;
        state.playerForge++;
        var i = 0;
        for (; i < state.entities.length; i++) {
          var e = state.entities[i];
          if (e.side !== 0) continue;
          var st = applyRecipe(e.type, 0);
          var ratio = e.hp / e.maxHp;
          e.maxHp = st.hp;
          e.hp = Math.max(1, st.hp * ratio);
          e.dmg = st.dmg;
        }
      }
    });
  }

  if (pauseBtn) {
    pauseBtn.addEventListener("click", function () {
      if (state.outcome) return;
      state.paused = !state.paused;
      pauseBtn.textContent = state.paused ? "Resume" : "Pause";
      state.lastT = 0;
    });
  }

  if (abilityBtn) {
    abilityBtn.addEventListener("click", function () {
      triggerPlayerAbility(performance.now());
    });
  }

  if (restartBtn) {
    restartBtn.addEventListener("click", function () {
      resetGame();
      state.lastT = 0;
    });
  }

  if (selYou && selRival) {
    selYou.addEventListener("change", function () {
      syncEmpiresFromUi();
      resetGame();
      state.lastT = 0;
    });
    selRival.addEventListener("change", function () {
      syncEmpiresFromUi();
      resetGame();
      state.lastT = 0;
    });
  }

  if (btnSuggest && selYou && selRival) {
    btnSuggest.addEventListener("click", function () {
      var pid = selYou.value;
      var hint = RIVAL_HINTS[pid];
      if (hint && empireCatalog[hint]) selRival.value = hint;
      else {
        var j = 0;
        for (; j < CURATED_BATTLE_IDS.length; j++) {
          if (CURATED_BATTLE_IDS[j] !== pid) {
            selRival.value = CURATED_BATTLE_IDS[j];
            break;
          }
        }
      }
      syncEmpiresFromUi();
      resetGame();
      state.lastT = 0;
    });
  }

  window.addEventListener("resize", function () {
    resizeCanvas();
  });

  Promise.all([
    fetch("data/empires.json").then(function (r) {
      if (!r.ok) throw new Error("empires.json HTTP " + r.status);
      return r.json();
    }),
    fetch("data/battle-empire-perks.json").then(function (r) {
      return r.ok ? r.json() : {};
    })
  ])
    .then(function (pair) {
      var all = pair[0];
      perksById = pair[1] || {};
      if (!Array.isArray(all)) throw new Error("empires.json not an array");
      var picked = [];
      var map = {};
      var i = 0;
      for (; i < all.length; i++) map[all[i].id] = all[i];
      for (i = 0; i < CURATED_BATTLE_IDS.length; i++) {
        var id = CURATED_BATTLE_IDS[i];
        if (map[id]) picked.push(map[id]);
      }
      var roster = picked.length ? picked.slice() : all.slice(0, 12).slice();
      var j = 0;
      for (; j < CURATED_BATTLE_IDS.length; j++) {
        var cid = CURATED_BATTLE_IDS[j];
        var row = map[cid];
        if (!row) continue;
        var has = false;
        var k = 0;
        for (; k < roster.length; k++) {
          if (roster[k].id === cid) {
            has = true;
            break;
          }
        }
        if (!has) roster.push(row);
      }
      bootEmpires(roster);
    })
    .catch(function () {
      perksById = {};
      bootEmpires(FALLBACK_EMPIRES);
    });
})();
