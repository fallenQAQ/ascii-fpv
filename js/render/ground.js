/* =====================================================================
   ASCII FPV · 地面（逐字符投射光线）
   ---------------------------------------------------------------------
   不做几何体，直接对每个字符格从相机投射一条射线与 y=0 平面求交，
   再按世界坐标程序化着色 —— 道路 / 人行道 / 标线 / 草地全部由此生成。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, cfg = AFP.cfg, S = AFP.S, U = AFP.util;
  var V = AFP.render.view, BUF = AFP.render.buf, P = AFP.render.pal;

  /* 每个街区可以覆盖地面材质（生物群系用：水面 / 裸土） */
  var groundOverride = null;
  function setGroundOverride(fn) { groundOverride = fn; }

  function shadeGround(wx, wz, dist) {
    if (groundOverride && groundOverride(wx, wz, dist)) return;
    var BLOCK = cfg.BLOCK, ROADW = cfg.ROADW;
    var mx = wx - Math.floor(wx / BLOCK) * BLOCK, mz = wz - Math.floor(wz / BLOCK) * BLOCK;
    var fg = AFP.render.raster.fogAt(dist);
    var rX = mx < ROADW, rZ = mz < ROADW;
    if (rX || rZ) {
      var sw = Math.min(3.4, 1.7 + 0.55 * (dist / V.sxS));   // 远处人行道加宽，路网仍成线
      var eX = rX ? Math.min(mx, ROADW - mx) : 99, eZ = rZ ? Math.min(mz, ROADW - mz) : 99;
      if (Math.min(eX, eZ) < sw) { AFP.render.raster.setStyle(P.M_WALK, fg * 0.95, 0); return; }
      if (dist < 175) {                                       // 中心虚线
        if (rX && !rZ && Math.abs(mx - ROADW * 0.5) < 0.6 && (wz - Math.floor(wz / 9) * 9) < 4.5) { AFP.render.raster.setStyle(P.M_MARK, fg * 1.1, 61); return; }
        if (rZ && !rX && Math.abs(mz - ROADW * 0.5) < 0.6 && (wx - Math.floor(wx / 9) * 9) < 4.5) { AFP.render.raster.setStyle(P.M_MARK, fg * 1.1, 61); return; }
      }
      AFP.render.raster.setStyle(P.M_ROAD, fg * 0.88, 0); return;
    }
    var det = dist < 110 ? 1 : Math.max(0, 1 - (dist - 110) / 170);
    var gs = 0.55 / (1 + dist / 220);                        // 远处纹理变粗，减少抖动
    var n0 = U.hash3(Math.floor(wx * gs), Math.floor(wz * gs), 7);
    if (n0 < 0.40) { AFP.render.raster.setStyle(P.M_GRASS, 0, 0); return; }   // 留黑底，画面更透气
    var nn = 0.5 + (n0 - 0.5) * det;
    AFP.render.raster.setStyle(P.M_GRASS, fg * (0.45 + 0.6 * nn), 0);
  }

  function drawGround() {
    if (S.camY <= 0.05) return;
    var COLS = V.COLS, ROWS = V.ROWS, chars = BUF.chars, colr = BUF.colr, zbuf = BUF.zbuf;
    var cxF = V.cxF, cyF = V.cyF, sxS = V.sxS, syS = V.syS;
    for (var y = 0; y < ROWS; y++) {
      var b = (cyF - (y + 0.5)) / syS, row = y * COLS;
      var dyR = b * S.upY, byX = b * S.upX, byZ = b * S.upZ;
      for (var x = 0; x < COLS; x++) {
        var a = ((x + 0.5) - cxF) / sxS;
        var dY = a * S.rtY + dyR + S.fwY;
        if (dY > -1e-4) continue;
        var t = S.camY / -dY;
        if (t < cfg.NEAR || t > cfg.VIEW) continue;
        var wx = S.camX + t * (a * S.rtX + byX + S.fwX);
        var wz = S.camZ + t * (a * S.rtZ + byZ + S.fwZ);
        var dist = t * Math.sqrt(a * a + b * b + 1);
        shadeGround(wx, wz, dist);
        var idx = row + x;
        chars[idx] = AFP.render.raster.outC(); colr[idx] = AFP.render.raster.outS(); zbuf[idx] = 1 / t;
      }
    }
  }

  AFP.render.ground = { drawGround: drawGround, shadeGround: shadeGround, setGroundOverride: setGroundOverride };
})(typeof window !== 'undefined' ? window : globalThis);
