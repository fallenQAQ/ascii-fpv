/* =====================================================================
   ASCII FPV · 飞行力学与碰撞
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, cfg = AFP.cfg, S = AFP.S, U = AFP.util, W = AFP.world;
  var RATE = cfg.RATES;

  /* 机体基向量（世界系：X 东 / Y 上 / Z 北） */
  function updateBasis() {
    var sy = Math.sin(S.yaw * cfg.DEG), cy = Math.cos(S.yaw * cfg.DEG);
    var sp = Math.sin(S.pitch * cfg.DEG), cp = Math.cos(S.pitch * cfg.DEG);
    var sr = Math.sin(S.roll * cfg.DEG), cr = Math.cos(S.roll * cfg.DEG);
    var f0x = sy, f0z = cy;             // 航向前向
    var r0x = cy, r0z = -sy;            // 航向右向
    S.fwX = f0x * cp; S.fwY = sp; S.fwZ = f0z * cp;           // 俯仰后的前向
    var u1x = -f0x * sp, u1y = cp, u1z = -f0z * sp;           // 俯仰后的上向
    S.rtX = r0x * cr - u1x * sr; S.rtY = -u1y * sr; S.rtZ = r0z * cr - u1z * sr;
    S.upX = u1x * cr + r0x * sr; S.upY = u1y * cr; S.upZ = u1z * cr + r0z * sr;
  }

  /* 回到起点（自由飞行）或关卡起点 */
  function respawn(start) {
    var st = start || cfg.START;
    S.camX = st.x; S.camY = st.y; S.camZ = st.z;
    S.yaw = st.yaw || 0; S.pitch = st.pitch || 0; S.roll = st.roll || 0;
    S.spd = st.spd || cfg.START.spd;
    S.flown = 0; S.crashed = 0; S.crashReason = 0;
    S.maxAlt = S.camY; S.maxSpd = S.spd;
    S.stats.distance = 0; S.stats.time = 0; S.stats.crashes = 0;
    updateBasis();
  }

  function loadBest() {
    S.best = AFP.store.get('best', 0) || 0;
    S.bestSaved = S.best;
  }
  function saveBest() {
    S.bestSaved = S.best;
    AFP.store.set('best', Math.round(S.best));
  }

  var P = cfg.LIMIT, SPD_MIN = cfg.SPD_MIN, SPD_MAX = cfg.SPD_MAX;
  function physics(dt) {
    var a = S.axes;
    /* 输入统一为 -1..1 模拟量：pitch 正 = 抬头，roll 正 = 右滚，thr 正 = 加速 */
    if (a.roll) S.roll = U.clamp(S.roll + RATE.roll * a.roll * dt, -P, P);
    if (a.pitch) S.pitch = U.clamp(S.pitch + RATE.pitch * a.pitch * dt, -P, P);
    /* 线性协调转弯：滚转 45° ⇒ 偏航 90°/s */
    S.yaw = U.mod(S.yaw + (S.roll / P) * RATE.yawAtLimit * dt, 360);
    if (a.thr) S.spd = U.clamp(S.spd + RATE.acc * a.thr * dt, SPD_MIN, SPD_MAX);

    updateBasis();
    S.camX += S.fwX * S.spd * dt; S.camY += S.fwY * S.spd * dt; S.camZ += S.fwZ * S.spd * dt;
    S.flown += S.spd * dt;
    S.stats.distance = S.flown;
    if (S.camY > S.maxAlt) S.maxAlt = S.camY;
    if (S.spd > S.maxSpd) S.maxSpd = S.spd;
    if (S.flown > S.best) {                       // 记录实时刷新（街机式 BEST）
      S.best = S.flown;
      if (S.best - S.bestSaved > 500) saveBest();
    }
    if (S.camY > cfg.CEIL) { S.camY = cfg.CEIL; if (S.pitch > 0) S.pitch = 0; }

    if (S.collideOn) {
      var hit = collide();
      if (hit) {
        S.crashed = hit; S.crashReason = hit;
        S.stats.crashes++;
        saveBest();
      }
    } else if (S.camY < 1.2) {
      S.camY = 1.2; if (S.pitch < 0) S.pitch = 0;
    }
  }

  /* 碰撞检测：地面 / 楼房 / 空中移动障碍物 */
  function collide() {
    if (S.camY < 1.2) return 1;
    var B = cfg.BLOCK;
    var bxA = Math.floor(S.camX / B), bzA = Math.floor(S.camZ / B);
    for (var j = -1; j <= 1; j++) {
      for (var i = -1; i <= 1; i++) {
        var blk = W.blockAt(bxA + i, bzA + j);
        var ox = (bxA + i) * B, oz = (bzA + j) * B, arr = blk.buildings;
        for (var k = 0; k < arr.length; k++) {
          var b = arr[k];
          if (S.camX > ox + b.x - 1.1 && S.camX < ox + b.x + b.w + 1.1 &&
              S.camZ > oz + b.z - 1.1 && S.camZ < oz + b.z + b.d + 1.1 && S.camY < b.h + 0.7) return 2;
        }
      }
    }
    /* 障碍物会飞出所属街区，因此检测范围放宽到 ±2 个街区 */
    if (W.obstacles) {
      for (var j2 = -2; j2 <= 2; j2++) {
        for (var i2 = -2; i2 <= 2; i2++) {
          if (W.obstacles.hitBlock(W.blockAt(bxA + i2, bzA + j2), (bxA + i2) * B, (bzA + j2) * B)) return 3;
        }
      }
    }
    return 0;
  }

  AFP.game.player = {
    updateBasis: updateBasis, respawn: respawn, physics: physics, collide: collide,
    loadBest: loadBest, saveBest: saveBest
  };
})(typeof window !== 'undefined' ? window : globalThis);
