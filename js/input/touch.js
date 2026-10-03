/* =====================================================================
   ASCII FPV · 触屏控制
   ---------------------------------------------------------------------
   本轮：单摇杆（与原实现一致）——任意处按住拖动 = 姿态，双指上下滑 = 油门。
   轻点 = 暂停 / 继续；坠机后轻点即重生。后续会升级为左右分屏。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, U = AFP.util;
  var T = AFP.input.touch = AFP.input.touch || {};

  var STICK_DEAD = 14, STICK_FULL = 90, THR_DEAD = 12, THR_FULL = 70;   // 死区 / 满偏移（CSS 像素）

  T.st = {
    stickId: null, stickX0: 0, stickY0: 0, stickT0: 0, moved: false, tapOk: false,
    stickVX: 0, stickVY: 0, thrId: null, thrY0: 0, thrV: 0, active: false
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

  T.reset = function () {
    var st = T.st;
    st.stickId = null; st.thrId = null; st.stickVX = 0; st.stickVY = 0; st.thrV = 0;
    st.moved = false; st.active = false;
    var sk = AFP.input.src.stick; sk.pitch = 0; sk.roll = 0; sk.thr = 0;
  };

  T.init = function (win) {
    function onStart(e) {
      if (isUiTarget(e.target)) return;
      var st = T.st;
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (st.stickId === null) {
          st.stickId = t.identifier; st.stickX0 = t.clientX; st.stickY0 = t.clientY;
          st.stickT0 = e.timeStamp; st.moved = false; st.tapOk = true; st.active = true;
        } else if (st.thrId === null) {
          st.thrId = t.identifier; st.thrY0 = t.clientY; st.thrV = 0;
        }
      }
      e.preventDefault();
    }

    function onMove(e) {
      if (isUiTarget(e.target)) return;
      var st = T.st, sk = AFP.input.src.stick;
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === st.stickId) {
          var dx = t.clientX - st.stickX0, dy = t.clientY - st.stickY0;
          if (Math.abs(dx) > STICK_DEAD || Math.abs(dy) > STICK_DEAD) st.moved = true;
          st.stickVX = axis(dx, STICK_DEAD, STICK_FULL);
          st.stickVY = axis(dy, STICK_DEAD, STICK_FULL);
          sk.roll = st.stickVX;                       // 左右 → 滚转
          sk.pitch = st.stickVY;                      // 上滑推杆 → 俯冲（同 W）
        } else if (t.identifier === st.thrId) {
          st.thrV = axis(t.clientY - st.thrY0, THR_DEAD, THR_FULL);
          sk.thr = -st.thrV;                          // 双指上滑 → 加速
        }
      }
      e.preventDefault();
    }

    function onEnd(e) {
      var st = T.st;
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === st.stickId) {
          st.stickId = null; st.active = false;
          var sk = AFP.input.src.stick; sk.pitch = 0; sk.roll = 0;
          st.stickVX = 0; st.stickVY = 0;
          if (st.tapOk && !st.moved && e.timeStamp - st.stickT0 < 400) {   // 轻点
            action(AFP.S.crashed ? 'respawn' : 'pause');
          }
        } else if (t.identifier === st.thrId) {
          st.thrId = null; st.thrV = 0; AFP.input.src.stick.thr = 0;
        }
      }
      if (e.cancelable) e.preventDefault();
    }

    win.addEventListener('touchstart', onStart, { passive: false });
    win.addEventListener('touchmove', onMove, { passive: false });
    win.addEventListener('touchend', onEnd, { passive: false });
    win.addEventListener('touchcancel', onEnd, { passive: false });
    win.addEventListener('gesturestart', function (e) { e.preventDefault(); });   // iOS 捏合缩放
  };

  /* HUD 上的摇杆/油门可视化（坐标由 hud 模块给出） */
  T.drawHud = function (hudCh, C) {
    var st = T.st;
    if (st.stickId !== null && (st.stickVX || st.stickVY)) {
      var cx = Math.round(AFP.render.view.COLS / 2 - 0.5), cy = Math.round(AFP.render.view.ROWS / 2 - 0.5);
      var jx = Math.round(st.stickVX * 9), jy = Math.round(st.stickVY * 6);
      var jn = Math.max(Math.abs(jx), Math.abs(jy), 1);
      for (var i = 1; i <= jn; i++) {
        hudCh(cx + Math.round(jx * i / jn), cy + Math.round(jy * i / jn), i === jn ? 111 : 46, C.C_AMB);
      }
    }
    if (st.thrId !== null && st.thrV) {
      var x = 2, h = 5;
      for (var k = 0; k <= h; k++) {
        hudCh(x, Math.round(AFP.render.view.ROWS / 2) - k * (st.thrV > 0 ? 1 : -1), 124, C.C_AMB);
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
