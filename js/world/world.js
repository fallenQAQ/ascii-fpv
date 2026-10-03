/* =====================================================================
   ASCII FPV · 世界生成（可无限平铺的城市）
   ---------------------------------------------------------------------
   24x24 个街区模板构成 1536m 周期，用坐标取模实现无缝无限平铺；
   每个街区的建筑 / 树木 / 空中障碍物都由该街区的坐标哈希确定性生成，
   因此飞到哪里都是同一座城。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, cfg = AFP.cfg, U = AFP.util;
  var W = AFP.world;

  W.TILES = cfg.TILES;
  W.blocks = new Array(cfg.TILES * cfg.TILES);

  function mkTree(x, z, rnd) {
    var h = 7 + rnd() * 7.5;
    return { x: x, z: z, h: h, r: h * (0.28 + 0.10 * rnd()), seed: (rnd() * 1e9) | 0 };
  }

  /* 生成一个街区的街区模板（后续按坐标取模复用）
     builder 是可替换的生成策略：world/biomes.js 会把它换成按生物群系生成 */
  function genBlock(bx, bz) {
    var rnd = U.mulberry32((bx * 73856093) ^ (bz * 19349663) ^ 0x5f3a71);
    var bi = W.biomeAt ? W.biomeAt(bx, bz) : null;
    var blk = (W.builder || defaultBuilder)(bx, bz, rnd, bi) || {};
    blk.bx = bx; blk.bz = bz;
    blk.biome = bi ? bi.id : 'city';
    if (!blk.buildings) blk.buildings = [];
    if (!blk.trees) blk.trees = [];
    if (!blk.obs) blk.obs = [];
    return blk;
  }

  /* 默认生成器：不加载生物群系时的通用城市 */
  function defaultBuilder(bx, bz, rnd, bi) {
    var buildings = [], trees = [];
    var i0 = cfg.ROADW + 5, i1 = cfg.BLOCK - 3, span = i1 - i0;   // 可建面积（离路边留出人行道）
    /* 城区高度分布：形成高楼群与低矮区 */
    var dh = (Math.sin(bx * 0.62 + 0.7) * Math.cos(bz * 0.51 - 1.1) + 1) / 2;
    function hgt(big) {
      var h = 11 + Math.pow(dh, 1.7) * (big ? 155 : 96) * (0.55 + 0.9 * rnd());
      if (dh > 0.72 && rnd() > 0.72) h *= 1.45;
      return Math.min(h, 215);
    }
    function push(x, z, w, d, h) {
      buildings.push({
        x: x, z: z, w: w, d: d, h: h,
        mat: (rnd() * 4) | 0, seed: (rnd() * 1e9) | 0, lit: 0.14 + rnd() * 0.42
      });
    }
    if (rnd() < 0.20) {                       // 整街区一栋塔楼
      var w = span * (0.68 + 0.30 * rnd()), d = span * (0.68 + 0.30 * rnd());
      push(i0 + (span - w) * rnd(), i0 + (span - d) * rnd(), w, d, hgt(true));
    } else {                                  // 四象限分布
      var half = span / 2;
      for (var q = 0; q < 4; q++) {
        var qx = i0 + (q & 1) * half, qz = i0 + (q >> 1) * half;
        if (rnd() < 0.20) {                   // 空地 / 小公园
          var nt = 2 + ((rnd() * 4) | 0);
          for (var k = 0; k < nt; k++) trees.push(mkTree(qx + 2 + rnd() * (half - 4), qz + 2 + rnd() * (half - 4), rnd));
          continue;
        }
        var bw = half * (0.52 + 0.42 * rnd()), bd = half * (0.52 + 0.42 * rnd());
        push(qx + (half - 2 - bw) * rnd(), qz + (half - 2 - bd) * rnd(), bw, bd, hgt(false));
      }
    }
    /* 沿街行道树（种在人行道内侧） */
    var line = cfg.ROADW - 1.4;
    for (var t = 0; t < 7; t++) {
      var p = cfg.ROADW + 4 + t * 8.6;
      if (p > cfg.BLOCK - 3) break;
      if (rnd() < 0.62) trees.push(mkTree(p + rnd() * 1.6, line - rnd() * 1.2, rnd));
      if (rnd() < 0.62) trees.push(mkTree(line - rnd() * 1.2, p + rnd() * 1.6, rnd));
    }
    return { buildings: buildings, trees: trees };
  }

  function gen() {
    for (var bz = 0; bz < W.TILES; bz++) {
      for (var bx = 0; bx < W.TILES; bx++) {
        W.blocks[bz * W.TILES + bx] = genBlock(bx, bz);
      }
    }
    /* 各子系统（生物群系 / 障碍物）在自己模块里对街区做二次加工 */
    if (W.onBlocksGenerated) {
      for (var i = 0; i < W.onBlocksGenerated.length; i++) W.onBlocksGenerated[i](W.blocks, W.TILES);
    }
  }
  W.onBlocksGenerated = [];

  /* 取（可无限平铺的）街区模板：世界坐标 bx,bz 可为任意整数 */
  W.blockAt = function (bx, bz) {
    var n = W.TILES;
    return W.blocks[U.mod(bz, n) * n + U.mod(bx, n)];
  };

  W.genBlock = genBlock;
  W.mkTree = mkTree;
  W.gen = gen;

  /* 生成器需要知道街区尺寸，渲染/碰撞也要用 */
  W.roadAt = function (wx, wz) {
    var mx = U.mod(wx, cfg.BLOCK), mz = U.mod(wz, cfg.BLOCK);
    return mx < cfg.ROADW || mz < cfg.ROADW;
  };
})(typeof window !== 'undefined' ? window : globalThis);
