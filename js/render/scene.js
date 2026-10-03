/* =====================================================================
   ASCII FPV · 场景绘制（楼房 / 树木 / 空中障碍物）
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, cfg = AFP.cfg, S = AFP.S, U = AFP.util;
  var V = AFP.render.view, P = AFP.render.pal, R = AFP.render.raster, W = AFP.world;

  /* 一面墙：把 4 个顶点交给光栅化器，材质 uv 就是墙面的真实长宽（米） */
  function quadWall(xa, za, xb, zb, h, mat, b, light) {
    var len = Math.sqrt((xb - xa) * (xb - xa) + (zb - za) * (zb - za));
    var FACE = R.FACE;
    FACE.kind = 0; FACE.mat = mat; FACE.light = light; FACE.uMax = len; FACE.vMax = h;
    FACE.seed = b.seed; FACE.lit = b.lit;
    R.pvReset();
    R.pv(xa, 0, za, 0, 0); R.pv(xb, 0, zb, len, 0); R.pv(xb, h, zb, len, h); R.pv(xa, h, za, 0, h);
    R.drawPoly();
  }

  function drawBuilding(b, ox, oz) {
    var x0 = ox + b.x, z0 = oz + b.z, x1 = x0 + b.w, z1 = z0 + b.d, h = b.h;
    var dx = (x0 + x1) * 0.5 - S.camX, dy = h * 0.5 - S.camY, dz = (z0 + z1) * 0.5 - S.camZ;
    var rad = 0.5 * Math.sqrt(b.w * b.w + b.d * b.d + h * h);
    var zc = dx * S.fwX + dy * S.fwY + dz * S.fwZ;
    if (zc < -rad) return;
    var d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > (cfg.VIEW + rad) * (cfg.VIEW + rad)) return;
    var lim = zc > 1 ? zc : 1;
    if (Math.abs(dx * S.rtX + dy * S.rtY + dz * S.rtZ) - rad > lim * V.hTan) return;
    if (Math.abs(dx * S.upX + dy * S.upY + dz * S.upZ) - rad > lim * V.vTan) return;
    var mat = P.M_WALL[(b.mat | 0) % P.M_WALL.length];
    if (S.camX > x1) quadWall(x1, z0, x1, z1, h, mat, b, 0.88);
    if (S.camX < x0) quadWall(x0, z1, x0, z0, h, mat, b, 0.50);
    if (S.camZ > z1) quadWall(x1, z1, x0, z1, h, mat, b, 0.45);
    if (S.camZ < z0) quadWall(x0, z0, x1, z0, h, mat, b, 0.72);
    if (S.camY > h) {
      var FACE = R.FACE;
      FACE.kind = 1; FACE.mat = P.M_ROOF; FACE.light = 1.0; FACE.uMax = b.w; FACE.vMax = b.d;
      FACE.seed = b.seed; FACE.lit = b.lit;
      R.pvReset();
      R.pv(x0, h, z0, 0, 0); R.pv(x1, h, z0, b.w, 0); R.pv(x1, h, z1, b.w, b.d); R.pv(x0, h, z1, 0, b.d);
      R.drawPoly();
    }
  }

  var BUF = AFP.render.buf;
  function drawTree(t, ox, oz) {
    var wx = ox + t.x, wz = oz + t.z, fyc = t.h * 0.70;
    var dx = wx - S.camX, dy = fyc - S.camY, dz = wz - S.camZ;
    var zc = dx * S.fwX + dy * S.fwY + dz * S.fwZ;
    if (zc < cfg.NEAR + t.r) return;
    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > 330) return;
    var xc = dx * S.rtX + dy * S.rtY + dz * S.rtZ, yc = dx * S.upX + dy * S.upY + dz * S.upZ;
    var px = V.cxF + xc / zc * V.sxS, py = V.cyF - yc / zc * V.syS;
    var rpx = V.sxS * t.r / zc, rpy = V.syS * t.r / zc;
    if (px < -rpx - 2 || px > V.COLS + rpx + 2 || py < -rpy - 2 || py > V.ROWS + rpy + 2) return;
    var fg = R.fogAt(dist);
    var ex = rpx < 0.5 ? 0.5 : rpx, ey = rpy < 0.5 ? 0.5 : rpy;
    var COLS = V.COLS, ROWS = V.ROWS, chars = BUF.chars, colr = BUF.colr, zbuf = BUF.zbuf;
    var x0 = Math.floor(px - ex); if (x0 < 0) x0 = 0;
    var x1 = Math.ceil(px + ex); if (x1 > COLS - 1) x1 = COLS - 1;
    var y0 = Math.floor(py - ey); if (y0 < 0) y0 = 0;
    var y1 = Math.ceil(py + ey); if (y1 > ROWS - 1) y1 = ROWS - 1;
    for (var y = y0; y <= y1; y++) {
      var ny = (y + 0.5 - py) / ey;
      for (var x = x0; x <= x1; x++) {
        var nx = (x + 0.5 - px) / ex;
        var q = nx * nx + ny * ny;
        if (q > 1) continue;
        var zz = zc - t.r * Math.sqrt(1 - q) * 0.9, iz = 1 / zz;
        var idx = y * COLS + x;
        if (iz <= zbuf[idx]) continue;
        var nse = U.hash3(t.seed, (nx * 3.5 + 16) | 0, (ny * 3.5 + 16) | 0);
        R.setStyle(P.M_LEAF, fg * (0.55 + 0.45 * (1 - q)) * (0.72 + 0.5 * nse), 0);
        if (R.outC() !== 32) { chars[idx] = R.outC(); colr[idx] = R.outS(); zbuf[idx] = iz; }   // 树冠有缝隙
      }
    }
    if (rpx > 0.9) R.drawLine3D(wx, 0, wz, wx, t.h * 0.62, wz, 124, P.M_TRUNK, 0.95);
  }

  function drawCity() {
    var range = cfg.VIEW + 40;
    var bx0 = Math.floor((S.camX - range) / cfg.BLOCK), bx1 = Math.floor((S.camX + range) / cfg.BLOCK);
    var bz0 = Math.floor((S.camZ - range) / cfg.BLOCK), bz1 = Math.floor((S.camZ + range) / cfg.BLOCK);
    for (var bz = bz0; bz <= bz1; bz++) {
      for (var bx = bx0; bx <= bx1; bx++) {
        var ox = bx * cfg.BLOCK, oz = bz * cfg.BLOCK;
        var dx = ox + cfg.BLOCK * 0.5 - S.camX, dz = oz + cfg.BLOCK * 0.5 - S.camZ;
        if (dx * dx + dz * dz > (range + 50) * (range + 50)) continue;
        var dy = 45 - S.camY;
        if (dx * S.fwX + dy * S.fwY + dz * S.fwZ < -95) continue;
        var blk = W.blockAt(bx, bz);
        var i, arr = blk.buildings;
        for (i = 0; i < arr.length; i++) drawBuilding(arr[i], ox, oz);
        if (dx * dx + dz * dz < 340 * 340) {
          arr = blk.trees;
          for (i = 0; i < arr.length; i++) drawTree(arr[i], ox, oz);
        }
      }
    }
  }

  AFP.render.scene = { drawCity: drawCity, drawBuilding: drawBuilding, drawTree: drawTree, quadWall: quadWall };
})(typeof window !== 'undefined' ? window : globalThis);
