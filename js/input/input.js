/* =====================================================================
   ASCII FPV · 输入总线
   ---------------------------------------------------------------------
   键盘 / 触屏 / 陀螺仪都只写入 src.* 三个来源，最终合并成 S.axes
   三路模拟量（-1..1）：pitch 正 = 抬头，roll 正 = 右滚，thr 正 = 加速。
   这样「摇杆 / 陀螺仪 / 混合」只是换一种输入源，物理层完全不用改。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, cfg = AFP.cfg, S = AFP.S, U = AFP.util, V = AFP.render.view;
  var I = AFP.input;

  I.src = {
    key: { pitch: 0, roll: 0, thr: 0 },
    stick: { pitch: 0, roll: 0, thr: 0 },
    gyro: { pitch: 0, roll: 0, on: false }
  };
  I.isTouch = false;
  I.hintKey = 'hud.hint.key';

  var HANDLED = {
    KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, KeyZ: 1, KeyX: 1,
    ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1,
    Space: 1, BracketLeft: 1, BracketRight: 1
  };
  var ALIAS = { ArrowUp: 'KeyW', ArrowDown: 'KeyS', ArrowLeft: 'KeyA', ArrowRight: 'KeyD' };

  function keyAxes() {
    var k = S.keys, a = I.src.key;
    a.pitch = (k.KeyS ? 1 : 0) - (k.KeyW ? 1 : 0);
    a.roll = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    a.thr = (k.KeyZ ? 1 : 0) - (k.KeyX ? 1 : 0);
  }

  /* 三个来源合并 → S.axes
     操控方式决定「摇杆 / 陀螺仪 / 两者」如何参与：
       stick  只用摇杆；gyro 只用陀螺仪（陀螺仪不可用时自动回退摇杆）；
       both   两者相加 */
  I.update = function () {
    keyAxes();
    if (I.gyro) I.gyro.update();
    var s = I.src, gy = s.gyro;
    var cfgS = AFP.ui.settings;
    var mode = cfgS ? cfgS.get('controlMode') : 'stick';
    var gyroOn = !!(gy && gy.on);
    var useStick = (mode === 'stick') || (mode === 'both') || (mode === 'gyro' && !gyroOn);
    var stickSens = cfgS ? (cfgS.get('stickSens') || 1) : 1;
    var sp = useStick ? s.stick.pitch * stickSens : 0;
    var sr = useStick ? s.stick.roll * stickSens : 0;
    var gp = (mode !== 'stick' && gyroOn) ? gy.pitch : 0;
    var gr = (mode !== 'stick' && gyroOn) ? gy.roll : 0;
    S.axes.pitch = U.clamp(s.key.pitch + sp + gp, -1, 1);
    S.axes.roll = U.clamp(s.key.roll + sr + gr, -1, 1);
    S.axes.thr = U.clamp(s.key.thr + s.stick.thr, -1, 1);
  };

  I.clear = function () {
    s0(I.src.key); s0(I.src.stick);
    for (var k in S.keys) S.keys[k] = 0;
    if (I.touch && I.touch.reset) I.touch.reset();
  };
  function s0(o) { o.pitch = 0; o.roll = 0; o.thr = 0; }

  function action(name) {
    if (AFP.game.onInputAction) AFP.game.onInputAction(name);
  }
  I.action = action;

  /* 字符密度（分辨率）：[ ] 键 */
  function density(delta) {
    V.targetCols = U.clamp(V.targetCols + delta, 64, 264);
    AFP.render.grid.setupGrid();
    if (AFP.ui.settings) AFP.ui.settings.set('density', V.targetCols);
  }
  I.density = density;

  function onKeyDown(e) {
    var code = ALIAS[e.code] || e.code;
    if (HANDLED[e.code]) e.preventDefault();
    S.keys[code] = 1;
    switch (code) {
      case 'KeyR': action('respawn'); break;
      case 'KeyH': action('hud'); break;
      case 'KeyC': action('collide'); break;
      case 'KeyP': case 'Space': action('pause'); break;
      case 'Escape': action('back'); break;
      case 'Enter': case 'NumpadEnter': action('confirm'); break;
      case 'BracketLeft': density(-16); break;
      case 'BracketRight': density(16); break;
    }
  }
  function onKeyUp(e) { S.keys[ALIAS[e.code] || e.code] = 0; }

  I.init = function (win) {
    I.isTouch = V.isTouch;
    win.addEventListener('keydown', onKeyDown);
    win.addEventListener('keyup', onKeyUp);
    win.addEventListener('blur', function () { I.clear(); });
    if (I.touch) I.touch.init(win);
    if (I.gyro) I.gyro.init(win);
    I.refreshHint();
  };

  /* 底部提示行随设备与设置变化 */
  I.refreshHint = function () {
    if (AFP.ui.settings && AFP.ui.settings.get('controlMode') !== 'stick' &&
        AFP.input.gyro && AFP.input.gyro.active()) I.hintKey = 'hud.hint.gyro';
    else if (!I.isTouch) I.hintKey = 'hud.hint.key';
    else I.hintKey = (AFP.ui.settings && AFP.ui.settings.get('touchLayout') === 'single')
      ? 'hud.hint.touch.single' : 'hud.hint.touch.split';
    return I.hintKey;
  };
})(typeof window !== 'undefined' ? window : globalThis);
