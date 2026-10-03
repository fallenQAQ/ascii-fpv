/* =====================================================================
   ASCII FPV · 全局配置与运行时状态
   ---------------------------------------------------------------------
   cfg —— 只读常量；S —— 所有模块共享的可变飞行状态。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP;
  var DEG = Math.PI / 180;
  AFP.cfg.DEG = DEG;

  AFP.cfg = {
    DEG: DEG,
    /* 世界尺度（米） */
    BLOCK: 64,          // 街区间距
    ROADW: 16,          // 道路宽度
    TILES: 24,          // 24x24 街区模板 → 1536m 无缝无限平铺
    /* 字符画屏幕 */
    FOVX: 86 * DEG,
    NEAR: 0.45,
    VIEW: 620,          // 可视距离
    FOGD: 420,          // 雾衰减尺度
    LEVELS: 14,         // 每种材质的亮度级数
    STEP: 1 / 120,      // 物理固定步长
    /* 飞行包线 */
    START: { x: 8, y: 48, z: -56, yaw: 0, pitch: 0, roll: 0, spd: 26 },
    LIMIT: 45,          // 俯仰 / 滚转限幅（度）
    SPD_MIN: 10,
    SPD_MAX: 50,
    CEIL: 480,          // 升限
    /* 碰撞宽容度（米）：判定比看得见的轮廓更宽松一点，
       避免「看着明明还有距离却撞了」；但楼体绝不允许内缩 */
    HIT: {
      GROUND: 0.6,      // 离地低于此高度才算撞地（原 1.2）
      WALL: 0,          // 楼体判定外扩；0 = 以真实墙面为界（不允许飞进楼体）
      SKIN: 0.4,        // 空中障碍物判定球外扩
      OBST: 0.85        // 障碍物判定球 = 可见半径 × 该系数
    },
    RATES: { pitch: 28, roll: 72, yawAtLimit: 90, acc: 9 },
    COLORS: {
      C_HUD: [70, 255, 158], C_HUD2: [24, 132, 82], C_WARN: [255, 92, 68],
      C_WHT: [214, 240, 255], C_AMB: [255, 190, 70], C_CYAN: [96, 220, 255],
      C_PINK: [255, 130, 190]
    }
  };

  /* ------------------------- 运行状态 ------------------------- */
  var S = AFP.S;
  S.time = 0;                 // 游戏内累计时间（秒）
  S.frame = 0;
  S.camX = 0; S.camY = 48; S.camZ = 0;
  S.yaw = 0; S.pitch = 0; S.roll = 0; S.spd = 26;
  /* 机体基向量（世界系：X 东 / Y 上 / Z 北） */
  S.fwX = 0; S.fwY = 0; S.fwZ = 1;
  S.rtX = 1; S.rtY = 0; S.rtZ = 0;
  S.upX = 0; S.upY = 1; S.upZ = 0;
  /* 本次飞行 */
  S.flown = 0; S.best = 0; S.bestSaved = 0;
  S.crashed = 0;
  S.maxAlt = 0; S.maxSpd = 0;
  /* 开关 */
  S.hudOn = true; S.collideOn = true;
  S.fpsVal = 0; S.paused = false;
  /* 模式与关卡 */
  S.mode = 'free';            // 'free' | 'level'
  S.level = 0;
  S.gates = [];               // 目标点列表
  S.gateIndex = 0;
  S.raceTime = 0;
  S.raceDone = false;
  S.countdown = 0;            // 起飞倒计时（秒）
  /* 统一输入（-1..1 模拟量）：pitch 正 = 抬头，roll 正 = 右滚，thr 正 = 加速 */
  S.axes = { pitch: 0, roll: 0, thr: 0 };
  S.keys = Object.create(null);
  /* 统计 */
  S.stats = { crashes: 0, gates: 0, distance: 0, time: 0 };

  S.isCrashed = function () { return !!S.crashed; };
})(typeof window !== 'undefined' ? window : globalThis);
