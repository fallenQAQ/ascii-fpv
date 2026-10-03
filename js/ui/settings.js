/* =====================================================================
   ASCII FPV · 设置项与设置界面
   ---------------------------------------------------------------------
   所有可调项统一存在 AFP.ui.settings.vals 里，并通过 AFP.store 落到
   localStorage；语言 / 密度 / HUD / 碰撞等改动会立即生效。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, S = AFP.S, U = AFP.util, V = AFP.render.view;
  var Sc = AFP.ui.screens;
  function t(k, v) { return AFP.t(k, v); }

  var DEFAULTS = {
    lang: 'zh',
    controlMode: 'stick',      // stick | gyro | both
    stickSens: 1,              // 0.4 ~ 2.0
    gyroSens: 1,               // 0.3 ~ 2.5
    gyroInvertPitch: false,
    gyroInvertRoll: false,
    touchLayout: 'split',      // split | single
    density: 0,                // 0 = 按设备自动
    hud: true,
    collide: true
  };

  var St = AFP.ui.settings = AFP.ui.settings || {};
  var vals = {};
  for (var k0 in DEFAULTS) vals[k0] = DEFAULTS[k0];

  St.DEFAULTS = DEFAULTS;
  St.get = function (k) { return vals[k]; };
  St.values = function () { return vals; };

  St.load = function () {
    var saved = AFP.store.get('settings', null);
    if (saved && typeof saved === 'object') {
      for (var k in DEFAULTS) if (saved[k] !== undefined) vals[k] = saved[k];
    }
    St.applyAll();
    return vals;
  };
  St.save = function () { AFP.store.set('settings', vals); };
  St.set = function (k, v, silent) {
    if (vals[k] === v) return false;
    vals[k] = v;
    St.apply(k);
    if (!silent) St.save();
    if (Sc.cur === 'settings') Sc.rebuild();
    return true;
  };

  St.applyAll = function () {
    for (var k in vals) St.apply(k);
  };
  St.apply = function (k) {
    switch (k) {
      case 'lang': AFP.i18n.setLang(vals.lang); break;
      case 'density':
        /* 0 = 按设备自动；否则存的是「收敛后的期望列数」，
           而界面与 HUD 显示的始终是真正排出来的 COLS × ROWS */
        if (vals.density) {
          V.targetCols = U.clamp(vals.density, V.MIN_COLS, V.MAX_COLS);
          AFP.render.grid.layout();
        } else {
          AFP.render.grid.setAutoColumns();
        }
        break;
      case 'hud': S.hudOn = !!vals.hud; break;
      case 'collide':
        S.collideOn = !!vals.collide;
        if (!S.collideOn) S.crashed = 0;
        break;
      case 'controlMode':
      case 'gyroSens':
      case 'gyroInvertPitch':
      case 'gyroInvertRoll':
        if (AFP.input.gyro && AFP.input.gyro.syncMode) AFP.input.gyro.syncMode();
        break;
      case 'stickSens': break;
      case 'touchLayout': AFP.input.refreshHint(); break;
    }
  };

  /* ------------------------- 界面 ------------------------- */
  function row(label, ctrl, sub) {
    return '<div class="row"><span class="label">' + label +
      (sub ? '<span class="sub">' + sub + '</span>' : '') + '</span><span>' + ctrl + '</span></div>';
  }
  function seg(act, opts, cur) {
    var h = '<span class="seg">';
    for (var i = 0; i < opts.length; i++) {
      h += '<button data-act="' + act + ':' + opts[i].v + '"' + (cur === opts[i].v ? ' class="on"' : '') + '>' +
        opts[i].label + '</button>';
    }
    return h + '</span>';
  }
  function toggle(act, on) {
    return '<span class="seg">' +
      '<button data-act="' + act + ':1"' + (on ? ' class="on"' : '') + '>' + t('settings.on') + '</button>' +
      '<button data-act="' + act + ':0"' + (!on ? ' class="on"' : '') + '>' + t('settings.off') + '</button>' +
      '</span>';
  }
  function sens(act, v, min, max, step) {
    var pct = Math.round(v * 100) + '%';
    return '<span class="seg">' +
      '<button data-act="' + act + ':-"' + (v <= min + 1e-6 ? ' disabled' : '') + '>-</button>' +
      '<button data-act="' + act + ':0" disabled style="min-width:56px">' + pct + '</button>' +
      '<button data-act="' + act + ':+"' + (v >= max - 1e-6 ? ' disabled' : '') + '>+</button>' +
      '</span>';
  }

  function screenHtml() {
    var gyroOk = !AFP.input.gyro || AFP.input.gyro.supported !== false;
    var touch = AFP.input.isTouch;
    var h = '<h1>' + t('settings.title') + '</h1><h2>' + t('settings.sub') + '</h2>';

    h += '<h3>' + t('settings.display') + '</h3>';
    h += row(t('settings.language'), seg('lang', [
      { v: 'zh', label: '中文' }, { v: 'en', label: 'English' }
    ], vals.lang));
    var atMinDensity = V.minGrid ? (V.COLS <= V.minGrid.COLS) : (V.COLS <= V.MIN_COLS);
    h += row(t('settings.density'),
      '<span class="seg">' +
      '<button data-act="density:-16"' + (atMinDensity ? ' disabled' : '') + '>-</button>' +
      '<button data-act="density:0" disabled style="min-width:78px">' + V.COLS + ' × ' + V.ROWS + '</button>' +
      '<button data-act="density:16">+</button>' +
      '<button data-act="density:auto">' + t('settings.density.auto') + '</button></span>',
      t('settings.density.sub', {
        c: V.COLS, r: V.ROWS,
        mc: V.minGrid ? V.minGrid.COLS : V.MIN_COLS,
        mr: V.minGrid ? V.minGrid.ROWS : V.MIN_ROWS
      }));
    h += row(t('settings.hud'), toggle('hud', !!vals.hud));

    h += '<h3>' + t('settings.controls') + '</h3>';
    h += row(t('settings.controlMode'), seg('controlMode', [
      { v: 'stick', label: t('settings.control.stick') },
      { v: 'gyro', label: t('settings.control.gyro') },
      { v: 'both', label: t('settings.control.both') }
    ], vals.controlMode), t('settings.control.sub'));
    if (vals.controlMode !== 'stick') {
      if (gyroOk) {
        h += row(t('settings.gyroSens'), sens('gyroSens', vals.gyroSens, 0.3, 2.5));
        h += row(t('settings.gyroInvertPitch'), toggle('gyroInvertPitch', !!vals.gyroInvertPitch));
        h += row(t('settings.gyroInvertRoll'), toggle('gyroInvertRoll', !!vals.gyroInvertRoll));
        h += row(t('settings.gyroCalib'),
          '<button class="btn" style="margin:0" data-act="gyroCalib">' + t('settings.gyroCalib') + '</button>',
          AFP.input.gyro && AFP.input.gyro.calibrated ? t('settings.gyroCalibrated') : t('settings.gyroHint'));
      } else {
        h += row(t('settings.gyro'), '<span class="dim">' + t('settings.gyroUnsupported') + '</span>');
      }
    }
    if (touch) {
      h += row(t('settings.touchLayout'), seg('touchLayout', [
        { v: 'split', label: t('settings.touch.split') },
        { v: 'single', label: t('settings.touch.single') }
      ], vals.touchLayout), t('settings.touch.sub'));
    }
    h += row(t('settings.stickSens'), sens('stickSens', vals.stickSens, 0.4, 2));

    h += '<h3>' + t('settings.game') + '</h3>';
    h += row(t('settings.collide'), toggle('collide', !!vals.collide), t('settings.collide.sub'));
    h += row(t('settings.resetBest'), '<button class="btn" style="margin:0" data-act="reset:best">' + t('settings.resetBest') + '</button>');
    h += row(t('settings.resetProgress'), '<button class="btn" style="margin:0" data-act="reset:progress">' + t('settings.resetProgress') + '</button>');

    h += '<div class="bar"><button class="btn" data-act="back">' + t('common.back') + '</button></div>';
    return '<div class="screen" data-scr="settings"><div class="panel">' + h + '</div></div>';
  }
  Sc.addScreen('settings', screenHtml);

  /* ------------------------- 交互 ------------------------- */
  /* 只认领「带参数的设置动作」和无参数的 gyroCalib，
     其余（如菜单里的 lang 切换按钮）留给 game/states.js 处理 */
  Sc.onAction(function (act) {
    if (act === 'gyroCalib') {
      if (AFP.input.gyro && AFP.input.gyro.calibrate) AFP.input.gyro.calibrate();
      Sc.rebuild();
      return true;
    }
    var i = act.indexOf(':');
    if (i < 0) return false;
    var head = act.slice(0, i);
    var rest = act.slice(i + 1);
    switch (head) {
      case 'lang': St.set('lang', rest); return true;
      case 'controlMode': St.set('controlMode', rest); return true;
      case 'touchLayout': St.set('touchLayout', rest); return true;
      case 'hud': St.set('hud', rest === '1'); return true;
      case 'collide': St.set('collide', rest === '1'); return true;
      case 'gyroInvertPitch': St.set('gyroInvertPitch', rest === '1'); return true;
      case 'gyroInvertRoll': St.set('gyroInvertRoll', rest === '1'); return true;
      case 'density':
        /* 以「实际列数」为准增减，并把收敛后的期望值存下来 */
        if (rest === 'auto') {
          St.set('density', 0);
        } else {
          var d = parseInt(rest, 10) || 0;
          AFP.render.grid.setColumns(V.COLS + d);
          vals.density = Math.round(V.targetCols * 100) / 100;
          St.save();
          Sc.rebuild();
        }
        return true;
      case 'gyroSens': case 'stickSens':
        var cur = vals[head], step = 0.1;
        var next = rest === '-' ? cur - step : (rest === '+' ? cur + step : cur);
        var lim = head === 'gyroSens' ? [0.3, 2.5] : [0.4, 2];
        St.set(head, Math.round(U.clamp(next, lim[0], lim[1]) * 10) / 10);
        return true;
      case 'reset':
        if (rest === 'best') { S.best = 0; S.bestSaved = 0; AFP.store.del('best'); }
        if (rest === 'progress' && AFP.game.levels) AFP.game.levels.resetProgress();
        Sc.rebuild();
        return true;
    }
    return false;
  });

  St.screenHtml = screenHtml;
})(typeof window !== 'undefined' ? window : globalThis);
