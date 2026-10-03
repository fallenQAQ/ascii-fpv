/* =====================================================================
   ASCII FPV · 陀螺仪控制
   ---------------------------------------------------------------------
   倾斜设备控制姿态：前后倾 → 俯仰，左右倾 → 滚转。
   设置里可切换「摇杆 / 陀螺仪 / 摇杆+陀螺仪」，可调灵敏度、反向，
   并可把当前姿势校准为零位（拿着手机的姿势未必和屏幕水平一致）。
   iOS 13+ 需要在用户手势里申请运动与方向传感器权限。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, U = AFP.util, I = AFP.input;
  var St = function () { return AFP.ui.settings; };

  var G = I.gyro = I.gyro || {};

  G.supported = (typeof g.DeviceOrientationEvent !== 'undefined') ||
    (typeof g.DeviceMotionEvent !== 'undefined' && typeof g.addEventListener === 'function' && !!(g.navigator && g.navigator.maxTouchPoints));
  G.permission = 'unknown';       // unknown | granted | denied
  G.enabled = false;              // 监听是否已挂上
  G.calibrated = false;
  G.hasData = false;
  G.zero = { beta: null, gamma: null };
  G.raw = { beta: 0, gamma: 0 };

  function mode() { var s = St(); return s ? s.get('controlMode') : 'stick'; }
  function val(k, d) { var s = St(); return s ? s.get(k) : d; }

  function onOrient(e) {
    if (e == null) return;
    if (e.beta === null && e.gamma === null) return;
    G.raw.beta = (typeof e.beta === 'number' && isFinite(e.beta)) ? e.beta : 0;
    G.raw.gamma = (typeof e.gamma === 'number' && isFinite(e.gamma)) ? e.gamma : 0;
    if (G.zero.beta === null) G.calibrate();      // 第一帧数据即零位
    G.hasData = true;
  }
  /* 供外部（页面事件 / 自动测试）直接投喂姿态数据 */
  G.feed = onOrient;

  function addListener() {
    if (G.enabled) return;
    if (typeof g.addEventListener !== 'function') return;
    g.addEventListener('deviceorientation', onOrient, true);
    G.enabled = true;
  }
  function removeListener() {
    if (!G.enabled) return;
    if (typeof g.removeEventListener === 'function') g.removeEventListener('deviceorientation', onOrient, true);
    G.enabled = false;
  }

  G.stop = function () {
    removeListener();
    I.src.gyro.on = false;
    I.src.gyro.pitch = 0;
    I.src.gyro.roll = 0;
  };

  G.start = function () {
    if (!G.supported) return false;
    var DOE = g.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function' && G.permission !== 'granted') {
      try {
        var pr = DOE.requestPermission();
        if (pr && typeof pr.then === 'function') {
          pr.then(function (res) {
            if (res === 'granted') { G.permission = 'granted'; addListener(); }
            else { G.permission = 'denied'; G.stop(); }
          }, function () { G.permission = 'denied'; G.stop(); });
          return true;
        }
      } catch (e) { G.permission = 'denied'; }
      return false;
    }
    G.permission = 'granted';
    addListener();
    return true;
  };

  /* 设置里切换操控方式后调用：按需启停监听 */
  G.syncMode = function () {
    if (mode() === 'stick') { G.stop(); return; }
    G.start();
  };

  G.calibrate = function () {
    G.zero.beta = G.raw.beta;
    G.zero.gamma = G.raw.gamma;
    G.calibrated = true;
  };

  /* 是否正在用陀螺仪操控（界面上的指示灯用它） */
  G.active = function () {
    return !!(G.enabled && G.hasData && I.src.gyro.on && mode() !== 'stick');
  };

  /* 每帧把姿态换算成 -1..1 的操控量。
     只有真的收到过传感器数据才接管操控：浏览器可能声明了
     DeviceOrientationEvent 却永远不触发（桌面 Chrome；以及在 http://
     局域网地址下被判定为非安全上下文而屏蔽），此时必须把操控让回摇杆，
     否则姿态输入会永远是 0，摇杆也被忽略。 */
  G.update = function () {
    var m = mode();
    if (m === 'stick' || !G.enabled || !G.hasData) {
      I.src.gyro.on = false; I.src.gyro.pitch = 0; I.src.gyro.roll = 0;
      return;
    }
    var sens = val('gyroSens', 1) || 1;
    var full = 32 / sens;                       // 倾斜 full 度即满舵
    var zb = G.zero.beta === null ? 0 : G.zero.beta;
    var zg = G.zero.gamma === null ? 0 : G.zero.gamma;
    var p = U.clamp((G.raw.beta - zb) / full, -1, 1);
    var r = U.clamp((G.raw.gamma - zg) / full, -1, 1);
    if (val('gyroInvertPitch', false)) p = -p;
    if (val('gyroInvertRoll', false)) r = -r;
    I.src.gyro.pitch = p;
    I.src.gyro.roll = r;
    I.src.gyro.on = true;
  };

  G.init = function (win) {
    /* 桌面浏览器没有 DeviceOrientationEvent；有的话也要等设置里开启 */
    if (G.supported && mode() !== 'stick') G.syncMode();
  };
})(typeof window !== 'undefined' ? window : globalThis);
