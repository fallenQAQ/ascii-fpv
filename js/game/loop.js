/* =====================================================================
   ASCII FPV · 主循环与画面合成
   ---------------------------------------------------------------------
   物理用 1/120 秒固定步长累积推进（与帧率解耦），画面每帧重绘一次。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, cfg = AFP.cfg, S = AFP.S;
  var G = AFP.render.grid, BUF = AFP.render.buf;

  var L = AFP.game.loop = {};
  var acc = 0, last = 0, fpsT = 0, fpsN = 0;

  function render() {
    var fsm = AFP.game.fsm;
    AFP.game.player.updateBasis();
    G.clear();
    AFP.render.ground.drawGround();
    AFP.render.scene.drawCity();
    if (AFP.world.obstacles) AFP.world.obstacles.draw();
    if (AFP.game.levels && fsm.isAny('play', 'pause', 'crash', 'result')) AFP.game.levels.draw();
    if (S.hudOn && fsm.isAny('play', 'pause', 'crash')) AFP.render.hud.drawHUD();
    /* 坠机提示只画一套：DOM 面板在场时就用面板，画面里不再重复一遍 */
    var Sc = AFP.ui.screens;
    if (fsm.is('crash') && !(Sc && Sc.isShowing && Sc.isShowing('crash'))) AFP.render.hud.drawCrash();
    G.blit();
  }

  function frame(now) {
    var dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0) || dt > 0.25) dt = 0.016;
    S.time += dt; S.frame++;
    var fsm = AFP.game.fsm;
    AFP.input.update();
    if (fsm.is('play')) {
      acc += dt;
      if (acc > 0.12) acc = 0.12;
      while (acc >= cfg.STEP && fsm.is('play')) { fsm.update(cfg.STEP); acc -= cfg.STEP; }
    } else {
      acc = 0;
      fsm.update(dt);
    }
    render();
    fpsN++; fpsT += dt;
    if (fpsT > 0.5) { S.fpsVal = Math.round(fpsN / fpsT); fpsT = 0; fpsN = 0; }
    if (typeof g.requestAnimationFrame === 'function') g.requestAnimationFrame(frame);
  }

  L.render = render;
  L.frame = frame;
  L.start = function () {
    if (typeof g.requestAnimationFrame !== 'function') return false;
    g.requestAnimationFrame(function (t) { last = t; frame(t + 16); });
    return true;
  };
  L.resetAcc = function () { acc = 0; };
})(typeof window !== 'undefined' ? window : globalThis);
