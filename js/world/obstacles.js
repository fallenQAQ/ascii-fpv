/* =====================================================================
   ASCII FPV · 空中移动障碍物
   ---------------------------------------------------------------------
   三类：气球（缓慢漂移 + 上下浮动）、飞行器（固定翼，绕圈巡航）、
   无人机（小半径巡逻 + 闪烁航行灯）。
   位置由「生成参数 + 当前时间」确定性算出，不需要每帧同步状态，
   因此碰撞与渲染看到的一定是同一个位置。所有障碍物都生成在所在
   街区楼顶之上，不会穿楼。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, cfg = AFP.cfg, U = AFP.util, W = AFP.world, S = AFP.S;
  var P = AFP.render.pal, V = AFP.render.view, R = AFP.render.raster, BUF = AFP.render.buf;

  var O = W.obstacles = {};

  /* 各群系的障碍物倾向：公园多气球、工业区多无人机 */
  var DENSITY = {
    downtown: { balloon: 0.30, plane: 0.40, drone: 0.30, n: 1.4 },
    midtown: { balloon: 0.38, plane: 0.34, drone: 0.28, n: 1.2 },
    suburb: { balloon: 0.58, plane: 0.16, drone: 0.26, n: 0.9 },
    industry: { balloon: 0.16, plane: 0.30, drone: 0.54, n: 1.1 },
    park: { balloon: 0.76, plane: 0.08, drone: 0.16, n: 1.6 },
    city: { balloon: 0.38, plane: 0.34, drone: 0.28, n: 1.2 }
  };

  function maxHeight(blk) {
    var m = 0;
    for (var i = 0; i < blk.buildings.length; i++) if (blk.buildings[i].h > m) m = blk.buildings[i].h;
    return m;
  }
  /* 3x3 邻域最高楼：巡航半径不超过一个街区的飞行器不会撞到隔壁的塔楼 */
  function neighborhoodTop(bx, bz) {
    var m = 0;
    for (var j = -1; j <= 1; j++) {
      for (var i = -1; i <= 1; i++) {
        var h = maxHeight(W.blockAt(bx + i, bz + j));
        if (h > m) m = h;
      }
    }
    return m;
  }

  function genObs(blk) {
    var rnd = U.mulberry32((blk.bx * 40503) ^ (blk.bz * 12289) ^ 0x2b7e1516);
    var d = DENSITY[blk.biome] || DENSITY.midtown;
    var top = maxHeight(blk), ntop = neighborhoodTop(blk.bx, blk.bz);
    var obs = [];
    var n = (rnd() * (d.n + 1)) | 0;
    for (var i = 0; i < n; i++) {
      var r = rnd();
      var type = r < d.balloon ? 'balloon' : (r < d.balloon + d.plane ? 'plane' : 'drone');
      var seed = (rnd() * 1e9) | 0;
      var o = {
        type: type, seed: seed, phase: rnd() * Math.PI * 2, mat: (rnd() * P.M_BALLOON.length) | 0,
        x: 10 + rnd() * (cfg.BLOCK - 20), z: 10 + rnd() * (cfg.BLOCK - 20)
      };
      if (type === 'balloon') {
        o.r = 4 + rnd() * 3.4;                       // 气囊半径
        o.y = top + 16 + rnd() * 48;                 // 楼顶之上，且浮动后仍离地 >8m
        o.hitR = o.r + 1.4;
      } else if (type === 'plane') {
        o.R = 55 + rnd() * 55;                       // 巡航半径（不超过一个街区）
        o.dir = rnd() < 0.5 ? 1 : -1;
        o.spd = 14 + rnd() * 16;
        o.y = ntop + 15 + rnd() * 60;
        o.cx = o.x; o.cz = o.z;
        o.hitR = 5.2;
      } else {
        o.R = 12 + rnd() * 26;
        o.dir = 1;
        o.spd = 5 + rnd() * 5;
        o.y = ntop + 8 + rnd() * 34;
        o.cx = o.x; o.cz = o.z;
        o.hitR = 2.0;
      }
      obs.push(o);
    }
    blk.obs = obs;
  }

  /* 当前世界坐标（相对街区原点 ox,oz） */
  function pos(o, ox, oz, out) {
    var t = S.time;
    if (o.type === 'balloon') {
      out[0] = ox + o.x + Math.sin(t * 0.05 + o.phase) * 7;
      out[2] = oz + o.z + Math.cos(t * 0.037 + o.phase) * 6;
      out[1] = o.y + Math.sin(t * 0.23 + o.phase) * 7;
    } else {
      var ang = o.phase + t * o.dir * (o.spd / o.R);
      out[0] = ox + o.cx + Math.cos(ang) * o.R;
      out[2] = oz + o.cz + Math.sin(ang) * o.R;
      if (o.type === 'plane') out[1] = o.y + Math.sin(t * 0.34 + o.phase) * 7;
      else out[1] = o.y + Math.sin(t * 0.9 + o.phase) * 2.6;
    }
    return out;
  }
  O.pos = pos;

  /* 航向（度）：飞行器沿轨迹切线方向 */
  function heading(o, out) {
    if (o.type === 'balloon') { out = 0; return 0; }
    var ang = o.phase + S.time * o.dir * (o.spd / o.R);
    return Math.atan2(o.dir * Math.cos(ang), -o.dir * Math.sin(ang));
  }
  O.heading = heading;

  /* ------------------------- 碰撞 ------------------------- */
  var TMP = [0, 0, 0];
  var hitCalls = 0;
  O.hitBlock = function (blk, ox, oz) {
    var arr = blk.obs;
    if (!arr || !arr.length) return false;
    hitCalls++;
    for (var i = 0; i < arr.length; i++) {
      var o = arr[i];
      pos(o, ox, oz, TMP);
      var dx = TMP[0] - S.camX, dy = TMP[1] - S.camY, dz = TMP[2] - S.camZ;
      var rr = o.hitR + 2.0;
      if (dx * dx + dy * dy + dz * dz < rr * rr) return true;
    }
    return false;
  };
  O.hitCalls = function () { return hitCalls; };
  O.resetHitCalls = function () { hitCalls = 0; };

  /* ------------------------- 绘制 ------------------------- */
  function solidMat(idx) { return { pal: idx, chars: P.M_HULL.chars, ramp: '' }; }
  var NAV_L = solidMat(P.C.C_RED), NAV_R = solidMat(P.C.C_HUD);
  var LAMP = solidMat(P.C.C_AMB);

  /* 椭圆填充（气球气囊 / 篮筐通用）：逐字符投影 + 深度测试 */
  function fillEllipse(cx, cy, ex, ey, zc, r, colorFn) {
    if (ex < 0.5 && ey < 0.5) return false;
    ex = ex < 0.5 ? 0.5 : ex; ey = ey < 0.5 ? 0.5 : ey;
    var COLS = V.COLS, ROWS = V.ROWS, chars = BUF.chars, colr = BUF.colr, zbuf = BUF.zbuf;
    var x0 = Math.floor(cx - ex); if (x0 < 0) x0 = 0;
    var x1 = Math.ceil(cx + ex); if (x1 > COLS - 1) x1 = COLS - 1;
    var y0 = Math.floor(cy - ey); if (y0 < 0) y0 = 0;
    var y1 = Math.ceil(cy + ey); if (y1 > ROWS - 1) y1 = ROWS - 1;
    var any = false;
    for (var y = y0; y <= y1; y++) {
      var ny = (y + 0.5 - cy) / ey;
      for (var x = x0; x <= x1; x++) {
        var nx = (x + 0.5 - cx) / ex;
        var q = nx * nx + ny * ny;
        if (q > 1) continue;
        var zz = zc - r * Math.sqrt(1 - q) * 0.9, iz = 1 / zz;
        var idx = y * COLS + x;
        if (iz <= zbuf[idx]) continue;
        colorFn(nx, ny, 1 - q, iz);
        if (R.outC() !== 32) { chars[idx] = R.outC(); colr[idx] = R.outS(); zbuf[idx] = iz; any = true; }
      }
    }
    return any;
  }

  function drawBalloon(o, wx, wy, wz) {
    var dx = wx - S.camX, dy = wy - S.camY, dz = wz - S.camZ;
    var zc = dx * S.fwX + dy * S.fwY + dz * S.fwZ;
    if (zc < cfg.NEAR + o.r) return;
    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > 470) return;
    var xc = dx * S.rtX + dy * S.rtY + dz * S.rtZ, yc = dx * S.upX + dy * S.upY + dz * S.upZ;
    var px = V.cxF + xc / zc * V.sxS, py = V.cyF - yc / zc * V.syS;
    var rpx = V.sxS * o.r / zc, rpy = V.syS * o.r / zc;
    if (px < -rpx - 2 || px > V.COLS + rpx + 2 || py < -rpy * 3 - 4 || py > V.ROWS + rpy + 2) return;
    var fg = R.fogAt(dist), seed = o.seed, mi = o.mat;
    var matA = P.M_BALLOON[mi], matB = P.M_BALLOON[(mi + 1) % P.M_BALLOON.length];
    var matC = P.M_BALLOON[(mi + 2) % P.M_BALLOON.length];
    /* 气囊：竖向色带 */
    fillEllipse(px, py, rpx, rpy, zc, o.r, function (nx, ny, iq, iz) {
      var band = Math.floor(((Math.atan2(ny, nx) + Math.PI) / (Math.PI * 2)) * 9);
      var stripe = U.hash3(seed, band, 3);
      var m = stripe < 0.34 ? matA : (stripe < 0.67 ? matB : matC);
      R.setStyle(m, fg * (0.55 + 0.5 * iq) * (0.78 + 0.35 * stripe), 0);
    });
    if (rpx < 0.7) return;
    /* 吊绳 + 吊篮 */
    var by = wy - o.r * 1.45;
    R.drawLine3D(wx, wy - o.r * 0.95, wz, wx, by, wz, 124, P.M_BASKET, 0.95);
    var a = Math.max(0.7, o.r * 0.32);
    R.drawLine3D(wx - a, by, wz, wx + a, by, wz, 0, P.M_BASKET, 0.9);
    R.drawLine3D(wx - a, by - o.r * 0.5, wz, wx + a, by - o.r * 0.5, wz, 0, P.M_BASKET, 0.75);
    R.drawLine3D(wx - a, by, wz, wx - a, by - o.r * 0.5, wz, 0, P.M_BASKET, 0.75);
    R.drawLine3D(wx + a, by, wz, wx + a, by - o.r * 0.5, wz, 0, P.M_BASKET, 0.75);
  }

  function drawPlane(o, wx, wy, wz, hd) {
    var dist2 = (wx - S.camX) * (wx - S.camX) + (wy - S.camY) * (wy - S.camY) + (wz - S.camZ) * (wz - S.camZ);
    if (dist2 > 520 * 520) return;
    var fx = Math.sin(hd), fz = Math.cos(hd);
    var sx = Math.cos(hd), sz = -Math.sin(hd);
    var nL = 5.2, wL = 7.0, tL = 2.4;
    /* 机身 */
    R.drawLine3D(wx + fx * nL, wy, wz + fz * nL, wx - fx * nL * 0.8, wy, wz - fz * nL * 0.8, 0, P.M_HULL, 1.0);
    /* 主翼 */
    R.drawLine3D(wx + sx * wL, wy, wz + sz * wL, wx - sx * wL, wy, wz - sz * wL, 0, P.M_WING, 0.92);
    /* 尾翼 + 垂尾 */
    R.drawLine3D(wx - fx * nL * 0.8 + sx * tL, wy, wz - fz * nL * 0.8 + sz * tL,
                 wx - fx * nL * 0.8 - sx * tL, wy, wz - fz * nL * 0.8 - sz * tL, 0, P.M_WING, 0.72);
    R.drawLine3D(wx - fx * nL * 0.8, wy, wz - fz * nL * 0.8,
                 wx - fx * nL * 0.8, wy + 2.2, wz - fz * nL * 0.8, 0, P.M_WING, 0.72);
    /* 航行灯：左红右绿 */
    R.drawLine3D(wx + sx * wL, wy, wz + sz * wL, wx + sx * (wL + 0.05), wy, wz + sz * (wL + 0.05), 42, NAV_L, 0);
    R.drawLine3D(wx - sx * wL, wy, wz - sz * wL, wx - sx * (wL + 0.05), wy, wz - sz * (wL + 0.05), 42, NAV_R, 0);
  }

  function drawDrone(o, wx, wy, wz, hd) {
    var dist2 = (wx - S.camX) * (wx - S.camX) + (wy - S.camY) * (wy - S.camY) + (wz - S.camZ) * (wz - S.camZ);
    if (dist2 > 380 * 380) return;
    var fx = Math.sin(hd), fz = Math.cos(hd);
    var sx = Math.cos(hd), sz = -Math.sin(hd);
    var a = 1.15;
    R.drawLine3D(wx + fx * a + sx * a, wy, wz + fz * a + sz * a, wx - fx * a - sx * a, wy, wz - fz * a - sz * a, 0, P.M_ROTOR, 0.95);
    R.drawLine3D(wx + fx * a - sx * a, wy, wz + fz * a - sz * a, wx - fx * a + sx * a, wy, wz - fz * a + sz * a, 0, P.M_ROTOR, 0.95);
    R.drawLine3D(wx, wy - 0.9, wz, wx, wy + 0.6, wz, 0, P.M_HULL, 1.0);
    /* 闪烁的警示灯 */
    if (((S.time * 2.4 + o.phase) | 0) & 1) {
      R.drawLine3D(wx, wy - 1.1, wz, wx, wy - 1.35, wz, 42, LAMP, 0);
    }
  }

  /* 遍历可见街区绘制全部障碍物 */
  O.draw = function () {
    var range = cfg.VIEW + 40;
    var bx0 = Math.floor((S.camX - range) / cfg.BLOCK), bx1 = Math.floor((S.camX + range) / cfg.BLOCK);
    var bz0 = Math.floor((S.camZ - range) / cfg.BLOCK), bz1 = Math.floor((S.camZ + range) / cfg.BLOCK);
    var out = [0, 0, 0], drawn = 0;
    for (var bz = bz0; bz <= bz1; bz++) {
      for (var bx = bx0; bx <= bx1; bx++) {
        var ox = bx * cfg.BLOCK, oz = bz * cfg.BLOCK;
        var dx = ox + cfg.BLOCK * 0.5 - S.camX, dz = oz + cfg.BLOCK * 0.5 - S.camZ;
        if (dx * dx + dz * dz > (range + 50) * (range + 50)) continue;
        var blk = W.blockAt(bx, bz), arr = blk.obs;
        if (!arr || !arr.length) continue;
        for (var i = 0; i < arr.length; i++) {
          var o = arr[i];
          pos(o, ox, oz, out);
          var vx = out[0] - S.camX, vy = out[1] - S.camY, vz = out[2] - S.camZ;
          if (vx * S.fwX + vy * S.fwY + vz * S.fwZ < -30) continue;      // 背后
          if (o.type === 'balloon') drawBalloon(o, out[0], out[1], out[2]);
          else if (o.type === 'plane') drawPlane(o, out[0], out[1], out[2], heading(o));
          else drawDrone(o, out[0], out[1], out[2], heading(o));
          drawn++;
        }
      }
    }
    return drawn;
  };

  /* 统计（测试 / 调试） */
  O.stats = function () {
    var by = { balloon: 0, plane: 0, drone: 0 }, total = 0, minY = 1e9, maxY = 0, out = [0, 0, 0];
    for (var i = 0; i < W.blocks.length; i++) {
      var blk = W.blocks[i], arr = blk.obs;
      for (var k = 0; k < arr.length; k++) {
        var o = arr[k];
        by[o.type] = (by[o.type] || 0) + 1; total++;
        pos(o, blk.bx * cfg.BLOCK, blk.bz * cfg.BLOCK, out);
        if (out[1] < minY) minY = out[1];
        if (out[1] > maxY) maxY = out[1];
        if (maxHeight(blk) >= out[1]) by.belowRoof = (by.belowRoof || 0) + 1;
      }
    }
    return { total: total, by: by, minY: minY, maxY: maxY };
  };

  W.onBlocksGenerated.push(function (blocks) {
    for (var i = 0; i < blocks.length; i++) genObs(blocks[i]);
  });
})(typeof window !== 'undefined' ? window : globalThis);
