/* =====================================================================
   ASCII FPV · 光栅化核心
   ---------------------------------------------------------------------
   透视投影 + 1/z 深度缓冲 + 逐字符着色 + 近裁剪面 Sutherland-Hodgman。
   输出目标是字符单元格而非像素。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, cfg = AFP.cfg, S = AFP.S;
  var V = AFP.render.view, BUF = AFP.render.buf, P = AFP.render.pal;
  var LEVELS = cfg.LEVELS;

  var OUT_C = 32, OUT_S = 0;
  function setStyle(m, b, ch) {
    var lv = (b * LEVELS) | 0;
    if (lv < 0) lv = 0; else if (lv >= LEVELS) lv = LEVELS - 1;
    OUT_S = m.pal + lv;
    OUT_C = ch > 0 ? ch : m.chars[lv];
  }
  function fogAt(d) { return Math.exp(-d / cfg.FOGD); }

  /* ------------------------- 面着色 ------------------------- */
  var WINU = 4.6, WINV = 3.7;
  var FACE = { kind: 0, mat: P.M_WALL[0], light: 1, uMax: 1, vMax: 1, seed: 0, lit: 0.3 };
  function shadeFace(u, v, dist) {
    var fg = fogAt(dist);
    var ppc = dist / V.sxS;                      // 该处 1 个字符格约等于多少米
    if (FACE.kind === 0) {                       // ── 墙面
      var b = FACE.light * fg;
      var eW = Math.min(2.4, 0.5 + 0.55 * ppc);  // 轮廓棱线随距离加宽，远处楼体也成形
      if (u < eW || u > FACE.uMax - eW || v > FACE.vMax - eW) {
        setStyle(FACE.mat, b * 1.55 + 0.10, 35); return;
      }
      if (v > 4.4 && v < FACE.vMax - 2.0 && ppc < 2.6) {             // 窗格
        var wu = u - Math.floor(u / WINU) * WINU, wv = v - Math.floor(v / WINV) * WINV;
        if (wu > 1.15 && wu < WINU - 1.15 && wv > 0.95 && wv < WINV - 1.0) {
          if (AFP.util.hash3(FACE.seed, Math.floor(u / WINU), Math.floor(v / WINV)) < FACE.lit) setStyle(P.M_WINL, fg * 1.05, 0);
          else setStyle(P.M_WIND, fg * 0.5, 0);
          return;
        }
      }
      setStyle(FACE.mat, b, 0);
    } else {                                     // ── 屋顶
      var rb = FACE.light * fg;
      var pW = Math.min(3.6, 0.9 + 0.8 * ppc);                       // 女儿墙
      if (u < pW || u > FACE.uMax - pW || v < pW || v > FACE.vMax - pW) { setStyle(P.M_ROOF, rb * 1.3 + 0.08, 35); return; }
      var n = AFP.util.hash3(FACE.seed ^ 0x77, Math.floor(u * 0.5), Math.floor(v * 0.5));
      if (n > 0.9) { setStyle(P.M_ROOF, rb * 1.25, 61); return; }       // 屋顶设备
      setStyle(P.M_ROOF, rb * (0.78 + 0.3 * n), 0);
    }
  }

  /* ------------------------- 多边形光栅化 ------------------------- */
  var PVB = [], CVB = [], SPB = [], pvN = 0;
  for (var _i = 0; _i < 12; _i++) {
    PVB.push(new Float64Array(5)); CVB.push(new Float64Array(5)); SPB.push(new Float64Array(5));
  }
  /* 世界坐标 → 相机坐标（x 右 / y 上 / z 前），连同材质 uv 一起存入 PVB */
  function pv(wx, wy, wz, u, v) {
    var dx = wx - S.camX, dy = wy - S.camY, dz = wz - S.camZ, a = PVB[pvN++];
    a[0] = dx * S.rtX + dy * S.rtY + dz * S.rtZ;
    a[1] = dx * S.upX + dy * S.upY + dz * S.upZ;
    a[2] = dx * S.fwX + dy * S.fwY + dz * S.fwZ;
    a[3] = u; a[4] = v;
  }
  function rasterTri(A, B, C) {
    var COLS = V.COLS, ROWS = V.ROWS, zbuf = BUF.zbuf, chars = BUF.chars, colr = BUF.colr;
    var minX = Math.floor(Math.min(A[0], B[0], C[0])); if (minX < 0) minX = 0;
    var maxX = Math.ceil(Math.max(A[0], B[0], C[0])); if (maxX > COLS - 1) maxX = COLS - 1;
    var minY = Math.floor(Math.min(A[1], B[1], C[1])); if (minY < 0) minY = 0;
    var maxY = Math.ceil(Math.max(A[1], B[1], C[1])); if (maxY > ROWS - 1) maxY = ROWS - 1;
    if (minX > maxX || minY > maxY) return;
    var area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    if (area > -1e-9 && area < 1e-9) return;
    var inv = 1 / area;
    for (var y = minY; y <= maxY; y++) {
      var py = y + 0.5, row = y * COLS;
      for (var x = minX; x <= maxX; x++) {
        var px = x + 0.5;
        var w0 = ((B[0] - px) * (C[1] - py) - (B[1] - py) * (C[0] - px)) * inv;
        if (w0 < -1e-7) continue;
        var w1 = ((C[0] - px) * (A[1] - py) - (C[1] - py) * (A[0] - px)) * inv;
        if (w1 < -1e-7) continue;
        var w2 = 1 - w0 - w1;
        if (w2 < -1e-7) continue;
        var iz = w0 * A[2] + w1 * B[2] + w2 * C[2];
        var idx = row + x;
        if (iz <= zbuf[idx]) continue;
        var uu = (w0 * A[3] + w1 * B[3] + w2 * C[3]) / iz;
        var vv = (w0 * A[4] + w1 * B[4] + w2 * C[4]) / iz;
        shadeFace(uu, vv, 1 / iz);
        chars[idx] = OUT_C; colr[idx] = OUT_S; zbuf[idx] = iz;   // 不透明面：空格也遮挡
      }
    }
  }
  /* 取走 PVB 里累积的顶点，近裁剪后扇形三角化 */
  function drawPoly() {
    var n = pvN; pvN = 0;
    var src = PVB, cnt = n, i, k, need = false;
    for (i = 0; i < n; i++) if (PVB[i][2] < cfg.NEAR) { need = true; break; }
    if (need) {
      cnt = 0;
      for (i = 0; i < n; i++) {
        var A = PVB[i], B = PVB[(i + 1) % n];
        var ia = A[2] >= cfg.NEAR, ib = B[2] >= cfg.NEAR;
        if (ia) { CVB[cnt++].set(A); if (cnt >= 11) break; }
        if (ia !== ib) {
          var t = (cfg.NEAR - A[2]) / (B[2] - A[2]), o = CVB[cnt++];
          for (k = 0; k < 5; k++) o[k] = A[k] + (B[k] - A[k]) * t;
          o[2] = cfg.NEAR;
          if (cnt >= 11) break;
        }
      }
      src = CVB;
    }
    if (cnt < 3) return;
    for (i = 0; i < cnt; i++) {
      var s = SPB[i], a = src[i], iz = 1 / a[2];
      s[0] = V.cxF + a[0] * iz * V.sxS; s[1] = V.cyF - a[1] * iz * V.syS;
      s[2] = iz; s[3] = a[3] * iz; s[4] = a[4] * iz;
    }
    for (i = 1; i + 1 < cnt; i++) rasterTri(SPB[0], SPB[i], SPB[i + 1]);
  }

  /* 深度测试的 3D 线段：树干、光环、拉杆等细线元素 */
  function drawLine3D(ax, ay, az, bx, by, bz, ch, mat, bright) {
    var COLS = V.COLS, ROWS = V.ROWS, zbuf = BUF.zbuf, chars = BUF.chars, colr = BUF.colr;
    var x0 = ax - S.camX, y0 = ay - S.camY, z0 = az - S.camZ;
    var X0 = x0 * S.rtX + y0 * S.rtY + z0 * S.rtZ, Y0 = x0 * S.upX + y0 * S.upY + z0 * S.upZ, Z0 = x0 * S.fwX + y0 * S.fwY + z0 * S.fwZ;
    var x1 = bx - S.camX, y1 = by - S.camY, z1 = bz - S.camZ;
    var X1 = x1 * S.rtX + y1 * S.rtY + z1 * S.rtZ, Y1 = x1 * S.upX + y1 * S.upY + z1 * S.upZ, Z1 = x1 * S.fwX + y1 * S.fwY + z1 * S.fwZ;
    if (Z0 < cfg.NEAR && Z1 < cfg.NEAR) return;
    var t;
    if (Z0 < cfg.NEAR) { t = (cfg.NEAR - Z0) / (Z1 - Z0); X0 += (X1 - X0) * t; Y0 += (Y1 - Y0) * t; Z0 = cfg.NEAR; }
    else if (Z1 < cfg.NEAR) { t = (cfg.NEAR - Z1) / (Z0 - Z1); X1 += (X0 - X1) * t; Y1 += (Y0 - Y1) * t; Z1 = cfg.NEAR; }
    var p0x = V.cxF + X0 / Z0 * V.sxS, p0y = V.cyF - Y0 / Z0 * V.syS, i0 = 1 / Z0;
    var p1x = V.cxF + X1 / Z1 * V.sxS, p1y = V.cyF - Y1 / Z1 * V.syS, i1 = 1 / Z1;
    var n = Math.ceil(Math.max(Math.abs(p1x - p0x), Math.abs(p1y - p0y)));
    if (n < 1) n = 1; if (n > 400) return;
    for (var kk = 0; kk <= n; kk++) {
      var tt = kk / n, px = p0x + (p1x - p0x) * tt, py = p0y + (p1y - p0y) * tt, iz = i0 + (i1 - i0) * tt;
      if (px < 0 || py < 0) continue;
      var xi = px | 0, yi = py | 0;
      if (xi >= COLS || yi >= ROWS) continue;
      var idx = yi * COLS + xi;
      if (iz <= zbuf[idx]) continue;
      setStyle(mat, bright * fogAt(1 / iz), ch);
      if (OUT_C !== 32) { chars[idx] = OUT_C; colr[idx] = OUT_S; zbuf[idx] = iz; }
    }
  }

  AFP.render.raster = {
    setStyle: setStyle, fogAt: fogAt, shadeFace: shadeFace, pv: pv,
    rasterTri: rasterTri, drawPoly: drawPoly, drawLine3D: drawLine3D,
    FACE: FACE,
    outC: function () { return OUT_C; }, outS: function () { return OUT_S; },
    pvReset: function () { pvN = 0; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
