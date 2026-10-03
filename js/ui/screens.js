/* =====================================================================
   ASCII FPV · DOM 界面（开始界面 / 菜单 / 设置 / 说明 / 结算）
   ---------------------------------------------------------------------
   画面全部是 canvas 上的 ASCII 字符，DOM 只负责菜单与按钮。
   文案统一写在 data-i18n 上，切换语言时 i18n.apply 批量刷新。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP;
  var Sc = AFP.ui.screens = AFP.ui.screens || {};
  function t(k, v) { return AFP.t(k, v); }

  Sc.root = null;
  Sc.cur = null;
  Sc.action = null;      // 由 game/states.js 注入
  Sc.handlers = [];      // 各 UI 模块注册的动作处理器（设置 / 选关…）
  Sc.onAction = function (fn) { Sc.handlers.push(fn); };
  Sc.updaters = [];      // 各 UI 模块注册的动态内容刷新器
  Sc.onUpdate = function (fn) { Sc.updaters.push(fn); };

  var TEMPLATES = {
    menu: function () {
      return '<div class="screen" data-scr="menu"><div class="panel">' +
        '<h1 data-i18n="app.title"></h1>' +
        '<h2 data-i18n="app.subtitle"></h2>' +
        '<div class="dim" data-dyn="menuProgress"></div>' +
        '<button class="btn primary" data-act="campaign">' +
          '<span data-i18n="menu.campaign"></span><span class="hint" data-dyn="campaignSub"></span></button>' +
        '<button class="btn" data-act="free">' +
          '<span data-i18n="menu.free"></span><span class="hint" data-i18n="menu.free.sub"></span></button>' +
        '<button class="btn" data-act="levels">' +
          '<span data-i18n="levels.title"></span><span class="hint" data-dyn="levelsSub"></span></button>' +
        '<button class="btn" data-act="settings">' +
          '<span data-i18n="menu.settings"></span></button>' +
        '<button class="btn" data-act="help">' +
          '<span data-i18n="menu.help"></span><span class="hint">H</span></button>' +
        '<button class="btn ghost" data-act="lang">' +
          '<span data-i18n="menu.lang"></span><span class="hint" data-dyn="langHint"></span></button>' +
        '<div class="go" data-dyn="menuGo"></div>' +
        '</div></div>';
    },
    help: function () {
      return '<div class="screen" data-scr="help"><div class="panel">' +
        '<h1 data-i18n="help.title"></h1>' +
        '<h2 data-i18n="app.subtitle"></h2>' +
        '<div data-dyn="helpBody"></div>' +
        '<div class="bar"><button class="btn" data-act="back"><span data-i18n="common.back"></span></button></div>' +
        '</div></div>';
    },
    pause: function () {
      return '<div class="screen bottom" data-scr="pause"><div class="panel">' +
        '<h1 data-i18n="pause.title"></h1>' +
        '<div data-dyn="pauseStats"></div>' +
        '<button class="btn primary" data-act="resume">' +
          '<span data-i18n="pause.resume"></span><span class="hint">Space / P</span></button>' +
        '<button class="btn" data-act="restart"><span data-i18n="pause.restart"></span><span class="hint">R</span></button>' +
        '<button class="btn" data-act="settings"><span data-i18n="pause.settings"></span></button>' +
        '<button class="btn" data-act="help"><span data-i18n="pause.help"></span></button>' +
        '<button class="btn ghost" data-act="quit"><span data-i18n="pause.quit"></span><span class="hint">Esc</span></button>' +
        '</div></div>';
    },
    crash: function () {
      return '<div class="screen bottom" data-scr="crash"><div class="panel">' +
        '<h1 data-i18n="crash.title"></h1>' +
        '<div class="dim" data-dyn="crashReason"></div>' +
        '<div data-dyn="crashStats"></div>' +
        '<button class="btn primary" data-act="retry">' +
          '<span data-i18n="crash.retry"></span><span class="hint">R</span></button>' +
        '<button class="btn ghost" data-act="quit"><span data-i18n="crash.menu"></span><span class="hint">Esc</span></button>' +
        '</div></div>';
    }
  };

  Sc.addScreen = function (name, html) { TEMPLATES[name] = html; };
  Sc.hasScreen = function (name) { return !!TEMPLATES[name]; };

  Sc.build = function (host) {
    Sc.root = host;
    Sc.rebuild();
  };

  /* 用最新语言 / 状态重绘全部面板（事件委托挂在 host 上，不受影响） */
  Sc.rebuild = function () {
    var host = Sc.root;
    if (!host) return;
    var html = '';
    for (var k in TEMPLATES) html += TEMPLATES[k]();
    host.innerHTML = html;
    if (!Sc._wired) {
      Sc._wired = true;
      host.addEventListener('click', function (e) {
        var el = e.target;
        while (el && el !== host && !(el.getAttribute && el.getAttribute('data-act'))) el = el.parentNode;
        if (!el || el === host) return;
        var act = el.getAttribute('data-act');
        if (act) { e.preventDefault(); Sc.dispatch(act, el); }
      });
    }
    if (Sc.cur) Sc.show(Sc.cur); else Sc.update();
    AFP.i18n.apply(host);       // 重建后必须重刷 data-i18n 文案
  };

  Sc.show = function (name) {
    if (!Sc.root) { Sc.cur = name; return; }
    var list = Sc.root.querySelectorAll('.screen');
    var found = false;
    for (var i = 0; i < list.length; i++) {
      var on = list[i].getAttribute('data-scr') === name;
      if (on) found = true;
      list[i].className = list[i].className.replace(/\s*\bon\b/, '') + (on ? ' on' : '');
      if (!on) list[i].style.display = '';
    }
    if (!found && name && !Sc.hasScreen(name)) { Sc.cur = null; return; }
    Sc.cur = name;
    Sc.update();
  };
  Sc.hideAll = function () {
    if (!Sc.root) { Sc.cur = null; return; }
    var list = Sc.root.querySelectorAll('.screen');
    for (var i = 0; i < list.length; i++) list[i].className = list[i].className.replace(/\s*\bon\b/, '');
    Sc.cur = null;
  };
  Sc.isShown = function () { return !!Sc.cur; };
  /* 某个面板此刻是否真的显示着（没有 DOM 时一律算没有） */
  Sc.isShowing = function (name) { return !!Sc.root && Sc.cur === name; };

  function dyn(name) {
    if (!Sc.root) return null;
    return Sc.root.querySelector('[data-dyn="' + name + '"]');
  }
  function setDyn(name, html) {
    var el = dyn(name);
    if (el) el.innerHTML = html;
  }

  /* 语言切换 / 面板显示时刷新动态内容 */
  Sc.refresh = function () {
    if (Sc.root) AFP.i18n.apply(Sc.root);
    Sc.update();
  };

  Sc.update = function () {
    if (!Sc.root) return;
    setDyn('langHint', t('lang.other'));
    setDyn('menuGo', t('menu.tagline'));
    var best = AFP.S.best || 0;
    var L = AFP.game.levels;
    var prog = L ? L.progressText() : '';
    setDyn('menuProgress', t('menu.best') + ': ' + (best / 1000).toFixed(2) + ' KM' + (prog ? '   ·   ' + prog : ''));
    if (L) {
      setDyn('campaignSub', t('menu.campaign.sub', { n: L.count() }));
      setDyn('levelsSub', L.progress().cleared + '/' + L.count());
    }
    var hb = dyn('helpBody');
    if (hb) hb.innerHTML = helpHtml();
    var ps = dyn('pauseStats');
    if (ps) ps.innerHTML = statsHtml(runStats());
    /* 坠机：标题只出现一次，原因单独一行，其余是数据 */
    setDyn('crashReason', AFP.S.crashed ? crashReasonText() : '');
    var cs = dyn('crashStats');
    if (cs) cs.innerHTML = statsHtml(runStats());
    for (var i = 0; i < Sc.updaters.length; i++) {
      try { Sc.updaters[i](); } catch (e) { }
    }
  };

  function statRow(k, v, amber) {
    return '<div class="stat' + (amber ? ' amber' : '') + '"><span>' + k + '</span><b>' + v + '</b></div>';
  }
  function crashReasonText() {
    var r = AFP.S.crashReason;
    return r === 2 ? t('crash.building')
      : r === 3 ? t('crash.obstacle')
        : r === 4 ? t('crash.timeout')
          : t('crash.ground');
  }
  function runStats() {
    var S = AFP.S;
    return {
      reason: S.crashed ? crashReasonText() : '',
      dist: (S.flown / 1000).toFixed(2) + ' KM',
      best: (S.best / 1000).toFixed(2) + ' KM',
      gates: S.mode === 'level' ? (S.stats.gates + ' / ' + (S.gates.length || 0)) : '',
      time: S.mode === 'level' && S.raceTime ? AFP.util.fmtTime(S.raceTime) : ''
    };
  }
  /* 只列数据；标题与坠机原因由面板自己的元素负责，避免同一句话出现两次 */
  function statsHtml(st) {
    var h = '';
    if (st.time) h += statRow(t('result.time'), st.time);
    if (st.gates) h += statRow(t('result.gates'), st.gates);
    h += statRow(t('crash.dist'), st.dist);
    h += statRow(t('crash.best'), st.best);
    return h;
  }

  function helpHtml() {
    var touch = AFP.input.isTouch;
    var kb = '<h3 data-i18n="help.desktop"></h3><table class="kb">' +
      '<tr><td><kbd>W</kbd> / <kbd>S</kbd></td><td>' + t('help.kb.ws') + '</td></tr>' +
      '<tr><td><kbd>A</kbd> / <kbd>D</kbd></td><td>' + t('help.kb.ad') + '</td></tr>' +
      '<tr><td><kbd>Z</kbd> / <kbd>X</kbd></td><td>' + t('help.kb.zx') + '</td></tr>' +
      '<tr><td><kbd>R</kbd></td><td>' + t('help.kb.r') + '</td></tr>' +
      '<tr><td><kbd>[</kbd> <kbd>]</kbd></td><td>' + t('help.kb.br') + '</td></tr>' +
      '<tr><td><kbd>H</kbd> <kbd>C</kbd> <kbd>P</kbd></td><td>' + t('help.kb.hcp') + '</td></tr>' +
      '</table>';
    var tc = '<h3 data-i18n="help.touch"></h3>' +
      '<div class="dim">' + t(AFP.input.hintKey) + '</div>' +
      '<p class="dim">' + t('help.tip') + '</p>';
    var gy = '<h3 data-i18n="help.gyro"></h3><div class="dim">' + t('help.gyro.body') + '</div>';
    var goal = '<h3 data-i18n="help.goal"></h3><div class="dim">' + t('help.goal.body') + '</div>';
    return goal + (touch ? tc + gy : kb) + (touch ? '' : gy);
  }

  /* ------------------------- 动作分发 ------------------------- */
  Sc.dispatch = function (act, el) {
    for (var i = 0; i < Sc.handlers.length; i++) {
      if (Sc.handlers[i](act, el)) return true;
    }
    if (Sc.action) { Sc.action(act, el); return true; }
    return false;
  };

  AFP.ui.fmt = { statRow: statRow };
  Sc.statsHtml = statsHtml;
  Sc.helpHtml = helpHtml;
})(typeof window !== 'undefined' ? window : globalThis);
