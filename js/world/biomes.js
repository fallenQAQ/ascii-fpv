/* =====================================================================
   ASCII FPV · 生物群系（城区分区）
   ---------------------------------------------------------------------
   用两层低频值噪声做一张连续的城市分区图：公园 / 住宅区 / 工业区 /
   商业区 / 市中心。同一片区域连续成片，飞过去能明显感到城市在变化。
   每个群系有自己的楼高、楼型、材质、树木密度与地面材质。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, cfg = AFP.cfg, U = AFP.util, W = AFP.world;
  var P = AFP.render.pal;

  /* ------------------------- 分区场 ------------------------- */
  function field(bx, bz) {
    var a = U.noise2(bx * 0.16, bz * 0.16, 0x51ab);          // 大块区域
    var b = U.noise2(bx * 0.47 + 13.7, bz * 0.47 - 7.3, 0x9f31);  // 边界细节
    return a * 0.74 + b * 0.26;
  }

  var LIST = [
    { id: 'park', max: 0.32 },
    { id: 'suburb', max: 0.48 },
    { id: 'industry', max: 0.63 },
    { id: 'midtown', max: 0.80 },
    { id: 'downtown', max: 1.01 }
  ];

  W.biomeList = LIST;
  W.biomeAt = function (bx, bz) {
    var v = field(bx, bz);
    for (var i = 0; i < LIST.length; i++) if (v < LIST[i].max) return LIST[i];
    return LIST[LIST.length - 1];
  };
  W.biomeLabel = function (wx, wz) {
    var b = W.blockAt(Math.floor(wx / cfg.BLOCK), Math.floor(wz / cfg.BLOCK));
    var id = b.biome || 'midtown';
    if (id === 'city') id = 'midtown';
    return AFP.t('biome.' + id);
  };

  /* ------------------------- 各群系的生成参数 ------------------------- */
  /*  material  墙面材质候选（对应 palette.M_WALL 下标）
      height    楼高系数
      tower     整街区独栋塔楼概率
      empty     四分之一街区留空（小公园）概率
      tree      行道树概率
      fill      楼房占象限的比例（越大楼越胖、越挤） */
  var PARAMS = {
    downtown: { material: [0, 2, 3], height: 1.55, tower: 0.42, empty: 0.06, tree: 0.28, fill: 0.55, spire: 0.16 },
    midtown: { material: [0, 1, 2, 3], height: 1.05, tower: 0.22, empty: 0.14, tree: 0.50, fill: 0.52, spire: 0.04 },
    suburb: { material: [4, 1, 2], height: 0.42, tower: 0.04, empty: 0.34, tree: 0.82, fill: 0.46, spire: 0 },
    industry: { material: [5, 2, 5], height: 0.36, tower: 0.30, empty: 0.10, tree: 0.18, fill: 0.74, spire: 0, wide: true },
    park: { material: [1, 3], height: 0.30, tower: 0.02, empty: 0.92, tree: 0.95, fill: 0.30, spire: 0 }
  };

  function builder(bx, bz, rnd, bi) {
    var p = PARAMS[bi ? bi.id : 'midtown'] || PARAMS.midtown;
    var buildings = [], trees = [];
    var i0 = cfg.ROADW + 5, i1 = cfg.BLOCK - 3, span = i1 - i0;
    /* 每个群系内部还有一个小幅的高低起伏，避免整片一样高 */
    var wob = 0.75 + 0.5 * U.noise2(bx * 0.6 + 31, bz * 0.6 - 17, 0x2c71);
    var base = p.height * wob;

    function hgt(big) {
      var h = (9 + Math.pow(base, 1.35) * (big ? 170 : 92)) * (0.62 + 0.76 * rnd());
      if (p.spire && rnd() < p.spire) h *= 1.9;               // 市中心偶尔来一栋地标尖塔
      return Math.min(h, 245);
    }
    function push(x, z, w, d, h) {
      buildings.push({
        x: x, z: z, w: w, d: d, h: h,
        mat: U.pick(rnd, p.material), seed: (rnd() * 1e9) | 0,
        lit: (bi && bi.id === 'downtown' ? 0.22 : 0.12) + rnd() * 0.40
      });
    }

    if (rnd() < p.tower) {                    // 整街区一栋
      var w = span * (0.70 + 0.28 * rnd()), d = span * (0.70 + 0.28 * rnd());
      push(i0 + (span - w) * rnd(), i0 + (span - d) * rnd(), w, d, hgt(true));
    } else {
      var half = span / 2;
      for (var q = 0; q < 4; q++) {
        var qx = i0 + (q & 1) * half, qz = i0 + (q >> 1) * half;
        if (rnd() < p.empty) {                // 空地 / 小公园
          var nt = 2 + ((rnd() * (bi && bi.id === 'park' ? 7 : 4)) | 0);
          for (var k = 0; k < nt; k++) trees.push(W.mkTree(qx + 2 + rnd() * (half - 4), qz + 2 + rnd() * (half - 4), rnd));
          continue;
        }
        var bw, bd;
        if (p.wide) {                         // 工业区：低矮大跨度厂房
          bw = half * (0.80 + 0.18 * rnd()); bd = half * (0.78 + 0.20 * rnd());
        } else {
          bw = half * (p.fill + 0.42 * rnd()); bd = half * (p.fill + 0.42 * rnd());
        }
        push(qx + (half - 2 - bw) * rnd(), qz + (half - 2 - bd) * rnd(), bw, bd, hgt(false));
      }
    }

    /* 沿街行道树 */
    var line = cfg.ROADW - 1.4;
    for (var t = 0; t < 7; t++) {
      var q = cfg.ROADW + 4 + t * 8.6;
      if (q > cfg.BLOCK - 3) break;
      if (rnd() < p.tree) trees.push(W.mkTree(q + rnd() * 1.6, line - rnd() * 1.2, rnd));
      if (rnd() < p.tree) trees.push(W.mkTree(line - rnd() * 1.2, q + rnd() * 1.6, rnd));
    }

    /* 公园：成片树林 */
    if (bi && bi.id === 'park') {
      for (var m = 0; m < 12; m++) {
        trees.push(W.mkTree(i0 + rnd() * span, i0 + rnd() * span, rnd));
      }
    }
    return { buildings: buildings, trees: trees };
  }
  W.builder = builder;

  /* ------------------------- 地面材质覆盖 ------------------------- */
  /* 公园里给一片水面，工业区铺裸土；其余交回默认地面着色 */
  function groundOverride(wx, wz, dist) {
    var BL = cfg.BLOCK;
    var bx = Math.floor(wx / BL), bz = Math.floor(wz / BL);
    var blk = W.blockAt(bx, bz);
    var id = blk.biome;
    var R = AFP.render.raster;
    if (id === 'park') {
      var cx = bx * BL + BL * 0.5, cz = bz * BL + BL * 0.5;
      var dx = wx - cx, dz = wz - cz;
      if (dx * dx + dz * dz < 19 * 19) {
        var rip = U.hash3(Math.floor(wx * 0.35), Math.floor(wz * 0.35), 3);
        R.setStyle(P.M_WATER, R.fogAt(dist) * (0.55 + 0.5 * rip), 0);
        return true;
      }
      return false;
    }
    if (id === 'industry' && !W.roadAt(wx, wz)) {
      var fg = R.fogAt(dist);
      var n = U.hash3(Math.floor(wx * 0.5), Math.floor(wz * 0.5), 11);
      R.setStyle(P.M_DIRT, fg * (0.45 + 0.5 * n), 0);
      return true;
    }
    return false;
  }
  W.biomeGroundOverride = groundOverride;

  W.onBlocksGenerated.push(function () {
    AFP.render.ground.setGroundOverride(groundOverride);
  });

  /* 供测试与统计使用 */
  W.biomeStats = function () {
    var out = {};
    for (var i = 0; i < W.blocks.length; i++) {
      var b = W.blocks[i];
      var s = out[b.biome] || (out[b.biome] = { blocks: 0, buildings: 0, trees: 0, maxH: 0, sumH: 0 });
      s.blocks++;
      s.buildings += b.buildings.length;
      s.trees += b.trees.length;
      for (var k = 0; k < b.buildings.length; k++) {
        s.sumH += b.buildings[k].h;
        if (b.buildings[k].h > s.maxH) s.maxH = b.buildings[k].h;
      }
    }
    for (var key in out) out[key].avgH = out[key].buildings ? out[key].sumH / out[key].buildings : 0;
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
