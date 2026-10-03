/* =====================================================================
   ASCII FPV · HUD（字符叠加层）
   ---------------------------------------------------------------------
   HUD 直接写字符网格：地平线、俯仰梯、航向带、速度/高度带、滚转刻度、
   底部状态栏、目标点指示。中文字符按 2 格宽度处理以保持对齐。
   ===================================================================== */
(function (g) {
  'use strict';
  var AFP = g.AFP, cfg = AFP.cfg, S = AFP.S, U = AFP.util;
  var V = AFP.render.view, BUF = AFP.render.buf, P = AFP.render.pal, R = AFP.render.raster;
  var C = P.C;
  function t(k, v) { return AFP.t(k, v); }

  /* ------------------------- 字符宽（CJK 占 2 格） ------------------------- */
  function charCells(code) {
    if (code < 0x1100) return 1;
    if (code >= 0x1100 && code <= 0x115F) return 2;
    if (code >= 0x2E80 && code <= 0xA4CF) return 2;
    if (code >= 0xAC00 && code <= 0xD7A3) return 2;
    if (code >= 0xF900 && code <= 0xFAFF) return 2;
    if (code >= 0xFE30 && code <= 0xFE6F) return 2;
    if (code >= 0xFF00 && code <= 0xFF60) return 2;
    if (code >= 0xFFE0 && code <= 0xFFE6) return 2;
    return 1;
  }
  function cellLen(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) n += charCells(s.charCodeAt(i));
    return n;
  }
  function fitCells(s, maxCells) {
    var n = 0, out = '';
    for (var i = 0; i < s.length; i++) {
      var w = charCells(s.charCodeAt(i));
      if (n + w > maxCells) break;
      out += s[i]; n += w;
    }
    return out;
  }

  function hudCh(x, y, ch, st) {
    if (x < 0 || y < 0 || x >= V.COLS || y >= V.ROWS) return;
    var i = y * V.COLS + x; BUF.chars[i] = ch; BUF.colr[i] = st; BUF.zbuf[i] = 1e18;
  }
  /* 写字符串（跳过空格，不遮挡已有内容） */
  function hudStr(x, y, s, st) {
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 32) { x += 1; continue; }
      hudCh(x, y, c, st);
      var w = charCells(c);
      if (w === 2) hudCh(x + 1, y, 32, st);   // 双宽字占位，避免被后续内容压字
      x += w;
    }
  }
  /* 写字符串（空格也写入，用于整行覆盖） */
  function hudStrOp(x, y, s, st) {
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 128) { hudCh(x, y, c, st); x += 1; }
      else { hudCh(x, y, c, st); hudCh(x + 1, y, 32, st); x += 2; }
    }
  }
  function hudRow(y, ch, st) { for (var x = 0; x < V.COLS; x++) hudCh(x, y, ch, st); }
  function hudCenter(y, s, st) { hudStr(Math.round(V.COLS / 2 - cellLen(s) / 2), y, s, st); }

  /* ------------------------- 地平线 / 俯仰梯 ------------------------- */
  function drawHorizon() {
    var i;
    var Ux = S.rtY, Uy = S.upY, Uz = S.fwY;      // 世界「上」向在相机系中的分量
    if (Math.abs(Uy) >= Math.abs(Ux) * 0.55) {
      for (i = 0; i < V.COLS; i++) {
        var a = (i + 0.5 - V.cxF) / V.sxS;
        var bb = -(Uz + a * Ux) / Uy;
        var py = Math.round(V.cyF - bb * V.syS - 0.5);
        if (Math.abs(i - V.cxF) < 4.5) continue;
        hudCh(i, py, 45, C.C_HUD2);
      }
    } else {
      for (i = 0; i < V.ROWS; i++) {
        var b2 = (V.cyF - (i + 0.5)) / V.syS;
        var aa = -(Uz + b2 * Uy) / Ux;
        var pxx = Math.round(V.cxF + aa * V.sxS - 0.5);
        if (Math.abs(i - V.cyF) < 2.5) continue;
        hudCh(pxx, i, 124, C.C_HUD2);
      }
    }
  }

  var LP0 = [0, 0], LP1 = [0, 0];
  function ladderPt(azDeg, elDeg, out) {
    var ca = Math.cos(azDeg * cfg.DEG), sa = Math.sin(azDeg * cfg.DEG);
    var ce = Math.cos(elDeg * cfg.DEG), se = Math.sin(elDeg * cfg.DEG);
    var dx = sa * ce, dy = se, dz = ca * ce;
    var Z = dx * S.fwX + dy * S.fwY + dz * S.fwZ;
    if (Z < 0.08) return false;
    out[0] = V.cxF + (dx * S.rtX + dy * S.rtY + dz * S.rtZ) / Z * V.sxS;
    out[1] = V.cyF - (dx * S.upX + dy * S.upY + dz * S.upZ) / Z * V.syS;
    return true;
  }
  function drawLadder() {
    for (var k = -40; k <= 40; k += 10) {
      if (k === 0) continue;
      for (var s = -1; s <= 1; s += 2) {
        if (!ladderPt(S.yaw + s * 4.5, k, LP0)) continue;
        if (!ladderPt(S.yaw + s * 14, k, LP1)) continue;
        var n = Math.ceil(Math.max(Math.abs(LP1[0] - LP0[0]), Math.abs(LP1[1] - LP0[1])));
        if (n < 1) n = 1; if (n > 200) continue;
        for (var i = 0; i <= n; i++) {
          if (k < 0 && (i & 1)) continue;                    // 负俯仰用虚线
          var tt = i / n;
          hudCh(Math.round(LP0[0] + (LP1[0] - LP0[0]) * tt - 0.5),
                Math.round(LP0[1] + (LP1[1] - LP0[1]) * tt - 0.5), k > 0 ? 45 : 46, C.C_HUD2);
        }
        var lb = U.pad(Math.abs(k), 2);
        hudStr(Math.round(LP1[0] - 0.5) + (s > 0 ? 1 : -3), Math.round(LP1[1] - 0.5), lb, C.C_HUD2);
      }
    }
  }

  /* ------------------------- 目标点指示 ------------------------- */
  function bearingArrow(delta) {
    var a = Math.abs(delta);
    if (a < 6) return '^';
    if (a > 174) return 'v';
    if (delta > 0 && a < 96) return '>';
    if (delta < 0 && a < 96) return '<';
    if (delta > 0) return '\\';
    return '/';
  }
  function drawGateMarker() {
    if (S.mode !== 'level' || !S.gates.length) return;
    var gt = S.gates[S.gateIndex];
    if (!gt) return;
    var cx = Math.round(V.cxF - 0.5), cy = Math.round(V.cyF - 0.5);
    var dx = gt.x - S.camX, dy = gt.y - S.camY, dz = gt.z - S.camZ;
    var Z = dx * S.fwX + dy * S.fwY + dz * S.fwZ;
    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    var bearing = Math.atan2(dx, dz) / cfg.DEG;
    var db = U.angleDelta(S.yaw, U.mod(bearing, 360));
    var line = t('hud.target') + ' ' + Math.round(dist) + 'm ' + bearingArrow(db) + ' ' +
      U.pad0(Math.round(U.mod(bearing, 360)), 3) + '  ' + t('hud.gates', { i: S.gateIndex + 1, n: S.gates.length });
    var col = dist < 120 ? C.C_AMB : C.C_HUD;
    hudStr(2 + cellLen(t('hud.target')) + 1, V.ROWS - 4, line, col);
    /* 若目标在视野内，画一个菱形准星套在光环投影位置上 */
    if (Z > 1) {
      var px = V.cxF + (dx * S.rtX + dy * S.rtY + dz * S.rtZ) / Z * V.sxS;
      var py = V.cyF - (dx * S.upX + dy * S.upY + dz * S.upZ) / Z * V.syS;
      var mx = Math.round(px - 0.5), my = Math.round(py - 0.5);
      if (mx > 2 && my > 2 && mx < V.COLS - 3 && my < V.ROWS - 4) {
        var blink = (S.time * 3 | 0) & 1;
        var st = blink ? C.C_AMB : C.C_WHT;
        hudCh(mx, my - 2, 94, st); hudCh(mx, my + 2, 118, st);
        hudCh(mx - 2, my, 60, st); hudCh(mx + 2, my, 62, st);
      }
    }
  }

  /* ------------------------- 主 HUD ------------------------- */
  function drawHUD() {
    var cx = Math.round(V.cxF - 0.5), cy = Math.round(V.cyF - 0.5);
    var hdg = Math.round(U.mod(S.yaw, 360)) % 360;
    drawHorizon();
    drawLadder();

    /* 中心准星 */
    hudStr(cx - 10, cy, "-----", C.C_HUD);
    hudStr(cx + 6, cy, "-----", C.C_HUD);
    hudStr(cx - 2, cy, "[+]", C.C_HUD);

    /* 航向带（顶部） */
    var half = Math.min(38, (V.COLS >> 2));
    var a0 = Math.ceil((hdg - half * 2) / 10) * 10;
    for (var a = a0; a <= hdg + half * 2; a += 10) {
      var xx = cx + Math.round((a - hdg) / 2);
      var av = U.mod(a, 360);
      hudCh(xx, 0, (av % 30 === 0) ? 124 : 39, C.C_HUD2);
      if (av % 30 === 0) {
        var lab = av === 0 ? " N " : av === 90 ? " E " : av === 180 ? " S " : av === 270 ? " W " : U.pad(av, 3).replace(/ /g, '0');
        hudStr(xx - 1, 1, lab, C.C_HUD2);
      }
    }
    hudStrOp(cx - 2, 2, "[" + U.pad0(hdg, 3) + "]", C.C_WHT);

    /* 速度带（左）1 行 = 2 m/s */
    var rowsHalf = Math.min(10, (V.ROWS >> 2));
    var TX = 9;
    hudStr(TX - 5, cy - rowsHalf - 2, t('hud.spd'), C.C_HUD2);
    for (var v = Math.ceil((S.spd - rowsHalf * 2) / 5) * 5; v <= S.spd + rowsHalf * 2; v += 5) {
      if (v < 0) continue;
      var vy = cy - Math.round((v - S.spd) / 2);
      if (vy < 3 || vy > V.ROWS - 5) continue;
      if (v % 10 === 0) { hudStr(TX - 1, vy, "--", C.C_HUD2); hudStr(TX - 5, vy, U.pad(v, 3), C.C_HUD2); }
      else hudCh(TX, vy, 45, C.C_HUD2);
    }
    hudStrOp(TX - 5, cy, "[" + U.pad(Math.round(S.spd), 3) + "]", C.C_WHT);

    /* 高度带（右）1 行 = 5 m */
    var AX = V.COLS - 10;
    hudStr(AX + 2, cy - rowsHalf - 2, t('hud.alt'), C.C_HUD2);
    var alt = S.camY;
    for (var h = Math.ceil((alt - rowsHalf * 5) / 10) * 10; h <= alt + rowsHalf * 5; h += 10) {
      if (h < 0) continue;
      var hy = cy - Math.round((h - alt) / 5);
      if (hy < 3 || hy > V.ROWS - 5) continue;
      if (h % 20 === 0) { hudStr(AX - 1, hy, "--", C.C_HUD2); hudStr(AX + 2, hy, U.pad(h, 3), C.C_HUD2); }
      else hudCh(AX, hy, 45, C.C_HUD2);
    }
    hudStrOp(AX + 1, cy, "[" + U.pad(Math.round(alt), 3) + "]", C.C_WHT);

    /* 滚转刻度（底部） */
    var by = V.ROWS - 6, sc = Math.min(18, (V.COLS >> 3));
    var ticks = [-45, -30, -15, 0, 15, 30, 45];
    for (var ti = 0; ti < ticks.length; ti++) {
      var tx = cx + Math.round(ticks[ti] / 45 * sc);
      hudCh(tx, by, ticks[ti] === 0 ? 43 : 39, C.C_HUD2);
    }
    hudCh(cx + Math.round(S.roll / 45 * sc), by - 1, 94, Math.abs(S.roll) > 44 ? C.C_AMB : C.C_HUD);

    /* 触屏摇杆 / 油门指示 */
    if (AFP.input.touch && AFP.input.touch.drawHud) AFP.input.touch.drawHud(hudCh, C);
    /* 陀螺仪 / 操控方式标记 */
    drawControlTag();

    drawGateMarker();

    /* 底部状态栏 */
    hudRow(V.ROWS - 3, 45, C.C_HUD2);
    hudRow(V.ROWS - 2, 32, C.C_HUD2);
    hudRow(V.ROWS - 1, 32, C.C_HUD2);
    var line = t('hud.spd') + ' ' + U.pad(S.spd.toFixed(1), 4) + ' M/S   ' + t('hud.alt') + ' ' + U.pad(Math.round(S.camY), 3) +
      ' M   ' + t('hud.hdg') + ' ' + U.pad0(hdg, 3) + '   BNK ' + U.sgnNum(S.roll) + '   PIT ' + U.sgnNum(S.pitch) +
      '   VS ' + U.sgnNum(S.spd * Math.sin(S.pitch * cfg.DEG)) + ' M/S   ' + t('hud.dist') + ' ' + (S.flown / 1000).toFixed(2) +
      ' KM   ' + t('hud.best') + ' ' + (S.best / 1000).toFixed(2) + ' KM';
    hudStrOp(1, V.ROWS - 2, fitCells(line, V.COLS - 2), C.C_HUD);
    var hint = AFP.input.hintKey ? t(AFP.input.hintKey) : t('hud.hint.key');
    hudStrOp(1, V.ROWS - 1, fitCells(hint, V.COLS - 2), C.C_HUD2);
    var tag = V.COLS + 'x' + V.ROWS + ' CHARS  ' + U.pad(S.fpsVal, 3) + ' FPS';
    if (V.COLS - 2 - tag.length > cellLen(hint) + 3) hudStrOp(V.COLS - 2 - tag.length, V.ROWS - 1, tag, C.C_HUD2);

    if (Math.abs(S.roll) > 44.5) hudCenter(cy - 3, t('hud.banklim'), C.C_AMB);
    if (Math.abs(S.pitch) > 44.5) hudCenter(cy + 3, t('hud.pitchlim'), C.C_AMB);
    if (S.camY < 25 && !S.crashed) hudCenter(cy + 5, t('hud.lowalt'), C.C_WARN);
  }

  function drawControlTag() {
    if (!AFP.ui.settings) return;
    var mode = AFP.ui.settings.get('controlMode');
    if (mode === 'stick') return;
    var gyroOk = AFP.input.gyro && AFP.input.gyro.active();
    var s = t('hud.gyro') + (gyroOk ? '' : ' --');
    hudStr(2, 3, s, gyroOk ? C.C_CYAN : C.C_DIM);
  }

  /* ------------------------- 提示框（坠机 / 过关） ------------------------- */
  function hudBox(x, y, w, h, st) {
    st = st === undefined ? C.C_WARN : st;
    for (var j = 0; j <= h; j++) {
      for (var i = 0; i <= w; i++) {
        var ch = 32;
        if ((j === 0 || j === h) && (i === 0 || i === w)) ch = 43;
        else if (j === 0 || j === h) ch = 45;
        else if (i === 0 || i === w) ch = 124;
        hudCh(x + i, y + j, ch, st);
      }
    }
  }
  function drawCrash() {
    var cx = Math.round(V.cxF - 0.5), cy = Math.round(V.cyF - 0.5);
    var reasonKey = S.crashReason === 2 ? 'crash.building' : (S.crashReason === 3 ? 'crash.obstacle' : 'crash.ground');
    var title = '* ' + t('crash.title') + ' *';
    var l1 = t(reasonKey);
    var l2 = t('crash.dist') + ' ' + (S.flown / 1000).toFixed(2) + ' KM';
    var l3 = t('crash.best') + ' ' + (S.best / 1000).toFixed(2) + ' KM';
    var w = Math.max(30, cellLen(title) + 4, cellLen(l1) + 6, cellLen(l2) + 6, cellLen(l3) + 6);
    var h = S.mode === 'level' ? 7 : 6;
    var x = cx - (w >> 1), y = cy - (h >> 1);
    hudBox(x, y, w, h);
    hudStr(x + Math.round((w - cellLen(title)) / 2), y + 1, title, C.C_WARN);
    hudStr(x + Math.round((w - cellLen(l1)) / 2), y + 2, l1, C.C_WHT);
    hudStr(x + Math.round((w - cellLen(l2)) / 2), y + 3, l2, C.C_WHT);
    hudStr(x + Math.round((w - cellLen(l3)) / 2), y + 4, l3, C.C_WHT);
    if (S.mode === 'level') {
      var l5 = t('crash.gates') + ' ' + S.stats.gates + '/' + S.gates.length;
      hudStr(x + Math.round((w - cellLen(l5)) / 2), y + 5, l5, C.C_WHT);
    }
  }

  AFP.render.hud = {
    hudCh: hudCh, hudStr: hudStr, hudStrOp: hudStrOp, hudRow: hudRow, hudCenter: hudCenter,
    hudBox: hudBox, drawCrash: drawCrash, drawHUD: drawHUD, drawHorizon: drawHorizon,
    drawLadder: drawLadder, drawGateMarker: drawGateMarker,
    charCells: charCells, cellLen: cellLen, fitCells: fitCells
  };
})(typeof window !== 'undefined' ? window : globalThis);
