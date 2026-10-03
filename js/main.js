/* =====================================================================
   ASCII FPV · 启动
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, cfg = AFP.cfg, S = AFP.S;
  var G = AFP.render.grid, W = AFP.world, V = AFP.render.view;

  function boot() {
    var doc = g.document;
    var canvas = doc.getElementById('screen');
    var host = doc.getElementById('ui');
    G.init(canvas, g);

    if (AFP.ui.settings) AFP.ui.settings.load();       // 读取本地设置（含字符密度 / 语言）
    G.setupGrid();
    W.gen();
    AFP.game.player.loadBest();
    AFP.ui.screens.build(host);
    AFP.game.states.init();
    AFP.input.init(g);
    AFP.game.loop.start();

    g.addEventListener('resize', function () { G.setupGrid(); });
    g.addEventListener('orientationchange', function () { setTimeout(function () { G.setupGrid(); }, 200); });
    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) { AFP.input.clear(); }
    });
  }

  /* ------------------------- 离线自检接口 ------------------------- */
  function installTestHook() {
    g.__ASCIIFPV__ = {
      AFP: AFP,
      ready: true,
      state: function () { return AFP.game.fsm.cur; },
      go: function (name, payload) { return AFP.game.fsm.go(name, payload); },
      action: function (name) { AFP.game.onInputAction(name); },
      ui: function (act) { AFP.ui.screens.dispatch(act); },
      setCam: function (o) {
        if (o.x !== undefined) S.camX = o.x;
        if (o.y !== undefined) S.camY = o.y;
        if (o.z !== undefined) S.camZ = o.z;
        if (o.yaw !== undefined) S.yaw = o.yaw;
        if (o.pitch !== undefined) S.pitch = o.pitch;
        if (o.roll !== undefined) S.roll = o.roll;
        if (o.spd !== undefined) S.spd = o.spd;
        AFP.game.player.updateBasis();
      },
      step: function (dt) { AFP.game.player.physics(dt); },
      axes: function (o) {
        if (!o) return S.axes;
        if (o.pitch !== undefined) S.axes.pitch = o.pitch;
        if (o.roll !== undefined) S.axes.roll = o.roll;
        if (o.thr !== undefined) S.axes.thr = o.thr;
        return S.axes;
      },
      key: function (code, down) { S.keys[code] = down === false ? 0 : 1; },
      render: function () { AFP.game.loop.render(); },
      update: function (dt) { AFP.game.fsm.update(dt); },
      info: function () {
        return {
          COLS: V.COLS, ROWS: V.ROWS, cellW: V.cellW, cellH: V.cellH,
          camX: S.camX, camY: S.camY, camZ: S.camZ,
          yaw: S.yaw, pitch: S.pitch, roll: S.roll, spd: S.spd,
          crashed: S.crashed, pal: AFP.render.pal.PAL.length,
          state: AFP.game.fsm.cur, mode: S.mode
        };
      },
      dump: function () {
        var BUF = AFP.render.buf, out = [];
        for (var y = 0; y < V.ROWS; y++) {
          var line = '';
          for (var x = 0; x < V.COLS; x++) line += String.fromCharCode(BUF.chars[y * V.COLS + x] || 32);
          out.push(line.replace(/\s+$/, ''));
        }
        return out.join('\n');
      }
    };
  }

  if (g.document) {
    if (g.document.readyState === 'loading') {
      g.document.addEventListener('DOMContentLoaded', function () { boot(); installTestHook(); });
    } else {
      boot(); installTestHook();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
