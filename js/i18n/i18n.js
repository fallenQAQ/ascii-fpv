/* =====================================================================
   ASCII FPV · 多语言运行时
   ---------------------------------------------------------------------
   t(key, vars)  取词条并做 {var} 插值；缺失时回退中文 → key 本身。
   setLang(code) 切换语言并通知所有订阅者（界面重绘）。
   apply(root)   扫描 [data-i18n] / [data-i18n-title] 批量刷新文案。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, I = AFP.i18n;
  I.LANGS = ['zh', 'en'];
  I.FALLBACK = 'zh';

  I.t = function (key, vars) {
    var d = I.dicts[I.lang] || {};
    var s = d[key];
    if (s === undefined) s = (I.dicts[I.FALLBACK] || {})[key];
    if (s === undefined) s = key;
    if (vars) {
      s = String(s).replace(/\{(\w+)\}/g, function (m, k) {
        return vars[k] === undefined ? m : String(vars[k]);
      });
    }
    return s;
  };
  AFP.t = I.t;

  I.setLang = function (code) {
    if (I.LANGS.indexOf(code) < 0) code = I.FALLBACK;
    if (I.lang === code) return false;
    I.lang = code;
    try { g.document.documentElement.lang = (code === 'zh' ? 'zh-CN' : 'en'); } catch (e) { }
    for (var i = 0; i < I.listeners.length; i++) {
      try { I.listeners[i](code); } catch (e) { }
    }
    return true;
  };
  I.onChange = function (fn) { I.listeners.push(fn); };

  I.apply = function (root) {
    root = root || g.document;
    if (!root || !root.querySelectorAll) return;
    var nodes = root.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], k = n.getAttribute('data-i18n');
      if (n.getAttribute('data-i18n-html') !== null) n.innerHTML = I.t(k);
      else n.textContent = I.t(k);
    }
    var attrs = root.querySelectorAll('[data-i18n-title]');
    for (var j = 0; j < attrs.length; j++) {
      attrs[j].setAttribute('title', I.t(attrs[j].getAttribute('data-i18n-title')));
    }
  };

  /* 调试 / 自检：两种语言的词条集合必须完全一致 */
  I.missingKeys = function (a, b) {
    var A = I.dicts[a] || {}, B = I.dicts[b] || {}, out = [];
    for (var k in A) if (!(k in B)) out.push(k);
    for (var k2 in B) if (!(k2 in A)) out.push(k2);
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
