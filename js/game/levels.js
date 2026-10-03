/* =====================================================================
   ASCII FPV · 闯关模式（多目标点）与关卡流程
   ---------------------------------------------------------------------
   关卡由种子确定性生成：起点选在低矮城区的路口，之后用随机游走串起
   一串「光环」，全部落在道路中心线上（因此不会被楼房堵死）。按顺序
   穿过所有光环即通关；撞机 / 超时失败，进度与最佳用时存本地。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, cfg = AFP.cfg, S = AFP.S, U = AFP.util, W = AFP.world;
  var PL = AFP.game.player, fsm = AFP.game.fsm, Sc = AFP.ui.screens;
  var P = AFP.render.pal, R = AFP.render.raster;
  function t(k, v) { return AFP.t(k, v); }

  var L = AFP.game.levels = AFP.game.levels || {};

  /* 关卡参数：startTop 起点邻域最高楼限制（前几关从低矮城区起飞），
     alt 光环高度区间，step 每次前进的街区数 */
  var DEFS = [
    { seed: 101, gates: 4, alt: [28, 62], r: 16, step: 2, time: 90, startTop: 55, name: 'level.1' },
    { seed: 202, gates: 6, alt: [30, 82], r: 15, step: 2, time: 110, startTop: 85, name: 'level.2' },
    { seed: 303, gates: 8, alt: [40, 112], r: 15, step: 2, time: 130, startTop: 120, name: 'level.3' },
    { seed: 404, gates: 8, alt: [24, 52], r: 14, step: 2, time: 100, startTop: 70, name: 'level.4' },
    { seed: 505, gates: 9, alt: [110, 190], r: 14, step: 2, time: 140, startTop: 999, name: 'level.5' },
    { seed: 606, gates: 11, alt: [42, 122], r: 12, step: 1, time: 150, startTop: 999, name: 'level.6' },
    { seed: 707, gates: 12, alt: [45, 150], r: 10, step: 2, time: 150, startTop: 999, name: 'level.7' },
    { seed: 808, gates: 14, alt: [50, 200], r: 11, step: 3, time: 180, startTop: 999, name: 'level.8' }
  ];
  L.defs = DEFS;
  L.count = function () { return DEFS.length; };

  /* ------------------------- 进度 ------------------------- */
  var progress = { cleared: 0, best: {} };
  L.load = function () {
    var p = AFP.store.get('progress', null);
    if (p && typeof p === 'object') {
      progress.cleared = U.clamp(p.cleared | 0, 0, DEFS.length);
      progress.best = p.best || {};
    }
    return progress;
  };
  L.load();
  L.progress = function () { return progress; };
  L.save = function () { AFP.store.set('progress', progress); };
  L.unlocked = function (i) { return i <= progress.cleared; };
  L.bestTime = function (i) { var b = progress.best[i]; return b === undefined ? null : b; };
  L.resetProgress = function () { progress = { cleared: 0, best: {} }; L.save(); };
  L.recordClear = function (i, time) {
    if (i + 1 > progress.cleared) progress.cleared = Math.min(i + 1, DEFS.length);
    var b = progress.best[i];
    var isRecord = (b === undefined || time < b);
    if (isRecord) progress.best[i] = Math.round(time * 100) / 100;
    L.save();
    return isRecord;                       // 供结算界面标注「新纪录」
  };
  L.progressText = function () {
    return t('menu.progress') + ' ' + progress.cleared + '/' + DEFS.length;
  };
  L.nextIndex = function () {
    for (var i = 0; i < DEFS.length; i++) if (L.bestTime(i) === null) return i;
    return null;
  };

  /* ------------------------- 关卡生成 ------------------------- */
  function blockTop(bx, bz) {
    var m = 0;
    for (var j = -1; j <= 1; j++) {
      for (var i = -1; i <= 1; i++) {
        var b = W.blockAt(bx + i, bz + j).buildings;
        for (var k = 0; k < b.length; k++) if (b[k].h > m) m = b[k].h;
      }
    }
    return m;
  }

  /* 找一个足够低矮的起飞街区（种子确定），避免第一关就被高楼围死 */
  function findStart(rnd, maxTop) {
    var bestI = 0, bestH = 1e9;
    var order = [];
    for (var i = 0; i < 400; i++) order.push(i);
    for (var n = order.length - 1; n > 0; n--) {          // 确定性洗牌
      var k = (rnd() * (n + 1)) | 0, tmp = order[n]; order[n] = order[k]; order[k] = tmp;
    }
    for (var o = 0; o < order.length; o++) {
      var idx = order[o];
      var bx = (idx % 20) - 10, bz = ((idx / 20) | 0) - 10;
      var h = blockTop(bx, bz);
      if (h <= maxTop) return { bx: bx, bz: bz, top: h };
      if (h < bestH) { bestH = h; bestI = idx; }
    }
    return { bx: (bestI % 20) - 10, bz: ((bestI / 20) | 0) - 10, top: bestH };
  }

  function build(i) {
    var def = DEFS[U.clamp(i, 0, DEFS.length - 1)];
    var rnd = U.mulberry32(def.seed * 7919 + 13);
    var start = findStart(rnd, def.startTop);
    var bx = start.bx, bz = start.bz;
    var dir = rnd() * Math.PI * 2;
    var alt = (def.alt[0] + def.alt[1]) * 0.5;
    var gates = [];
    for (var n = 0; n < def.gates; n++) {
      dir += (rnd() - 0.5) * 1.25;
      var step = 1 + ((rnd() * def.step) | 0);
      var nx = bx + Math.round(Math.cos(dir) * step);
      var nz = bz + Math.round(Math.sin(dir) * step);
      if (nx === bx && nz === bz) nx = bx + 1;
      bx = nx; bz = nz;
      alt = U.clamp(alt + (rnd() - 0.5) * (def.alt[1] - def.alt[0]) * 0.45, def.alt[0], def.alt[1]);
      /* 光环落在路口中心：道路走廊里不会被楼房堵住 */
      gates.push({
        x: bx * cfg.BLOCK + 8, y: Math.round(alt), z: bz * cfg.BLOCK + 8,
        r: def.r, i: n, block: { bx: bx, bz: bz }
      });
    }
    var g0 = gates[0];
    var sx = start.bx * cfg.BLOCK + 8, sz = start.bz * cfg.BLOCK + 8;
    var startPos = {
      x: sx, y: U.clamp(g0.y, 26, 70), z: sz,
      yaw: U.mod(Math.atan2(g0.x - sx, g0.z - sz) / cfg.DEG, 360),
      pitch: 0, roll: 0, spd: 26
    };
    return { index: i, def: def, start: startPos, gates: gates, startBlock: start };
  }

  var cache = {};
  L.build = function (i) {
    if (!cache[i]) cache[i] = build(i);
    return cache[i];
  };
  L.name = function (i) { return t(DEFS[U.clamp(i, 0, DEFS.length - 1)].name + '.name'); };
  L.desc = function (i) { return t(DEFS[U.clamp(i, 0, DEFS.length - 1)].name + '.desc'); };

  /* ------------------------- 流程 ------------------------- */
  var current = null;
  L.current = function () { return current; };

  L.start = function (i) {
    i = U.clamp(i | 0, 0, DEFS.length - 1);
    if (!L.unlocked(i)) i = Math.min(progress.cleared, DEFS.length - 1);
    current = L.build(i);
    current.newRecord = false;         // 每次重跑都重新判定新纪录
    S.mode = 'level';
    S.level = i;
    S.gates = current.gates;
    S.gateIndex = 0;
    S.raceTime = 0;
    S.raceDone = false;
    S.crashReason = 0;
    S.stats.gates = 0;
    S.countdown = 2.2;                 // 起飞倒计时，期间不推进物理
    PL.respawn(current.start);
    fsm.go('play');
    return current;
  };
  L.startPos = function () { return current ? current.start : cfg.START; };
  L.startNext = function () {
    var n = L.nextIndex();
    return L.start(n === null ? 0 : n);
  };

  /* 目标点判定：按顺序穿过光环。
     先判超时再判穿环：否则「冲过最后一个光环的同时超时」这一帧会既记
     通关（写下超限的最佳用时）又判失败，进度与画面自相矛盾。 */
  L.update = function () {
    if (S.raceDone || !current) return;
    if (current.def.time && S.raceTime > current.def.time) {
      S.crashReason = 4;                 // 超时
      S.crashed = 4;
      return;
    }
    var gt = current.gates[S.gateIndex];
    if (gt) {
      var dx = gt.x - S.camX, dy = gt.y - S.camY, dz = gt.z - S.camZ;
      if (dx * dx + dy * dy + dz * dz <= (gt.r + 2) * (gt.r + 2)) {
        S.gateIndex++;
        S.stats.gates++;
        if (S.gateIndex >= current.gates.length) {
          S.raceDone = true;
          current.newRecord = L.recordClear(current.index, S.raceTime);
        }
      }
    }
  };

  /* ------------------------- 光环绘制 ------------------------- */
  var M_CUR = P.makeMat([255, 190, 70], " ..::==*#%@");     // 当前目标：琥珀
  var M_NEXT = P.makeMat([70, 255, 158], " ..::==*#%@");    // 后续光环：青绿
  var M_DONE = P.makeMat([44, 96, 70], " ...::;;++");       // 已穿过：暗绿

  function ringAhead(i) {
    var c = current;
    if (!c) return 0;
    var a = c.gates[Math.max(0, i - 1)], b = c.gates[Math.min(c.gates.length - 1, i + 1)];
    return Math.atan2(b.x - a.x, b.z - a.z);
  }

  function drawRing(g, mat, bright, segs) {
    var ang = ringAhead(g.i);
    var sx = Math.cos(ang), sz = -Math.sin(ang);     // 环面水平方向
    var px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
    for (var k = 0; k < segs; k++) {
      var a0 = (k / segs) * Math.PI * 2, a1 = ((k + 1) / segs) * Math.PI * 2;
      var c0 = Math.cos(a0) * g.r, s0 = Math.sin(a0) * g.r;
      var c1 = Math.cos(a1) * g.r, s1 = Math.sin(a1) * g.r;
      px = g.x + sx * c0; py = g.y + s0; pz = g.z + sz * c0;
      qx = g.x + sx * c1; qy = g.y + s1; qz = g.z + sz * c1;
      R.drawLine3D(px, py, pz, qx, qy, qz, 0, mat, bright);
    }
  }

  L.draw = function () {
    if (S.mode !== 'level' || !current) return 0;
    var drawn = 0;
    var tgt = current.gates[S.gateIndex];
    var blink = 0.72 + 0.28 * Math.sin(S.time * 5.2);
    for (var i = 0; i < current.gates.length; i++) {
      var g = current.gates[i];
      var dx = g.x - S.camX, dy = g.y - S.camY, dz = g.z - S.camZ;
      if (dx * dx + dy * dy + dz * dz > 460 * 460) continue;
      if (dx * S.fwX + dy * S.fwY + dz * S.fwZ < -30) continue;
      if (i < S.gateIndex) drawRing(g, M_DONE, 0.85, 14);
      else if (g === tgt) drawRing(g, M_CUR, 1.15 * blink, 22);
      else drawRing(g, M_NEXT, 0.85, 12);
      drawn++;
    }
    return drawn;
  };

  /* ------------------------- 界面 ------------------------- */
  Sc.onUpdate(function () {
    var el = Sc.root && Sc.root.querySelector('[data-dyn="levelsGrid"]');
    if (el) el.innerHTML = levelsGridHtml();
    var rs = Sc.root && Sc.root.querySelector('[data-dyn="resultStats"]');
    if (rs) rs.innerHTML = resultStatsHtml();
  });

  function levelCards() {
    var h = '';
    for (var i = 0; i < DEFS.length; i++) {
      var un = L.unlocked(i), bt = L.bestTime(i);
      h += '<button class="card" data-act="level:' + i + '"' + (un ? '' : ' disabled') + '>' +
        '<span class="no">' + t('hud.level', { n: i + 1 }) + (bt !== null ? ' · ' + t('levels.clear') : '') + '</span>' +
        '<b>' + L.name(i) + '</b>' +
        '<span class="meta">' + U.pad0(DEFS[i].gates, 2) + ' ' + t('levels.gates', { n: DEFS[i].gates }).replace(/^\d+\s*/, '') +
        ' · ' + t('levels.time', { t: DEFS[i].time }) + '</span>' +
        '<span class="best">' + (un
          ? (bt !== null ? t('levels.best', { t: U.fmtTime(bt) }) : L.desc(i))
          : t('levels.locked')) + '</span>' +
        '</button>';
    }
    return h;
  }
  function levelsGridHtml() { return levelCards(); }

  function resultStatsHtml() {
    var c = current;
    if (!c) return '';
    var bt = L.bestTime(c.index);
    var h = '';
    h += '<div class="stat amber"><span>' + t('result.time') + '</span><b>' + U.fmtTime(S.raceTime) +
      (c.newRecord ? ' <span class="badge on">' + t('result.newRecord') + '</span>' : '') + '</b></div>';
    h += '<div class="stat"><span>' + t('result.gates') + '</span><b>' + S.stats.gates + ' / ' + c.gates.length + '</b></div>';
    h += '<div class="stat"><span>' + t('result.dist') + '</span><b>' + (S.flown / 1000).toFixed(2) + ' KM</b></div>';
    if (bt !== null) h += '<div class="stat"><span>' + t('levels.bestLabel') + '</span><b>' + U.fmtTime(bt) + '</b></div>';
    if (L.nextIndex() === null) h += '<div class="dim">' + t('result.allClear') + '</div>';
    return h;
  }

  Sc.addScreen('levels', function () {
    var h = '<h1>' + t('levels.title') + '</h1><h2>' + t('levels.sub') + '</h2>' +
      '<div class="grid" data-dyn="levelsGrid">' + levelCards() + '</div>' +
      '<div class="bar"><button class="btn" data-act="back">' + t('common.back') + '</button></div>';
    return '<div class="screen" data-scr="levels"><div class="panel">' + h + '</div></div>';
  });

  Sc.addScreen('result', function () {
    var last = L.nextIndex() === null;
    var h = '<h1>' + t('result.title') + '</h1><h2>' +
      (current ? t('hud.level', { n: current.index + 1 }) + ' · ' + L.name(current.index) : '') + '</h2>' +
      '<div data-dyn="resultStats">' + resultStatsHtml() + '</div>';
    if (!last) h += '<button class="btn primary" data-act="next">' + t('result.next') + '</button>';
    h += '<button class="btn' + (last ? ' primary' : '') + '" data-act="retry">' + t('result.retry') + '</button>' +
      '<button class="btn ghost" data-act="quit">' + t('result.menu') + '</button>';
    return '<div class="screen" data-scr="result"><div class="panel">' + h + '</div></div>';
  });

  Sc.onAction(function (act) {
    if (act.indexOf('level:') === 0) {
      var i = parseInt(act.slice(6), 10);
      if (!L.unlocked(i)) return true;
      L.start(i);
      return true;
    }
    switch (act) {
      case 'campaign': L.startNext(); return true;
      case 'levels':
        if (Sc.hasScreen('levels')) fsm.go('levels');
        return true;
      case 'next': L.startNext(); return true;
    }
    return false;
  });
})(typeof window !== 'undefined' ? window : globalThis);
