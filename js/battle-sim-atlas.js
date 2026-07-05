/**
 * TexturePacker-compatible sprite atlas loader + optional GPU-friendly draw hook.
 * Export from TexturePacker as “JSON (hash)”, same basename PNG next to JSON.
 * Expected frames (trim optional): infantry, archer, miner, tower — fallback draws vectors if missing.
 */
(function (global) {
  "use strict";

  var Atlas = {
    img: null,
    frames: {},
    meta: null,
    ready: false,
    sourcePath: ""
  };

  function stripExt(key) {
    return String(key).replace(/\.(png|jpg|jpeg|webp)$/i, "");
  }

  function normalizeFrames(json) {
    var out = {};
    var raw = json.frames || json;
    var keys = Object.keys(raw);
    var i = 0;
    for (; i < keys.length; i++) {
      var key = keys[i];
      var entry = raw[key];
      var fr = entry.frame || entry;
      if (!fr || fr.w == null) continue;
      var name = stripExt(key);
      out[name] = {
        x: fr.x,
        y: fr.y,
        w: fr.w,
        h: fr.h,
        rotated: !!entry.rotated,
        spriteSourceSize: entry.spriteSourceSize,
        sourceSize: entry.sourceSize
      };
    }
    return out;
  }

  Atlas.tryLoad = function (basePathWithoutExt) {
    Atlas.sourcePath = basePathWithoutExt || "";
    return fetch(basePathWithoutExt + ".json")
      .then(function (r) {
        if (!r.ok) throw new Error("atlas json");
        return r.json();
      })
      .then(function (json) {
        var meta = json.meta || {};
        var dir = basePathWithoutExt.indexOf("/") >= 0 ? basePathWithoutExt.replace(/[^/]+$/, "") : "";
        var imageName = meta.image || basePathWithoutExt.split("/").pop() + ".png";
        imageName = imageName.replace(/^.*\//, "");
        var imgUrl = dir + imageName;
        return new Promise(function (resolve, reject) {
          var img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = function () {
            Atlas.img = img;
            Atlas.frames = normalizeFrames(json);
            Atlas.meta = meta;
            Atlas.ready = Object.keys(Atlas.frames).length > 0;
            resolve(Atlas);
          };
          img.onerror = reject;
          img.src = imgUrl;
        });
      })
      .catch(function () {
        Atlas.ready = false;
        Atlas.img = null;
        Atlas.frames = {};
        return Atlas;
      });
  };

  /**
   * Draw a frame scaled to dw×dh. flipH mirrors horizontally.
   * @returns {boolean} true if drawn from atlas
   */
  Atlas.drawSprite = function (ctx, frameName, dx, dy, dw, dh, flipH) {
    if (!Atlas.ready || !Atlas.img || !Atlas.frames[frameName]) return false;
    var fr = Atlas.frames[frameName];
    var sw = fr.w;
    var sh = fr.h;
    ctx.save();
    if (flipH) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      dx = 0;
      dy = 0;
    }
    if (fr.rotated) {
      ctx.translate(dx + dw * 0.5, dy + dh * 0.5);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(Atlas.img, fr.x, fr.y, sw, sh, -dh * 0.5, -dw * 0.5, dh, dw);
    } else {
      ctx.drawImage(Atlas.img, fr.x, fr.y, sw, sh, dx, dy, dw, dh);
    }
    ctx.restore();
    return true;
  };

  Atlas.has = function (frameName) {
    return !!(Atlas.ready && Atlas.frames[frameName]);
  };

  global.BattleAtlas = Atlas;
})(typeof window !== "undefined" ? window : this);
