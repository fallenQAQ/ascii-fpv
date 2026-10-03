/* =====================================================================
   ASCII FPV · 有限状态机
   ---------------------------------------------------------------------
   状态：boot(启动) → menu(主菜单) → levels(选关) → settings(设置)
         → help(说明) → play(飞行) ⇄ pause(暂停) → crash(坠机)
         → result(过关结算)
   每个状态可以有 enter(payload, from) / exit(to) / update(dt) / key(code)。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP;

  var fsm = {
    cur: 'boot',
    prev: null,
    t: 0,              // 进入当前状态后的时间（秒）
    payload: {},
    states: {},
    listeners: []
  };

  fsm.def = function (name, handlers) {
    fsm.states[name] = handlers || {};
    return fsm;
  };
  fsm.has = function (name) { return !!fsm.states[name]; };
  fsm.is = function (name) { return fsm.cur === name; };
  fsm.isAny = function () {
    for (var i = 0; i < arguments.length; i++) if (fsm.cur === arguments[i]) return true;
    return false;
  };

  fsm.go = function (name, payload) {
    if (!fsm.states[name]) return false;
    if (fsm.cur === name) { fsm.payload = payload || {}; return false; }
    var from = fsm.cur;
    var s = fsm.states[from];
    if (s && s.exit) s.exit(name);
    fsm.prev = from;
    fsm.cur = name;
    fsm.t = 0;
    fsm.payload = payload || {};
    var e = fsm.states[name];
    if (e && e.enter) e.enter(fsm.payload, from);
    for (var i = 0; i < fsm.listeners.length; i++) {
      try { fsm.listeners[i](name, from, fsm.payload); } catch (err) { }
    }
    return true;
  };

  fsm.onChange = function (fn) { fsm.listeners.push(fn); };

  fsm.update = function (dt) {
    fsm.t += dt;
    var s = fsm.states[fsm.cur];
    if (s && s.update) s.update(dt);
  };

  /* 键盘 / 触屏的统一“动作”都交给当前状态处理 */
  fsm.key = function (code, ev) {
    var s = fsm.states[fsm.cur];
    if (s && s.key && s.key(code, ev)) return true;
    return false;
  };

  /* Esc / 返回键：交给状态自行决定返回哪一层 */
  fsm.back = function () {
    var s = fsm.states[fsm.cur];
    if (s && s.back) { s.back(); return true; }
    return false;
  };

  AFP.game.fsm = fsm;
})(typeof window !== 'undefined' ? window : globalThis);
