/* =====================================================================
   ASCII FPV · 本地存储（安全包装，隐私模式下也不会抛错）
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP;
  var PREFIX = 'asciifpv.';
  var mem = {};
  var ok = true;
  try {
    var ls = g.localStorage;
    ls.setItem(PREFIX + '__probe', '1'); ls.removeItem(PREFIX + '__probe');
  } catch (e) { ok = false; }

  function rawGet(k) {
    if (!ok) return mem[k] === undefined ? null : mem[k];
    try { return g.localStorage.getItem(PREFIX + k); } catch (e) { return null; }
  }
  function rawSet(k, v) {
    if (!ok) { mem[k] = v; return; }
    try { g.localStorage.setItem(PREFIX + k, v); } catch (e) { mem[k] = v; }
  }
  function rawDel(k) {
    if (!ok) { delete mem[k]; return; }
    try { g.localStorage.removeItem(PREFIX + k); } catch (e) { delete mem[k]; }
  }

  AFP.store = {
    available: ok,
    get: function (key, def) {
      var s = rawGet(key);
      if (s === null || s === undefined) return def;
      try { var v = JSON.parse(s); return v === null || v === undefined ? def : v; }
      catch (e) { return def; }
    },
    getRaw: rawGet,
    set: function (key, val) { rawSet(key, JSON.stringify(val)); },
    del: rawDel
  };
})(typeof window !== 'undefined' ? window : globalThis);
