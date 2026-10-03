/* =====================================================================
   ASCII FPV · 状态定义与状态切换
   ---------------------------------------------------------------------
   状态机把「开始界面 / 菜单 / 设置 / 飞行 / 暂停 / 坠机 / 结算」
   彻底分开：每个状态自己决定显示哪个面板、是否推进世界、按返回键去哪。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, cfg = AFP.cfg, S = AFP.S, U = AFP.util;
  var fsm = AFP.game.fsm, PL = AFP.game.player, Sc = AFP.ui.screens;

  var cineT = 0;
  var helpReturn = 'menu';
  var settingsReturn = 'menu';

  /* 主菜单的运镜：绕着城中心缓慢环绕，作为动态背景 */
  function cine(dt) {
    cineT += dt * 0.05;
    var r = 300;
    var cx = Math.cos(cineT) * r, cz = Math.sin(cineT) * r;
    S.camX = cx; S.camZ = cz;
    S.camY = 95 + Math.sin(cineT * 0.7) * 30;
    S.yaw = U.mod(Math.atan2(-cx, -cz) / cfg.DEG, 360);
    S.pitch = -7 + 4 * Math.sin(cineT * 0.5);
    S.roll = 7 * Math.sin(cineT * 0.4);
    S.spd = 26; S.flown = 0;
  }
  function resetCine() { cineT = 0; }

  function startFree() {
    S.mode = 'free';
    S.gates = []; S.gateIndex = 0; S.raceTime = 0; S.raceDone = false;
    S.stats.gates = 0; S.stats.time = 0;
    PL.respawn(cfg.START);
    fsm.go('play');
  }

  function restartRun() {
    if (S.mode === 'level' && AFP.game.levels) AFP.game.levels.start(S.level);
    else startFree();
  }

  /* ------------------------- 状态定义 ------------------------- */
  fsm.def('boot', {
    update: function () { fsm.go('menu'); }
  });

  fsm.def('menu', {
    enter: function () {
      resetCine();
      S.crashed = 0;
      Sc.show('menu');
    },
    update: cine,
    back: function () { }
  });

  fsm.def('help', {
    enter: function (p) { helpReturn = (p && p.from) || 'menu'; Sc.show('help'); },
    back: function () { fsm.go(helpReturn); }
  });

  fsm.def('settings', {
    enter: function (p) {
      settingsReturn = (p && p.from) || 'menu';
      if (Sc.hasScreen('settings')) Sc.show('settings');
      else fsm.go(settingsReturn);
    },
    back: function () { fsm.go(settingsReturn); }
  });

  fsm.def('play', {
    enter: function () { Sc.hideAll(); },
    update: function (dt) {
      PL.physics(dt);
      if (S.mode === 'level' && AFP.game.levels) {
        S.raceTime += dt;
        AFP.game.levels.update(dt);
      }
      if (S.crashed) fsm.go('crash');
      else if (S.raceDone && AFP.game.levels) fsm.go('result');
    },
    back: function () { fsm.go('pause'); }
  });

  fsm.def('pause', {
    enter: function () { Sc.show('pause'); },
    update: function () { },
    back: function () { fsm.go('play'); }
  });

  fsm.def('crash', {
    enter: function () {
      S.crashed = S.crashed || 1;
      Sc.show('crash');
    },
    back: function () { fsm.go('menu'); }
  });

  /* ------------------------- 输入动作路由 ------------------------- */
  AFP.game.onInputAction = function (name) {
    switch (name) {
      case 'pause':
        if (fsm.is('play')) fsm.go('pause');
        else if (fsm.is('pause')) fsm.go('play');
        break;
      case 'respawn':
        if (fsm.is('crash')) restartRun();
        else if (fsm.is('play')) PL.respawn(S.mode === 'level' && AFP.game.levels ? AFP.game.levels.startPos() : cfg.START);
        break;
      case 'hud':
        S.hudOn = !S.hudOn;
        if (AFP.ui.settings) AFP.ui.settings.set('hud', S.hudOn);
        break;
      case 'collide':
        S.collideOn = !S.collideOn;
        if (!S.collideOn) S.crashed = 0;
        if (AFP.ui.settings) AFP.ui.settings.set('collide', S.collideOn);
        break;
      case 'back':
        fsm.back();
        break;
      case 'confirm':
        if (fsm.is('menu')) startFree();
        break;
    }
  };

  /* ------------------------- 按钮动作路由 ------------------------- */
  Sc.action = function (act) {
    switch (act) {
      case 'free': startFree(); break;
      case 'help':
        helpReturn = fsm.cur;
        fsm.go('help', { from: fsm.cur });
        break;
      case 'settings':
        settingsReturn = fsm.cur;
        fsm.go('settings', { from: fsm.cur });
        break;
      case 'lang':
        AFP.i18n.setLang(AFP.i18n.lang === 'zh' ? 'en' : 'zh');
        if (AFP.ui.settings) AFP.ui.settings.set('lang', AFP.i18n.lang);
        break;
      case 'resume': fsm.go('play'); break;
      case 'restart': restartRun(); break;
      case 'retry': restartRun(); break;
      case 'quit': fsm.go('menu'); break;
      case 'back': fsm.back(); break;
      default:
        if (AFP.game.onUiAction) AFP.game.onUiAction(act);
    }
  };

  AFP.i18n.onChange(function () {
    Sc.rebuild();
    AFP.input.refreshHint();
  });

  AFP.game.states = {
    startFree: startFree,
    restartRun: restartRun,
    init: function () { fsm.go('menu'); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
