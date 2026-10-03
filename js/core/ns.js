/* =====================================================================
   ASCII FPV · 命名空间
   ---------------------------------------------------------------------
   本项目不使用打包器，也不使用 ES Module —— 因为 index.html 需要支持
   直接双击以 file:// 打开（ES Module 在 file:// 下会被 CORS 拦截）。
   各文件按 index.html 中的 <script> 顺序加载，统一挂载到 AFP 命名空间。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP = g.AFP || {};
  AFP.version = '2.0.0';
  AFP.util = AFP.util || {};
  AFP.cfg = AFP.cfg || {};
  AFP.S = AFP.S || {};
  AFP.world = AFP.world || {};
  AFP.render = AFP.render || {};
  AFP.game = AFP.game || {};
  AFP.input = AFP.input || {};
  AFP.ui = AFP.ui || {};
  AFP.i18n = AFP.i18n || { dicts: {}, lang: 'zh', listeners: [] };
})(typeof window !== 'undefined' ? window : globalThis);
