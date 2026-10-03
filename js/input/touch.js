/* =====================================================================
   ASCII FPV · 触屏控制
   ---------------------------------------------------------------------
   左右分屏（默认）：
     左半屏  上下拖动 = 油门，松手后保持当前油门（像真油门杆一样）
     右半屏  任意处按住拖动 = 姿态摇杆（相对起手点，越远舵量越大）
     轻点任意半屏 = 暂停 / 继续，坠机后轻点即重来
   单摇杆（设置可切回，与原实现一致）：
     单指拖动 = 姿态，双指上下滑 = 油门
   落在菜单面板上的触摸交给浏览器，保证按钮可点、面板可滚。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, U = AFP.util, V = AFP.render.view;
  var T = AFP.input.touch = AFP.input.touch || {};

  var DEAD = 12, FULL = 78;        // 摇杆死区 / 满舵偏移（CSS 像素）
  var THR_DEAD = 6, THR_FULL = 110; // 油门死区 / 满量程偏移
  var TAP_MS = 400;                 // 轻点判定时长

  function settings() { return AFP.ui.settings; }
  function layout() {
    var s = settings();
    return s ? s.get('touchLayout') : 'split';
  }

  T.st = {
    layout: 'split',
    /* 右半屏姿态摇杆 */
    stickId: null, stickX0: 0, stickY0: 0, stickT0: 0, moved: false, tapOk: false,
    stickVX: 0, stickVY: 0, active: false,
    /* 左半屏油门 */
    thrId: null, thrY0: 0, thrT0: 0, thrMoved: false, thrTapOk: false,
    thrHold: 0, thrV: 0,    /* 单摇杆布局下的第二指油门 */
    thr2Id: null, thr2Y0: 0, thr2V: 0
  };

  function axis(v, dead, full) {
    var s = v < 0 ? -1 : 1, m = Math.abs(v);
    return m <= dead ? 0 : s * Math.min(1, (m - dead) / (full - dead));
  }
  T.axis = axis;

  function action(name) { if (AFP.game.onInputAction) AFP.game.onInputAction(name); }

  /* 面板上的触摸交给浏览器（保证按钮点击与面板滚动可用） */
  function isUiTarget(t) {
    return !!(t && t.closest && t.closest('#ui .screen.on'));
  }
  T.isUiTarget = isUiTarget;

  function stickSrc() { return AFP.input.src.stick; }

  T.reset = function () {
    var st = T.st, sk = stickSrc();
    st.stickId = null; st.thrId = null; st.thr2Id = null;
    st.stickVX = 0; st.stickVY = 0; st.thrV = 0; st.thr2V = 0;
    st.thrHold = 0; st.moved = false; st.active = false;
    sk.pitch = 0; sk.roll = 0; sk.thr = 0;
  };

  /* 触摸 → 屏幕比例：判断落在哪半屏 / 换算成字符格坐标 */
  function halfOf(clientX, win) {
    var w = win.innerWidth || 1;
    return clientX < w * 0.5 ? 'left' : 'right';
  }
  function toCellX(clientX, win) {
    var w = win.innerWidth || 1;
    return Math.round(clientX / w * V.COLS);
  }
  function toCellY(clientY, win) {
    var h = win.innerHeight || 1;
    return Math.round(clientY / h * V.ROWS);
  }
  T.toCell = function (clientX, clientY, win) {
    return [toCellX(clientX, win || g), toCellY(clientY, win || g)];
  };

  function onStart(win, e) {
    if (isUiTarget(e.target)) return;
    var st = T.st;
    st.layout = layout();
    var split = st.layout === 'split';
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var half = halfOf(t.clientX, win);
      if (split) {
        if (half === 'right' && st.stickId === null) {
          st.stickId = t.identifier; st.stickX0 = t.clientX; st.stickY0 = t.clientY;
          st.stickT0 = e.timeStamp; st.moved = false; st.tapOk = true; st.active = true;
        } else if (half === 'left' && st.thrId === null) {
          st.thrId = t.identifier; st.thrY0 = t.clientY; st.thrHold = 0;
          st.thrT0 = e.timeStamp; st.thrMoved = false; st.thrTapOk = true;
        } else if (half === 'right') {                       // 右半屏第二指：重设摇杆基点
          st.stickX0 = t.clientX; st.stickY0 = t.clientY; st.stickT0 = e.timeStamp;
          st.moved = false; st.tapOk = false;
        }
      } else {
        if (st.stickId === null) {
          st.stickId = t.identifier; st.stickX0 = t.clientX; st.stickY0 = t.clientY;
          st.stickT0 = e.timeStamp; st.moved = false; st.tapOk = true; st.active = true;
        } else if (st.thr2Id === null) {
          st.thr2Id = t.identifier; st.thr2Y0 = t.clientY; st.thr2V = 0;
        }
      }
    }
    e.preventDefault();
  }

  function onMove(win, e) {
    if (isUiTarget(e.target)) return;
    var st = T.st, sk = stickSrc();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === st.stickId) {
        var dx = t.clientX - st.stickX0, dy = t.clientY - st.stickY0;
        if (Math.abs(dx) > DEAD || Math.abs(dy) > DEAD) st.moved = true;
        st.stickVX = axis(dx, DEAD, FULL);
        st.stickVY = axis(dy, DEAD, FULL);
        sk.roll = st.stickVX;                        // 右滑 → 右滚
        sk.pitch = st.stickVY;                       // 下滑拉杆 → 抬头（同 S）
      } else if (t.identifier === st.thrId) {
        var ty = st.thrY0 - t.clientY;               // 上滑为正 → 加速
        if (Math.abs(ty) > THR_DEAD) st.thrMoved = true;
        st.thrHold = axis(ty, THR_DEAD, THR_FULL);
        st.thrV = st.thrHold;
        sk.thr = st.thrHold;
      } else if (t.identifier === st.thr2Id) {
        st.thr2V = axis(t.clientY - st.thr2Y0, DEAD, FULL);
        sk.thr = -st.thr2V;                          // 双指上滑 → 加速
      }
    }
    e.preventDefault();
  }

  function onEnd(win, e) {
    var st = T.st, sk = stickSrc();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === st.stickId) {
        st.stickId = null; st.active = false;
        sk.pitch = 0; sk.roll = 0;
        st.stickVX = 0; st.stickVY = 0;
        if (st.layout !== 'split' && st.tapOk && !st.moved) st.tapOk = false;
        if (st.tapOk && !st.moved && e.timeStamp - st.stickT0 < TAP_MS) tap();
      } else if (t.identifier === st.thrId) {
        st.thrId = null; st.thrHold = 0; sk.thr = 0;   // 松手油门回中（推杆式）
        if (st.thrTapOk && !st.thrMoved && e.timeStamp - st.thrT0 < TAP_MS) tap();
        st.thrTapOk = false;
      } else if (t.identifier === st.thr2Id) {
        st.thr2Id = null; st.thr2V = 0; sk.thr = 0;
      }
    }
    if (e.cancelable !== false && e.preventDefault) e.preventDefault();
  }

  function tap() { action(AFP.S.crashed ? 'respawn' : 'pause'); }

  T.init = function (win) {
    win.addEventListener('touchstart', function (e) { onStart(win, e); }, { passive: false });
    win.addEventListener('touchmove', function (e) { onMove(win, e); }, { passive: false });
    win.addEventListener('touchend', function (e) { onEnd(win, e); }, { passive: false });
    win.addEventListener('touchcancel', function (e) { onEnd(win, e); }, { passive: false });
    win.addEventListener('gesturestart', function (e) { e.preventDefault(); });   // iOS 捏合缩放
  };

  /* ------------------------- HUD 可视化 ------------------------- */
  function vline(hudCh, x, y0, y1, ch, st) {
    for (var y = y0; y <= y1; y++) hudCh(x, y, ch, st);
  }

  T.drawHud = function (hudCh, C) {
    var st = T.st, COLS = V.COLS, ROWS = V.ROWS;
    var cy = Math.round(ROWS / 2);
    if (st.layout === 'split') {
      /* 左：油门刻度条（纵向），当前油门用实心块表示 */
      var x = 2, top = cy - 9, bot = cy + 9;
      vline(hudCh, x, top, bot, 124, C.C_DIM);
      var cur = Math.round(cy - st.thrHold * 9);
      var a = Math.min(cur, cy), b = Math.max(cur, cy);
      for (var y = a; y <= b; y++) hudCh(x, y, 35, st.thrHold > 0.02 ? C.C_AMB : C.C_CYAN);
      hudCh(x, cur, st.thrId !== null ? 111 : 43, C.C_AMB);
      hudCh(x, cy, 43, C.C_CYAN);
      /* 右：摇杆基点方框 + 摇杆头 */
      if (st.stickId !== null) {
        var c = T.toCell(st.stickX0, st.stickY0, g);
        var sx0 = c[0], sy0 = c[1];
        var bx = sx0 + Math.round(st.stickVX * 8), by = sy0 + Math.round(st.stickVY * 5);
        for (var k = -3; k <= 3; k++) {
          hudCh(sx0 + k, sy0 - 3, 45, C.C_DIM); hudCh(sx0 + k, sy0 + 3, 45, C.C_DIM);
          hudCh(sx0 - 3, sy0 + k, 124, C.C_DIM); hudCh(sx0 + 3, sy0 + k, 124, C.C_DIM);
        }
        var n = Math.max(Math.abs(bx - sx0), Math.abs(by - sy0), 1);
        for (var i = 1; i <= n; i++) {
          hudCh(sx0 + Math.round((bx - sx0) * i / n), sy0 + Math.round((by - sy0) * i / n), 46, C.C_AMB);
        }
        hudCh(bx, by, 111, C.C_AMB);
      }
    } else {
      /* 单摇杆：中心轨迹（与原实现一致） */
      if (st.stickId !== null && (st.stickVX || st.stickVY)) {
        var cx = Math.round(COLS / 2 - 0.5);
        var jx = Math.round(st.stickVX * 9), jy = Math.round(st.stickVY * 6);
        var jn = Math.max(Math.abs(jx), Math.abs(jy), 1);
        for (var m = 1; m <= jn; m++) {
          hudCh(cx + Math.round(jx * m / jn), cy + Math.round(jy * m / jn), m === jn ? 111 : 46, C.C_AMB);
        }
      }
    }
    /* 油门数值：左侧刻度条 */
    hudCh(5, cy - Math.round(st.thrHold * 9), st.thrHold >= 0 ? 94 : 118, C.C_AMB);
  };
})(typeof window !== 'undefined' ? window : globalThis);
