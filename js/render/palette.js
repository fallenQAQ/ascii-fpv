/* =====================================================================
   ASCII FPV · 调色板与「材质」
   ---------------------------------------------------------------------
   屏幕不是像素而是「字符单元格」：每格 = 1 个字符 + 1 个颜色。
   每种材质占用 LEVELS 个连续调色板槽位：亮度等级 → (颜色, 字符)。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, cfg = AFP.cfg;
  var LEVELS = cfg.LEVELS;

  var PAL = [];
  function makeMat(rgb, ramp, ambient) {
    if (ambient === undefined) ambient = 0.26;
    var base = PAL.length;
    var chars = new Uint16Array(LEVELS);
    for (var i = 0; i < LEVELS; i++) {
      var t = i / (LEVELS - 1);
      var k = ambient + (1 - ambient) * t;
      PAL.push('rgb(' + (rgb[0] * k | 0) + ',' + (rgb[1] * k | 0) + ',' + (rgb[2] * k | 0) + ')');
      chars[i] = ramp.charCodeAt(Math.min(ramp.length - 1, Math.round(t * (ramp.length - 1))));
    }
    return { pal: base, chars: chars, ramp: ramp, rgb: rgb };
  }
  function solid(r, g2, b) { PAL.push('rgb(' + r + ',' + g2 + ',' + b + ')'); return PAL.length - 1; }

  var WALLRAMP = " .:-=+*###";

  /* ---- 墙面材质：按生物群系取用 ---- */
  var M_WALL = [
    makeMat([150, 172, 208], WALLRAMP),   // 0 冷蓝玻璃幕墙（市中心）
    makeMat([200, 180, 156], WALLRAMP),   // 1 砂岩（老城）
    makeMat([138, 146, 160], WALLRAMP),   // 2 混凝土灰
    makeMat([118, 168, 182], WALLRAMP),   // 3 青灰
    makeMat([176, 124, 104], WALLRAMP),   // 4 红砖（住宅区）
    makeMat([146, 150, 138], WALLRAMP)    // 5 工业钢板
  ];
  var M_ROOF = makeMat([132, 106, 88], " ...::;;;++");      // 屋顶：暖褐灰、砾石面
  var M_WINL = makeMat([255, 214, 118], " ..:=+*#%@@");     // 亮窗
  var M_WIND = makeMat([46, 62, 96], " ...:::;;;;");        // 暗窗
  var M_ROAD = makeMat([78, 90, 116], " ..::----==");       // 沥青：深冷灰
  var M_WALK = makeMat([176, 176, 182], " ...::::;;;");     // 人行道：亮灰
  var M_MARK = makeMat([238, 200, 84], " ..::====##");      // 道路标线：明黄
  var M_GRASS = makeMat([60, 94, 56], "  ...,,,,''");       // 草地
  var M_LEAF = makeMat([88, 184, 92], " .,:;o*&%@@");       // 树冠
  var M_TRUNK = makeMat([140, 100, 62], " ..::||||##");     // 树干
  var M_WATER = makeMat([46, 96, 140], "  ..::;;==+");      // 水面
  var M_WARE = makeMat([124, 116, 96], " ..::;;;+*");       // 厂房波纹墙
  var M_DIRT = makeMat([104, 88, 62], "  ...,,,:::");       // 工业区裸土

  /* ---- 空中障碍物 / 目标点 ---- */
  var M_BALLOON = [
    makeMat([236, 96, 96], " ..::==*#%@"),                  // 红气球
    makeMat([250, 200, 90], " ..::==*#%@"),                 // 黄气球
    makeMat([140, 190, 250], " ..::==*#%@"),                // 蓝气球
    makeMat([190, 140, 240], " ..::==*#%@")                 // 紫气球
  ];
  var M_BASKET = makeMat([132, 100, 66], " ..::||||##");
  var M_HULL = makeMat([196, 206, 220], " ..::;;;+*#@");    // 飞行器机身：亮银
  var M_WING = makeMat([150, 158, 172], " ...::;;++*");     // 机翼
  var M_ROTOR = makeMat([120, 126, 136], " ...::-----");    // 旋翼

  /* ---- 纯色（HUD / 指示灯） ---- */
  var C = {};
  C.C_HUD = solid(70, 255, 158);
  C.C_HUD2 = solid(24, 132, 82);
  C.C_WARN = solid(255, 92, 68);
  C.C_WHT = solid(214, 240, 255);
  C.C_AMB = solid(255, 190, 70);
  C.C_CYAN = solid(96, 220, 255);
  C.C_PINK = solid(255, 130, 190);
  C.C_RED = solid(255, 70, 60);
  C.C_DIM = solid(58, 108, 82);

  AFP.render.pal = {
    LEVELS: LEVELS, PAL: PAL, makeMat: makeMat, solid: solid,
    M_WALL: M_WALL, M_ROOF: M_ROOF, M_WINL: M_WINL, M_WIND: M_WIND,
    M_ROAD: M_ROAD, M_WALK: M_WALK, M_MARK: M_MARK, M_GRASS: M_GRASS,
    M_LEAF: M_LEAF, M_TRUNK: M_TRUNK, M_WATER: M_WATER, M_WARE: M_WARE, M_DIRT: M_DIRT,
    M_BALLOON: M_BALLOON, M_BASKET: M_BASKET, M_HULL: M_HULL, M_WING: M_WING, M_ROTOR: M_ROTOR,
    C: C
  };
})(typeof window !== 'undefined' ? window : globalThis);
