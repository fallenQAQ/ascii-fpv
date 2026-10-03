/* =====================================================================
   ASCII FPV · 无头测试环境
   ---------------------------------------------------------------------
   读取 index.html 里的 <script src> 顺序，在 Node 的 vm 沙箱中按顺序
   加载全部源码，并提供画布 / localStorage / 事件 / rAF 的替身。
   用法： const H = require('./harness'); const app = H.boot();
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createDocument } = require('./dom');

const ROOT = path.resolve(__dirname, '..');

function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

/* index.html 里声明的脚本加载顺序就是唯一的“构建清单” */
function scriptList() {
  const html = readFile('index.html');
  const re = /<script[^>]*\ssrc=["']([^"']+)["'][^>]*>/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}
function styleList() {
  const html = readFile('index.html');
  const re = /<link[^>]*\shref=["']([^"']+\.css)["'][^>]*>/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function boot(opts) {
  opts = opts || {};
  const files = scriptList();
  const styles = styleList();
  const doc = createDocument();

  /* ---------- canvas 2d 上下文替身 ---------- */
  const ctxCalls = { fillText: 0, fillRect: 0, measureText: 0 };
  const ctx = {
    font: '', letterSpacing: '0px', fillStyle: '', textBaseline: '', textAlign: '',
    globalAlpha: 1,
    fillRect: function () { ctxCalls.fillRect++; },
    clearRect: function () { },
    fillText: function () { ctxCalls.fillText++; },
    measureText: function (s) {
      ctxCalls.measureText++;
      /* 等宽字体按 0.6em 字宽模拟（与 grid.js 反推字号的公式一致），
         这样字符密度调节在无头环境里也表现得和浏览器一致 */
      const m = /([\d.]+)px/.exec(ctx.font);
      const px = m ? parseFloat(m[1]) : 10;
      return { width: String(s).length * px * 0.6 };
    },
    save: function () { }, restore: function () { }, setTransform: function () { },
    beginPath: function () { }, closePath: function () { }, fill: function () { }, stroke: function () { }
  };
  /* 有些浏览器没有 ctx.letterSpacing（Firefox < 89 等），可单独覆盖该回退分支 */
  if (opts.noLetterSpacing) delete ctx.letterSpacing;
  const canvas = doc.createElement('canvas');
  canvas.width = 0; canvas.height = 0;
  canvas.getContext = function () { return ctx; };
  doc.register('screen', canvas);

  const uiHost = doc.createElement('div');
  doc.register('ui', uiHost);
  doc.body.appendChild(canvas);
  doc.body.appendChild(uiHost);

  /* ---------- 事件 / rAF / 存储 ---------- */
  const listeners = {};
  const rafQ = [];
  let nowMs = 0;
  let rafId = 1;
  const store = Object.assign({}, opts.storage || {});

  const win = {
    document: doc,
    console: opts.silent ? { log() { }, warn() { }, error() { } } : console,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: setInterval, clearInterval: clearInterval,
    performance: { now: function () { return nowMs; } },
    devicePixelRatio: opts.dpr || 2,
    innerWidth: opts.width || 1280,
    innerHeight: opts.height || 720,
    navigator: {
      userAgent: 'node-harness', maxTouchPoints: opts.touch ? 5 : 0,
      platform: 'Win32', language: 'zh-CN'
    },
    location: { href: 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html' },
    matchMedia: function (q) { return { matches: !!opts.touch && /coarse/.test(q), media: q, addListener() { }, removeListener() { } }; },
    requestAnimationFrame: function (cb) { rafQ.push(cb); return rafId++; },
    cancelAnimationFrame: function () { },
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: function (t, fn) {
      const l = listeners[t] || [];
      const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
    },
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; },
      clear: function () { for (const k in store) delete store[k]; }
    },
    alert: function () { }, prompt: function () { return null; }
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;

  /* 需要时给沙箱装上 DeviceOrientationEvent（含 iOS 的授权接口） */
  if (opts.gyro) {
    var DOE = function DeviceOrientationEvent() { };
    DOE.requestPermission = function () {
      var res = opts.gyroPermission || 'granted';
      return { then: function (f) { f(res); return { catch: function () { } }; } };
    };
    win.DeviceOrientationEvent = DOE;
  }

  const context = vm.createContext(win);
  vm.runInContext('globalThis.window = globalThis;', context);

  const errors = [];
  for (const f of files) {
    try {
      vm.runInContext(readFile(f), context, { filename: f });
    } catch (e) {
      errors.push({ file: f, error: e });
    }
  }

  const api = {
    win, doc, ctx, ctxCalls, files, styles, store, errors, sandbox: context,
    get AFP() { return win.AFP; },
    get hook() { return win.__ASCIIFPV__; },
    /* 手动推进一帧动画（rAF 队列） */
    tick: function (dtMs) {
      dtMs = dtMs === undefined ? 16.7 : dtMs;
      nowMs += dtMs;
      const q = rafQ.splice(0, rafQ.length);
      for (const cb of q) cb(nowMs);
      return q.length;
    },
    dispatch: function (type, ev) {
      ev = ev || {};
      ev.type = type;
      if (!ev.target) ev.target = { closest: function () { return null; } };
      if (!ev.preventDefault) ev.preventDefault = function () { ev.defaultPrevented = true; };
      const l = (listeners[type] || []).slice();
      for (const fn of l) fn(ev);
      return l.length;
    },
    now: function () { return nowMs; }
  };
  return api;
}

module.exports = { boot, scriptList, styleList, ROOT, readFile };
