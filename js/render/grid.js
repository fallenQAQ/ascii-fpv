/* =====================================================================
   ASCII FPV · 字符网格屏幕
   ---------------------------------------------------------------------
   把画布切成 COLS x ROWS 个等宽字符格，维护每格的字符/颜色/深度缓冲，
   最后按颜色分段批量 fillText —— 比逐格绘制快得多。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, cfg = AFP.cfg, U = AFP.util;
  var V = AFP.render.view = AFP.render.view || {};
  var BUF = AFP.render.buf = AFP.render.buf || {};

  V.FONT = '"Cascadia Mono","Consolas","DejaVu Sans Mono","Courier New",monospace';
  V.COLS = 0; V.ROWS = 0;
  V.cellW = 10; V.cellH = 18; V.offX = 0; V.offY = 0; V.baseY = 14;
  V.cxF = 0; V.cyF = 0; V.sxS = 1; V.syS = 1; V.hTan = 1; V.vTan = 1;
  V.targetCols = 152;          // 期望列数（字号由此反推）
  V.autoCols = 152;            // 按设备自动档的期望列数
  V.MIN_COLS = 84;             // 密度下限：实测保持可玩性的最小网格 84 × 25
  V.MIN_ROWS = 25;
  V.MAX_COLS = 300;
  V.MAX_TARGET = 800;          // 期望列数的搜索上界（字号到 7px 下限后不再变化）
  V.minGrid = { COLS: 84, ROWS: 25 };
  V.isTouch = false;
  V.canvas = null;
  V.ctx = null;
  V.fontspec = '';
  V.lspace = '0px';
  V.hasLS = false;

  BUF.chars = new Uint16Array(0);
  BUF.colr = new Uint16Array(0);
  BUF.zbuf = new Float32Array(0);

  function detectTouch(win) {
    if (typeof win === 'undefined' || !win) return false;
    var t = false;
    if (win.matchMedia) t = win.matchMedia('(pointer: coarse)').matches;
    else t = ('ontouchstart' in win) || ((win.navigator && win.navigator.maxTouchPoints) | 0) > 0;
    var min = Math.min(win.innerWidth || 0, win.innerHeight || 0);
    /* 小屏触屏设备自动降密度：字符更大、帧率更稳 */
    V.autoCols = (t && min > 0 && min < 760) ? 96 : 152;
    V.targetCols = V.autoCols;
    return t;
  }

  function init(canvas, win) {
    V.canvas = canvas;
    V.ctx = canvas.getContext('2d', { alpha: false });
    V.hasLS = ('letterSpacing' in V.ctx);
    V.isTouch = detectTouch(win);
    return V.ctx;
  }

  /* 只做计算、不分配缓冲：给定期望列数，算出真正会排到屏幕上的网格 */
  function measureGrid(target) {
    var ctx = V.ctx, canvas = V.canvas;
    var fpx = Math.max(7, canvas.width / (target * 0.6));
    if (V.hasLS) ctx.letterSpacing = '0px';
    ctx.font = fpx.toFixed(2) + 'px ' + V.FONT;
    var adv = ctx.measureText('MMMMMMMMMM').width / 10;
    var cellW = V.hasLS ? Math.max(4, Math.round(adv)) : Math.max(4, adv);
    var cellH = Math.max(6, Math.round(fpx * 1.08));
    return {
      fpx: fpx, adv: adv, cellW: cellW, cellH: cellH,
      COLS: Math.floor(canvas.width / cellW),
      ROWS: Math.floor(canvas.height / cellH)
    };
  }

  /* 把期望列数解析成「不低于可玩性下限」的网格。
     字号越大网格越疏，所以请求低于下限时，要二分出「刚好满足 84 × 25」
     的那个请求（而不是按固定倍率跳，否则会越过真正的下限）。
     这是个纯函数：列数 / 行数随请求单调不减，setColumns 的二分才成立。 */
  function meets(m) { return m.COLS >= V.MIN_COLS && m.ROWS >= V.MIN_ROWS; }
  function resolveFor(target) {
    var m = measureGrid(target);
    if (meets(m)) return { target: target, m: m };
    var hi = V.MAX_TARGET;
    m = measureGrid(hi);
    if (!meets(m)) return { target: hi, m: m };      // 窗口太极端，尽力而为
    var lo = target, i;
    for (i = 0; i < 18; i++) {
      var mid = (lo + hi) * 0.5;
      if (meets(measureGrid(mid))) hi = mid; else lo = mid;
    }
    return { target: hi, m: measureGrid(hi) };
  }

  /* 当前窗口下允许的最小密度（列最少、字最大）排出来的网格 */
  function minGrid() {
    return resolveFor(V.MIN_COLS).m;
  }

  /* 把字体大小设成能从 canvas.width 里正好排出 V.targetCols 列 */
  function layout() {
    var ctx = V.ctx, canvas = V.canvas;
    var win = g;
    var dpr = Math.min(2, (win.devicePixelRatio || 1));
    var cssW = Math.max(320, win.innerWidth || 320), cssH = Math.max(240, win.innerHeight || 240);
    canvas.width = Math.floor(cssW * dpr); canvas.height = Math.floor(cssH * dpr);
    if (canvas.style) { canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px'; }
    var r = resolveFor(V.targetCols);
    var m = r.m;
    V.effTarget = Math.round(r.target * 100) / 100;   // 实际生效的期望列数（含下限抬高）
    V.fontspec = m.fpx.toFixed(2) + 'px ' + V.FONT;
    ctx.font = V.fontspec;
    V.cellW = m.cellW;
    V.cellH = m.cellH;
    V.lspace = V.hasLS ? (V.cellW - m.adv).toFixed(3) + 'px' : '0px';
    V.baseY = Math.round(V.cellH * 0.80);
    V.COLS = Math.max(1, m.COLS);
    V.ROWS = Math.max(1, m.ROWS);
    V.minGrid = minGrid();                            // 供界面禁用「-」按钮
    V.offX = Math.floor((canvas.width - V.COLS * V.cellW) / 2);
    V.offY = Math.floor((canvas.height - V.ROWS * V.cellH) / 2);
    BUF.chars = new Uint16Array(V.COLS * V.ROWS);
    BUF.colr = new Uint16Array(V.COLS * V.ROWS);
    BUF.zbuf = new Float32Array(V.COLS * V.ROWS);
    V.cxF = V.COLS * 0.5; V.cyF = V.ROWS * 0.5;
    V.sxS = (V.COLS * 0.5) / Math.tan(cfg.FOVX * 0.5);
    V.syS = V.sxS * (V.cellW / V.cellH);
    V.hTan = (V.COLS * 0.5) / V.sxS * 1.15;
    V.vTan = (V.ROWS * 0.5) / V.syS * 1.15;
  }

  function setupGrid() {
    layout();
  }

  /* 字符格宽度取整后，「实际列数」只能取离散值（例如 150 / 160 …），
     所以直接写 targetCols 会让设置里显示的列数和画面上真正排出来的
     列数对不上。这里改成以「实际列数」为准：
     二分 targetCols（列数随它单调不减），再在候选值里挑最接近 want 的，
     最后把这个收敛后的 targetCols 留在 V 上（窗口缩放也保持一致）。 */
  function setColumns(want) {
    want = Math.round(U.clamp(want, V.MIN_COLS, V.MAX_COLS));
    var lo = V.MIN_COLS, hi = V.MAX_COLS, i;
    for (i = 0; i < 10; i++) {
      var mid = (lo + hi) * 0.5;
      V.targetCols = mid; layout();
      if (V.COLS < want) lo = mid; else hi = mid;
    }
    var cands = [lo, hi, V.MIN_COLS, V.MAX_COLS];
    var bestT = lo, bestErr = Infinity, bestCols = -1;
    for (i = 0; i < cands.length; i++) {
      V.targetCols = cands[i]; layout();
      var err = Math.abs(V.COLS - want);
      if (err < bestErr || (err === bestErr && V.COLS < bestCols)) {
        bestErr = err; bestT = cands[i]; bestCols = V.COLS;
      }
    }
    V.targetCols = Math.round(bestT * 100) / 100;
    layout();
    return V.COLS;
  }

  /* 回到「按设备自动」档 */
  function setAutoColumns() {
    V.targetCols = V.autoCols;
    layout();
    return V.COLS;
  }

  function clear() {
    BUF.chars.fill(32); BUF.colr.fill(0); BUF.zbuf.fill(0);
  }

  /* 把字符网格刷到画布：同色连续段一次 fillText */
  function blit() {
    var ctx = V.ctx, canvas = V.canvas, PAL = AFP.render.pal.PAL;
    var chars = BUF.chars, colr = BUF.colr;
    var COLS = V.COLS, ROWS = V.ROWS, cellW = V.cellW, cellH = V.cellH;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = V.fontspec;
    if (V.hasLS) ctx.letterSpacing = V.lspace;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    for (var y = 0; y < ROWS; y++) {
      var row = y * COLS, yy = V.offY + y * cellH + V.baseY, x = 0;
      while (x < COLS) {
        var c = chars[row + x];
        if (c === 32 || c === 0) { x++; continue; }
        var st = colr[row + x], x2 = x + 1;
        while (x2 < COLS) {
          var c2 = chars[row + x2];
          if (c2 === 32 || c2 === 0 || colr[row + x2] !== st) break;
          x2++;
        }
        ctx.fillStyle = PAL[st];
        ctx.fillText(String.fromCharCode.apply(null, chars.subarray(row + x, row + x2)), V.offX + x * cellW, yy);
        x = x2;
      }
    }
  }

  AFP.render.grid = {
    V: V, BUF: BUF, init: init, setupGrid: setupGrid, layout: layout,
    setColumns: setColumns, setAutoColumns: setAutoColumns,
    clear: clear, blit: blit, detectTouch: detectTouch
  };
})(typeof window !== 'undefined' ? window : globalThis);
