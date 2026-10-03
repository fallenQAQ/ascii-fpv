/* =====================================================================
   ASCII FPV · 数学与随机工具
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, U = AFP.util;

  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.mod = function (a, n) { return ((a % n) + n) % n; };
  U.sign = function (v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); };

  /* 确定性伪随机（同一 seed 永远给出同一序列，用于可复现的地图生成） */
  U.mulberry32 = function (a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };

  /* 三维整数哈希 → [0,1)，同样输入永远同样输出 */
  U.hash3 = function (a, b, c) {
    var h = Math.imul(a ^ 0x9E3779B9, 2246822519);
    h = Math.imul(h ^ b ^ 0x85EBCA6B, 3266489917);
    h = Math.imul(h ^ c ^ 0x27D4EB2F, 668265263);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  };

  /* 低频二维值噪声（双线性插值），用于生成连续成片的生物群系 */
  U.noise2 = function (x, y, seed) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = U.hash3(xi, yi, seed), b = U.hash3(xi + 1, yi, seed);
    var c = U.hash3(xi, yi + 1, seed), d = U.hash3(xi + 1, yi + 1, seed);
    return U.lerp(U.lerp(a, b, u), U.lerp(c, d, u), v);
  };

  /* 秒 → "1:23.45" */
  U.fmtTime = function (sec) {
    if (!(sec >= 0)) sec = 0;
    var m = Math.floor(sec / 60), s = sec - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  };

  U.pad = function (v, n) { var s = String(v); while (s.length < n) s = ' ' + s; return s; };
  U.pad0 = function (v, n) { return U.pad(v, n).replace(/ /g, '0'); };
  U.sgnNum = function (v) {
    var r = Math.round(v);
    return (r < 0 ? '-' : '+') + U.pad(Math.abs(r), 2).replace(' ', '0');
  };
  U.pick = function (rnd, arr) { return arr[Math.min(arr.length - 1, (rnd() * arr.length) | 0)]; };
  U.rrange = function (rnd, a, b) { return a + (b - a) * rnd(); };

  /* 水平面内的角度差（-180~180），用于目标点指示箭头 */
  U.angleDelta = function (from, to) { return ((to - from + 540) % 360) - 180; };
})(typeof window !== 'undefined' ? window : globalThis);
