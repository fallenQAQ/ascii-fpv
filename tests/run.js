/* =====================================================================
   ASCII FPV · 测试入口
   ---------------------------------------------------------------------
   运行： node tests/run.js
   零依赖：自带迷你 DOM + vm 沙箱，直接加载 index.html 里声明的脚本。
   ===================================================================== */
'use strict';
const H = require('./harness');

let passed = 0, failed = 0;
const failures = [];
let currentGroup = '';

function group(name, fn) {
  currentGroup = name;
  try { fn(); }
  catch (e) {
    failed++;
    failures.push('[' + name + '] 抛出异常: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  }
}
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; failures.push('[' + currentGroup + '] ' + msg); }
}
function eq(a, b, msg) {
  ok(a === b, msg + ' — 实际 ' + JSON.stringify(a) + '，期望 ' + JSON.stringify(b));
}
function near(a, b, tol, msg) {
  ok(Math.abs(a - b) <= tol, msg + ' — 实际 ' + a + '，期望 ' + b + '±' + tol);
}

/* =====================================================================
   1. 结构与加载
   ===================================================================== */
const app = H.boot();
const AFP = app.AFP;

group('加载', () => {
  eq(app.errors.length, 0, '所有脚本都应无异常加载' +
    (app.errors.length ? '：' + app.errors.map(e => e.file + ' → ' + e.error.message).join('; ') : ''));
  ok(!!AFP, 'window.AFP 命名空间应存在');
  eq(AFP.version, '2.0.0', 'AFP.version');
  ok(app.files.length >= 15, 'index.html 应加载多个独立模块，实际 ' + app.files.length);
  app.files.forEach(f => {
    ok(fs_exists(f), '脚本文件应存在: ' + f);
  });
  app.styles.forEach(f => {
    ok(fs_exists(f), '样式文件应存在: ' + f);
  });
});

function fs_exists(rel) {
  const fs = require('fs'), path = require('path');
  return fs.existsSync(path.join(H.ROOT, rel));
}

group('脚本顺序', () => {
  const idx = n => app.files.findIndex(f => f.indexOf(n) >= 0);
  ok(idx('core/ns.js') < idx('core/math.js'), 'ns 应在 math 之前');
  ok(idx('core/math.js') < idx('render/palette.js'), 'math 应在 palette 之前');
  ok(idx('core/state.js') < idx('render/palette.js'), 'state 应在 palette 之前');
  ok(idx('i18n/en.js') < idx('i18n/i18n.js'), '语言包应在 i18n 运行时之前');
  ok(idx('render/palette.js') < idx('render/raster.js'), 'palette 应在 raster 之前');
  ok(idx('world/world.js') < idx('main.js'), 'world 应在 main 之前');
  ok(idx('ui/screens.js') < idx('game/states.js'), 'screens 应在 states 之前');
  ok(idx('main.js') === app.files.length - 1, 'main.js 应最后加载');
});

/* =====================================================================
   2. 启动与基础状态
   ===================================================================== */
group('启动', () => {
  ok(app.errors.length === 0, '加载无异常');
  ok(!!app.hook, '应安装 __ASCIIFPV__ 自检接口');
  const info = app.hook.info();
  ok(info.COLS >= 40 && info.ROWS >= 20, '字符网格应已建立: ' + info.COLS + 'x' + info.ROWS);
  ok(info.pal > 100, '调色板应有大量槽位: ' + info.pal);
  eq(app.hook.state(), 'menu', '启动后应停在主菜单状态');
  ok(AFP.world.blocks.length === 24 * 24, '世界街区模板应生成满: ' + AFP.world.blocks.length);
});

group('世界生成', () => {
  let buildings = 0, trees = 0;
  for (const b of AFP.world.blocks) { buildings += b.buildings.length; trees += b.trees.length; }
  ok(buildings > 300, '城市应有大量楼房，实际 ' + buildings);
  ok(trees > 100, '应有树木，实际 ' + trees);
  const h = AFP.world.blocks.map(b => b.buildings.reduce((m, x) => Math.max(m, x.h), 0));
  ok(Math.max.apply(null, h) > 80, '应存在高楼，最高 ' + Math.max.apply(null, h).toFixed(1));
  ok(Math.min.apply(null, h) < 40, '应存在低矮街区');
  /* 同一坐标多次取模必须得到同一街区（无限平铺） */
  const a = AFP.world.blockAt(3, 5), b = AFP.world.blockAt(3 + 24, 5 - 48);
  eq(a, b, '±TILES 偏移应命中同一街区模板');
});

/* =====================================================================
   3. i18n
   ===================================================================== */
group('多语言', () => {
  const zh = AFP.i18n.dicts.zh, en = AFP.i18n.dicts.en;
  ok(!!zh && !!en, '应存在中英文语言包');
  const missing = AFP.i18n.missingKeys('zh', 'en');
  eq(missing.length, 0, '中英文词条必须一一对应，缺失: ' + missing.slice(0, 8).join(', '));
  eq(AFP.i18n.lang, 'zh', '默认语言为中文');
  ok(/楼宇穿越/.test(AFP.t('app.title')), '中文标题');
  AFP.i18n.setLang('en');
  eq(AFP.i18n.lang, 'en', '切换为英文');
  ok(/City Run/.test(AFP.t('app.title')), '英文标题');
  eq(AFP.t('missing.key.xyz'), 'missing.key.xyz', '缺失词条回退为 key');
  ok(/4/.test(AFP.t('menu.campaign.sub', { n: 4 })), 't() 应做 {var} 插值');
  ok(/\{n\}/.test(AFP.t('menu.campaign.sub', { n: 4 })) === false, '插值后不应残留占位符');
  AFP.i18n.setLang('zh');
});

/* =====================================================================
   3.5 地图多样性（生物群系）
   ===================================================================== */
group('生物群系', () => {
  const st = AFP.world.biomeStats();
  const ids = Object.keys(st);
  ok(ids.length >= 4, '应生成多种城区，实际 ' + ids.join('/'));
  ids.forEach(id => ok(st[id].blocks >= 4, '「' + id + '」应成片出现，实际 ' + st[id].blocks + ' 个街区'));
  ok(st.downtown && st.downtown.maxH > 150, '市中心应有超高楼，最高 ' + (st.downtown || {}).maxH);
  ok(st.downtown && st.suburb && st.downtown.avgH > st.suburb.avgH * 1.8,
    '市中心平均楼高应远高于住宅区: ' + (st.downtown || {}).avgH.toFixed(1) + ' vs ' + (st.suburb || {}).avgH.toFixed(1));
  ok(st.park && st.park.buildings <= st.park.blocks * 2, '公园区应几乎不盖楼，实际 ' + (st.park || {}).buildings + ' 栋');
  ok(st.park && st.suburb && (st.park.trees / st.park.blocks) > (st.suburb.trees / st.suburb.blocks),
    '公园区树木密度应高于住宅区');
  ok(st.industry && st.industry.avgH < 40, '工业区应为低矮厂房，平均 ' + (st.industry || {}).avgH.toFixed(1) + ' m');
  /* 同一坐标稳定 */
  const id1 = AFP.world.blockAt(7, 9).biome, id2 = AFP.world.blockAt(7 + 24, 9).biome;
  eq(id1, id2, '生物群系随坐标取模无限平铺');
  ok(typeof AFP.world.biomeLabel(100, 100) === 'string' && AFP.world.biomeLabel(100, 100).length > 0,
    '应能取到当前城区名');
  ok(!!AFP.world.biomeGroundOverride, '应注册地面材质覆盖（水面 / 裸土）');
});

/* =====================================================================
   3.8 空中障碍物
   ===================================================================== */
group('空中障碍物', () => {
  const O = AFP.world.obstacles;
  ok(!!O, '应有障碍物模块');
  const st = O.stats();
  ok(st.total > 100, '障碍物数量应成规模，实际 ' + st.total);
  ok(st.by.balloon > 10, '应有气球，实际 ' + st.by.balloon);
  ok(st.by.plane > 10, '应有飞行器，实际 ' + st.by.plane);
  ok(st.by.drone > 10, '应有无人机，实际 ' + st.by.drone);
  ok(st.minY > 8, '障碍物不应埋在地面里，最低 ' + st.minY.toFixed(1) + ' m');
  eq(st.by.belowRoof || 0, 0, '障碍物不应生成在楼顶之下（会穿楼）');

  /* 位置随时间变化（真正的移动障碍物） */
  const blk = AFP.world.blocks.find(b => b.obs && b.obs.length);
  const o = blk.obs[0];
  const ox = blk.bx * AFP.cfg.BLOCK, oz = blk.bz * AFP.cfg.BLOCK;
  const p0 = [0, 0, 0], p1 = [0, 0, 0];
  AFP.S.time = 0; O.pos(o, ox, oz, p0);
  AFP.S.time = 5; O.pos(o, ox, oz, p1);
  const moved = Math.abs(p1[0] - p0[0]) + Math.abs(p1[1] - p0[1]) + Math.abs(p1[2] - p0[2]);
  ok(moved > 0.5, '障碍物应随时间移动，位移 ' + moved.toFixed(2) + ' m');

  /* 撞上气球 → 坠机（原因 3） */
  const balloonBlk = AFP.world.blocks.find(b => b.obs.some(x => x.type === 'balloon'));
  const bo = balloonBlk.obs.find(x => x.type === 'balloon');
  const box = balloonBlk.bx * AFP.cfg.BLOCK, boz = balloonBlk.bz * AFP.cfg.BLOCK;
  const bp = [0, 0, 0];
  O.pos(bo, box, boz, bp);
  AFP.game.player.respawn({ x: bp[0], y: bp[1], z: bp[2], spd: 26 });
  eq(AFP.game.player.collide(), 3, '撞上气球应判定坠机（原因 3）');

  /* 渲染：把相机正对气球，画面里应出现气球材质的颜色 */
  AFP.S.time = 0;
  O.pos(bo, box, boz, bp);
  AFP.game.fsm.go('play');
  AFP.game.player.respawn({ x: bp[0], y: bp[1], z: bp[2] - 40, spd: 26 });
  app.hook.setCam({ yaw: 0, pitch: 0, roll: 0 });
  app.hook.render();
  const BUF = AFP.render.buf, V = AFP.render.view;
  const pals = AFP.render.pal.M_BALLOON.map(m => m.pal);
  let hit = 0;
  for (let i = 0; i < BUF.colr.length; i++) {
    const c = BUF.colr[i];
    for (const p of pals) if (c >= p && c < p + AFP.cfg.LEVELS) { hit++; break; }
  }
  ok(hit > 4, '正对气球渲染时画面应含气球颜色，实际 ' + hit + ' 格');
});

/* =====================================================================
   3.9 闯关模式 / 自由飞行
   ===================================================================== */
group('闯关模式', () => {
  const L = AFP.game.levels;
  ok(!!L, '应有关卡模块');
  ok(L.count() >= 6, '应有多个关卡，实际 ' + L.count());
  L.resetProgress();
  const c = L.start(0);
  eq(AFP.S.mode, 'level', '应进入闯关模式');
  eq(AFP.game.fsm.cur, 'play', '应进入飞行状态');
  eq(AFP.S.gates.length, L.defs[0].gates, '光环数量应与关卡定义一致');
  ok(AFP.S.countdown > 0, '起飞前应有倒计时');
  c.gates.forEach((g, i) => {
    eq(((g.x - 8) % 64 + 64) % 64, 0, '光环 ' + i + ' 应落在南北向道路中心线上');
    eq(((g.z - 8) % 64 + 64) % 64, 0, '光环 ' + i + ' 应落在东西向道路中心线上');
    ok(g.y >= L.defs[0].alt[0] - 1 && g.y <= L.defs[0].alt[1] + 1, '光环高度应在设定区间内');
    ok(g.r >= 8, '光环应有可穿过的半径');
  });
  /* 同一关卡两次生成必须完全一致（确定性） */
  const c2 = L.build(0);
  eq(c2.gates[0].x, c.gates[0].x, '关卡生成应可复现');
  eq(c2.gates.map(g => g.y).join(','), c.gates.map(g => g.y).join(','), '光环高度序列应可复现');

  /* 倒计时期间世界静止 */
  const z0 = AFP.S.camZ;
  for (let i = 0; i < 30; i++) AFP.game.fsm.update(1 / 120);
  near(AFP.S.camZ, z0, 1e-6, '倒计时期间不应推进物理');
  AFP.S.countdown = 0;

  /* 依次穿过全部光环 → 通关 */
  for (let i = 0; i < c.gates.length; i++) {
    const g = c.gates[i];
    ok(AFP.S.gateIndex === i, '应按顺序等待第 ' + (i + 1) + ' 个光环');
    app.hook.setCam({ x: g.x, y: g.y, z: g.z });
    AFP.game.fsm.update(1 / 120);
  }
  eq(AFP.S.gateIndex, c.gates.length, '应记录穿过全部光环');
  eq(AFP.S.raceDone, true, '应标记通关');
  eq(AFP.game.fsm.cur, 'result', '通关后应进入结算界面');
  eq(AFP.game.levels.progress().cleared, 1, '应记录已通关第 1 关');
  ok(AFP.game.levels.unlocked(1), '第 2 关应解锁');
  ok(AFP.game.levels.bestTime(0) !== null, '应记录最佳用时');
  eq(JSON.parse(app.store['asciifpv.progress']).cleared, 1, '进度应持久化');

  /* 乱序飞过后面的光环不应计数 */
  L.start(1);
  AFP.S.countdown = 0;
  const g2 = AFP.S.gates[2];
  app.hook.setCam({ x: g2.x, y: g2.y + 30, z: g2.z });
  AFP.game.fsm.update(1 / 120);
  eq(AFP.S.gateIndex, 0, '未按顺序到达不应推进');

  /* 超时失败 */
  L.start(1);
  AFP.S.countdown = 0;
  AFP.S.raceTime = L.defs[1].time + 1;
  AFP.game.fsm.update(1 / 120);
  eq(AFP.S.crashReason, 4, '超时应记为坠机原因 4');
  eq(AFP.game.fsm.cur, 'crash', '超时后应进入坠机界面');

  /* 失败可重来 */
  AFP.ui.screens.dispatch('retry');
  eq(AFP.game.fsm.cur, 'play', '重来应重新进入飞行');
  eq(AFP.S.mode, 'level', '重来仍在闯关模式');
  eq(AFP.S.gateIndex, 0, '重来应重置目标点');
  ok(AFP.S.countdown > 0, '重来应重新倒计时');
});

group('自由飞行', () => {
  AFP.ui.screens.dispatch('free');
  eq(AFP.S.mode, 'free', '应为自由飞行模式');
  eq(AFP.S.gates.length, 0, '自由飞行没有目标点');
  eq(AFP.S.countdown, 0, '自由飞行不应有倒计时');
  const y0 = AFP.S.flown;
  AFP.S.collideOn = false;
  AFP.game.fsm.update(1 / 120);
  ok(AFP.S.flown > y0, '自由飞行应正常推进');
  AFP.S.collideOn = true;
  eq(AFP.S.raceTime, 0, '自由飞行不计关卡时间');
});

group('选关界面', () => {
  AFP.game.fsm.go('menu');
  AFP.ui.screens.dispatch('levels');
  eq(AFP.game.fsm.cur, 'levels', '应进入选关界面');
  const html = app.doc.getElementById('ui').innerHTML;
  ok(/data-scr="levels"/.test(html), '应渲染选关面板');
  ok(/data-act="level:0"/.test(html), '第 1 关可点');
  ok(/data-act="level:7"/.test(html), '最后一关卡片应存在');
  const cards = app.doc.getElementById('ui').querySelectorAll('.card');
  eq(cards.length, AFP.game.levels.count(), '卡片数应等于关卡数');
  const locked = cards.filter(x => x.getAttribute('disabled') !== null).length;
  ok(locked > 0, '未解锁关卡应被禁用，实际禁用 ' + locked);
  ok(AFP.game.levels.unlocked(1) && !AFP.game.levels.unlocked(3), '解锁进度应为 1 关');
  AFP.ui.screens.dispatch('quit');
  eq(AFP.game.fsm.cur, 'menu', '返回主菜单');
});

/* =====================================================================
   4. 画面渲染
   ===================================================================== */
group('渲染', () => {
  app.hook.render();
  const dump = app.hook.dump();
  ok(dump.length > 0, '应有画面输出');
  const rows = dump.split('\n');
  eq(rows.length, app.hook.info().ROWS, '输出行数应等于字符行数');
  const filled = dump.replace(/\s/g, '').length;
  ok(filled > 200, '画面应有实体字符，实际 ' + filled);
  ok(app.ctxCalls.fillText > 0, '应把字符刷到画布上');
});

/* =====================================================================
   5. 状态机
   ===================================================================== */
group('状态机', () => {
  const fsm = AFP.game.fsm;
  fsm.go('menu');
  ok(fsm.is('menu'), '当前在主菜单');
  AFP.ui.screens.dispatch('free');
  eq(fsm.cur, 'play', '点击「自由飞行」应进入 play');
  eq(AFP.S.mode, 'free', '模式为自由飞行');
  app.hook.action('pause');
  eq(fsm.cur, 'pause', 'play → pause');
  app.hook.action('pause');
  eq(fsm.cur, 'play', 'pause → play');
  app.hook.action('hud');
  eq(AFP.S.hudOn, false, 'H 键应切换 HUD');
  app.hook.action('hud');
  eq(AFP.S.hudOn, true, 'H 键应切回 HUD');
  app.hook.action('back');
  eq(fsm.cur, 'pause', 'Esc 在 play 中应暂停');
  AFP.ui.screens.dispatch('quit');
  eq(fsm.cur, 'menu', '返回主菜单');
});

/* =====================================================================
   6. 飞行力学与碰撞
   ===================================================================== */
group('飞行力学', () => {
  AFP.ui.screens.dispatch('free');
  const S = AFP.S;
  const z0 = S.camZ, y0 = S.camY;
  app.hook.axes({ pitch: 0, roll: 0, thr: 1 });
  for (let i = 0; i < 120; i++) app.hook.step(1 / 120);
  ok(S.camZ > z0, '油门加速应向前飞行（Z 增大）');
  ok(S.spd > 26, '速度应增加: ' + S.spd.toFixed(1));
  app.hook.axes({ pitch: 1, roll: 0, thr: 0 });
  for (let i = 0; i < 60; i++) app.hook.step(1 / 120);
  ok(S.pitch > 0, '抬头输入应增加俯仰角');
  ok(S.camY > y0, '抬头应爬升');
  app.hook.axes({ pitch: 0, roll: 1, thr: 0 });
  const yaw0 = S.yaw;
  for (let i = 0; i < 60; i++) app.hook.step(1 / 120);
  ok(S.roll > 0, '右滚输入应产生右滚角');
  ok(S.yaw !== yaw0, '滚转应产生协调转弯（偏航）');
  app.hook.axes({ pitch: 0, roll: 0, thr: 0 });
});

group('限幅与碰撞', () => {
  const S = AFP.S;
  app.hook.axes({ pitch: 1, roll: 1, thr: 1 });
  for (let i = 0; i < 1200; i++) app.hook.step(1 / 120);
  ok(S.roll <= 45.001 && S.roll >= -45.001, '滚转应限制在 ±45°，实际 ' + S.roll);
  ok(S.pitch <= 45.001, '俯仰应限制在 ±45°');
  ok(S.spd <= 50.001, '速度上限 50');
  app.hook.axes({ pitch: 0, roll: 0, thr: 0 });

  /* 直接把相机放进一栋楼里 */
  AFP.game.player.respawn({ x: 8, y: 48, z: -56, spd: 26 });
  const blk = AFP.world.blocks.find(b => b.buildings.length);
  const b = blk.buildings[0];
  const ox = blk.bx * AFP.cfg.BLOCK, oz = blk.bz * AFP.cfg.BLOCK;
  app.hook.setCam({ x: ox + b.x + b.w / 2, y: Math.min(b.h / 2, 20), z: oz + b.z + b.d / 2 });
  app.hook.step(1 / 120);
  eq(AFP.S.crashed, 2, '撞楼应判定坠机（原因 2）');
  ok(AFP.game.fsm.is('crash') || AFP.S.crashed === 2, '坠机后应可进入坠机状态');
});

/* =====================================================================
   7. 输入
   ===================================================================== */
group('键盘输入', () => {
  AFP.game.fsm.go('menu');
  AFP.ui.screens.dispatch('free');
  app.hook.key('KeyZ', true);
  app.hook.AFP.input.update();
  eq(AFP.S.axes.thr, 1, 'Z 键 → 油门 +1');
  app.hook.key('KeyZ', false);
  app.hook.key('KeyW', true);
  AFP.input.update();
  eq(AFP.S.axes.pitch, -1, 'W 键 → 俯冲（pitch -1）');
  app.hook.key('KeyW', false);
  app.hook.key('KeyD', true);
  AFP.input.update();
  eq(AFP.S.axes.roll, 1, 'D 键 → 右滚 +1');
  app.hook.key('KeyD', false);
  AFP.input.update();
  eq(AFP.S.axes.roll, 0, '松开后回中');
});

group('主菜单', () => {
  AFP.game.fsm.go('menu');
  eq(AFP.i18n.lang, 'zh', '默认中文');
  /* 菜单上的语言按钮：走的是 states.js 的通用动作，不能被设置处理器吞掉 */
  AFP.ui.screens.dispatch('lang');
  eq(AFP.i18n.lang, 'en', '主菜单语言按钮应切到英文');
  eq(JSON.parse(app.store['asciifpv.settings']).lang, 'en', '语言选择应持久化');
  const ui = app.doc.getElementById('ui');
  ok(/City Run/.test(ui.textContent), '菜单应显示英文标题');
  ok(/Campaign/.test(ui.textContent), '菜单应有闯关模式入口');
  ok(/Free Flight/.test(ui.textContent), '菜单应有自由飞行入口');
  ok(/Settings/.test(ui.textContent), '菜单应有设置入口');
  ok(/Select Level/.test(ui.textContent), '菜单应有选关入口');
  AFP.ui.screens.dispatch('lang');
  eq(AFP.i18n.lang, 'zh', '再点一次回中文');
  ok(/楼宇穿越/.test(app.doc.getElementById('ui').textContent), '菜单应显示中文标题');
  /* 菜单动作 */
  AFP.ui.screens.dispatch('settings');
  eq(AFP.game.fsm.cur, 'settings', '菜单 → 设置');
  AFP.ui.screens.dispatch('back');
  eq(AFP.game.fsm.cur, 'menu', '设置 → 返回菜单');
  AFP.ui.screens.dispatch('help');
  eq(AFP.game.fsm.cur, 'help', '菜单 → 操作说明');
  AFP.ui.screens.dispatch('back');
  eq(AFP.game.fsm.cur, 'menu', '操作说明 → 返回菜单');
});

group('暂停菜单', () => {
  AFP.ui.screens.dispatch('free');
  eq(AFP.game.fsm.cur, 'play', '进入飞行');
  AFP.game.onInputAction('pause');
  eq(AFP.game.fsm.cur, 'pause', 'Space 暂停');
  AFP.ui.screens.dispatch('settings');
  eq(AFP.game.fsm.cur, 'settings', '暂停 → 设置');
  AFP.ui.screens.dispatch('back');
  eq(AFP.game.fsm.cur, 'pause', '设置应回到暂停而不是主菜单');
  AFP.ui.screens.dispatch('restart');
  eq(AFP.game.fsm.cur, 'play', '暂停 → 重新开始');
  AFP.game.onInputAction('pause');
  AFP.ui.screens.dispatch('quit');
  eq(AFP.game.fsm.cur, 'menu', '暂停 → 返回主菜单');
});

/* =====================================================================
   6.5 碰撞宽容度（判定要比看得见的轮廓更宽松）
   ===================================================================== */
group('碰撞宽容度', () => {
  const A = H.boot();
  const AF = A.AFP, P = AF.game.player, HIT = AF.cfg.HIT, O = AF.world.obstacles;
  ok(HIT.GROUND < 1.2, '地面判定应比原来的 1.2m 更宽松，实际 ' + HIT.GROUND);
  eq(HIT.WALL, 0, '楼体判定不得内缩，否则能贴着屋面钻进楼体里飞');
  ok(HIT.OBST < 1, '障碍物判定球应小于可见外形，实际 ' + HIT.OBST);

  /* ---- 楼房：先屏蔽空中障碍物，单独验证楼体判定 ---- */
  const realHitBlock = O.hitBlock;
  O.hitBlock = function () { return false; };

  const blk = AF.world.blocks.find(b => b.buildings.length);
  const b = blk.buildings[0];
  const ox = blk.bx * 64, oz = blk.bz * 64;
  const czc = oz + b.z + b.d / 2, cxc = ox + b.x + b.w / 2;
  const midY = b.h * 0.5;
  function at(x, y, z) { A.hook.setCam({ x: x, y: y, z: z, spd: 26 }); return P.collide(); }

  eq(at(ox + b.x - 0.3, midY, czc), 0, '贴墙外 0.3m（旧判定会撞）不应判撞');
  eq(at(ox + b.x - 0.6, midY, czc), 0, '墙外 0.6m 不应判撞');
  eq(at(ox + b.x - 0.02, midY, czc), 0, '墙外 2cm 仍算在外');
  eq(at(ox + b.x + 0.05, midY, czc), 2, '进入墙体 5cm 就应判撞（不允许飞进楼体）');
  eq(at(ox + b.x + 0.2, midY, czc), 2, '进入墙体 0.2m 应判撞（曾经的漏洞：从屋面边缘钻进去）');
  eq(at(ox + b.x + 1.0, midY, czc), 2, '进墙 1m 应判撞');
  eq(at(cxc, midY, czc), 2, '楼体中心应判撞');
  eq(at(ox + b.x + 0.05, b.h + 0.3, czc), 0, '墙体上方（高过屋面）不应判撞');
  eq(at(ox + b.x + 0.2, b.h - 0.05, czc), 2, '沿屋面边缘往下钻必须判撞');
  eq(at(cxc, b.h + 0.3, czc), 0, '擦着屋顶上方 0.3m（旧判定会撞）不应判撞');
  eq(at(cxc, b.h + 0.05, czc), 0, '刚好高过屋顶不应判撞');
  eq(at(cxc, b.h - 0.05, czc), 2, '低于屋顶平面应判撞');
  eq(at(cxc, b.h + 40, czc), 0, '屋顶上方高空不应判撞');

  /* ---- 地面 ---- */
  eq(at(8, 1.0, -56), 0, '离地 1.0m（旧判定会撞）不应判撞');
  eq(at(8, HIT.GROUND + 0.05, -56), 0, '刚高于地面判定线不应判撞');
  eq(at(8, HIT.GROUND - 0.05, -56), 1, '低于地面判定线应判撞');
  O.hitBlock = realHitBlock;

  /* ---- 空中障碍物：擦着可见轮廓边走不应致命 ---- */
  function balloon() {
    const blk2 = AF.world.blocks.find(x => x.obs.some(o => o.type === 'balloon'));
    return { o: blk2.obs.find(o => o.type === 'balloon'), ox: blk2.bx * 64, oz: blk2.bz * 64 };
  }
  AF.S.time = 0;
  const bb = balloon(), bp = [0, 0, 0];
  O.pos(bb.o, bb.ox, bb.oz, bp);
  const R = bb.o.hitR + HIT.SKIN;
  ok(R < bb.o.r, '气球判定球 ' + R.toFixed(2) + 'm 应小于可见气囊半径 ' + bb.o.r.toFixed(2) + 'm');
  eq(at(bp[0] + bb.o.r + 1.0, bp[1], bp[2]), 0, '气囊外 1m 不应判撞');
  eq(at(bp[0] + R + 0.3, bp[1], bp[2]), 0, '判定球外 0.3m 不应判撞（旧判定半径 ' + (bb.o.r + 3.4).toFixed(1) + 'm）');
  eq(at(bp[0] + R * 0.9, bp[1], bp[2]), 3, '进入判定球应判撞');
  eq(at(bp[0], bp[1], bp[2]), 3, '穿过气囊中心应判撞');

  /* 飞行器 / 无人机：判定明显小于原来的 7.2m / 4.0m */
  const pb = AF.world.blocks.find(x => x.obs.some(o => o.type === 'plane'));
  const po = pb.obs.find(o => o.type === 'plane');
  const pp = [0, 0, 0];
  O.pos(po, pb.bx * 64, pb.bz * 64, pp);
  ok(po.hitR + HIT.SKIN < 5.2 + 2.0, '飞行器判定应比原来宽松');
  eq(at(pp[0] + 6.5, pp[1], pp[2]), 0, '从机翼端外侧飞过不应判撞');
  eq(at(pp[0], pp[1], pp[2]), 3, '撞上机身应判撞');

  const db = AF.world.blocks.find(x => x.obs.some(o => o.type === 'drone'));
  const doo = db.obs.find(o => o.type === 'drone');
  const dp = [0, 0, 0];
  O.pos(doo, db.bx * 64, db.bz * 64, dp);
  eq(at(dp[0] + 3.0, dp[1], dp[2]), 0, '从无人机旁 3m 飞过不应判撞（旧判定 4m）');
  eq(at(dp[0], dp[1], dp[2]), 3, '撞上无人机应判撞');

  /* 放宽后仍然撞得进楼（不是变成穿墙） */
  eq(at(cxc, midY, czc), 2, '放宽后楼体仍然是实心的');
});

/* =====================================================================
   6.6 楼体实心（不允许在楼体里飞）
   ===================================================================== */
group('楼体实心', () => {
  const A = H.boot();
  const AF = A.AFP, P = AF.game.player, O = AF.world.obstacles;
  const savedHitBlock = O.hitBlock;
  O.hitBlock = function () { return false; };          // 只考察楼体判定
  let tested = 0, bad = 0, worst = null;
  /* 采样 8x8 个街区里每栋楼的内部点：贴近每个面、楼体中部、屋顶下方 */
  for (let bz = 0; bz < 8; bz++) {
    for (let bx = 0; bx < 8; bx++) {
      const blk = AF.world.blockAt(bx, bz), ox = bx * 64, oz = bz * 64;
      for (const b of blk.buildings) {
        if (b.h < 3) continue;
        const xs = [b.x + 0.05, b.x + b.w / 2, b.x + b.w - 0.05];
        const zs = [b.z + 0.05, b.z + b.d / 2, b.z + b.d - 0.05];
        const ys = [1, Math.max(1, b.h * 0.35), b.h - 0.05];
        for (const x of xs) {
          for (const z of zs) {
            for (const y of ys) {
              tested++;
              A.hook.setCam({ x: ox + x, y: y, z: oz + z, spd: 26 });
              const r = P.collide();
              if (r !== 2) { bad++; if (!worst) worst = { bx, bz, x: x.toFixed(2), y: y.toFixed(2), z: z.toFixed(2), got: r }; }
            }
          }
        }
      }
    }
  }
  O.hitBlock = savedHitBlock;
  ok(tested > 500, '楼体内部采样点应足够多，实际 ' + tested);
  eq(bad, 0, '楼体内任意一点都必须判撞（采样 ' + tested + ' 点，漏判 ' + bad +
    (worst ? '，例如 ' + JSON.stringify(worst) : '') + '）');

  /* 屋面拐角那条缝曾经能钻进去：贴着墙面内侧从屋面之下到之上逐点检查 */
  const blk = AF.world.blocks.find(b => b.buildings.length);
  const b0 = blk.buildings[0], ox0 = blk.bx * 64, oz0 = blk.bz * 64;
  const cz0 = oz0 + b0.z + b0.d / 2;
  let leaks = 0;
  for (let d = 0.01; d < Math.min(b0.w, b0.d) / 2; d += 0.05) {
    for (let y = 1; y < b0.h; y += 0.5) {
      A.hook.setCam({ x: ox0 + b0.x + d, y: y, z: cz0, spd: 26 });
      if (P.collide() !== 2) leaks++;
    }
  }
  eq(leaks, 0, '沿墙面内侧逐点扫描不应有漏判，实际漏判 ' + leaks + ' 点');
});

/* =====================================================================
   7. 设置界面与持久化
   ===================================================================== */
group('设置', () => {
  const St = AFP.ui.settings;
  ok(!!St, '应有设置模块');
  AFP.game.fsm.go('menu');
  AFP.ui.screens.dispatch('settings');
  eq(AFP.game.fsm.cur, 'settings', '菜单可进入设置界面');
  const html = app.doc.getElementById('ui').innerHTML;
  ok(/data-scr="settings"/.test(html), '设置面板应已渲染');
  ok(/data-act="controlMode:gyro"/.test(html), '应能切换陀螺仪');
  ok(/data-act="lang:en"/.test(html), '应能切换语言');
  ok(/data-act="hud:0"/.test(html), '应能关闭 HUD');
  ok(/data-act="reset:progress"/.test(html), '应能清除进度');

  /* 语言切换 → 立即生效并落盘 */
  AFP.ui.screens.dispatch('lang:en');
  eq(AFP.i18n.lang, 'en', '设置里切换语言应生效');
  const ui = app.doc.getElementById('ui');
  ok(/City Run/.test(ui.textContent), '界面文案应换成英文（实际: ' + ui.textContent.slice(0, 60) + '）');
  eq(JSON.parse(app.store['asciifpv.settings']).lang, 'en', '语言应持久化');
  AFP.ui.screens.dispatch('lang:zh');
  eq(AFP.i18n.lang, 'zh', '切回中文');
  ok(/楼宇穿越/.test(ui.textContent), '界面文案应换回中文');

  /* HUD / 碰撞开关 */
  AFP.ui.screens.dispatch('hud:0');
  eq(AFP.S.hudOn, false, '关闭 HUD 应生效');
  AFP.ui.screens.dispatch('hud:1');
  eq(AFP.S.hudOn, true, '打开 HUD 应生效');
  AFP.ui.screens.dispatch('collide:0');
  eq(AFP.S.collideOn, false, '关闭碰撞应生效');
  AFP.ui.screens.dispatch('collide:1');
  eq(AFP.S.collideOn, true, '打开碰撞应生效');

  /* 操控方式 / 触屏布局 / 灵敏度 */
  AFP.ui.screens.dispatch('controlMode:both');
  eq(St.get('controlMode'), 'both', '操控方式可切到摇杆+陀螺仪');
  AFP.ui.screens.dispatch('controlMode:stick');
  AFP.ui.screens.dispatch('touchLayout:single');
  eq(St.get('touchLayout'), 'single', '触屏布局可切到单摇杆');
  AFP.ui.screens.dispatch('touchLayout:split');
  const s0 = St.get('stickSens');
  AFP.ui.screens.dispatch('stickSens:+');
  ok(St.get('stickSens') > s0, '灵敏度 + 应提高');
  AFP.ui.screens.dispatch('stickSens:-');
  eq(St.get('stickSens'), s0, '灵敏度 - 应还原');

  /* 字符密度：以「实际排出来的列数」为准，设置界面与 HUD 右下角
     必须显示同一组数字（曾经一个是期望列数、一个是实际列数，对不上） */
  const V = AFP.render.view;
  const c0 = V.COLS, r0 = V.ROWS;
  ok(c0 > 40 && r0 > 20, '应有正常网格: ' + c0 + 'x' + r0);
  AFP.ui.screens.dispatch('density:16');
  ok(V.COLS > c0, '密度 + 应增加实际列数: ' + c0 + ' → ' + V.COLS);
  ok(Math.abs(V.COLS - (c0 + 16)) <= 8, '实际列数应接近请求值，实际 ' + V.COLS + '（请求 ' + (c0 + 16) + '）');
  const cUp = V.COLS;
  const panelHtml = app.doc.getElementById('ui').innerHTML;
  ok(panelHtml.indexOf(cUp + ' × ' + V.ROWS) >= 0, '设置界面应显示实际 ' + cUp + ' × ' + V.ROWS);
  /* HUD 右下角用同一组数字 */
  AFP.render.grid.clear();
  AFP.render.hud.drawHUD();
  ok(app.hook.dump().indexOf(cUp + 'x' + V.ROWS) >= 0, 'HUD 右下角应显示同一组网格尺寸 ' + cUp + 'x' + V.ROWS);
  AFP.ui.screens.dispatch('density:-16');
  ok(V.COLS < cUp, '密度 - 应减少实际列数: ' + cUp + ' → ' + V.COLS);
  /* 自动档 */
  AFP.ui.screens.dispatch('density:auto');
  eq(AFP.ui.settings.get('density'), 0, '自动档应存 0');
  eq(V.COLS, c0, '自动档应回到默认列数');
  ok(JSON.parse(app.store['asciifpv.settings']).density === 0, '自动档应持久化');
  /* 密度选择会持久化（下次启动同一设备得到同一网格） */
  AFP.ui.screens.dispatch('density:16');
  const savedDensity = JSON.parse(app.store['asciifpv.settings']).density;
  ok(savedDensity > 0, '密度应持久化，实际 ' + savedDensity);
  const cAgain = H.boot({ storage: { 'asciifpv.settings': JSON.stringify({ density: savedDensity }) } });
  eq(cAgain.AFP.render.view.COLS, cUp, '重启后应还原同一组列数');

  /* 返回 */
  AFP.ui.screens.dispatch('back');
  eq(AFP.game.fsm.cur, 'menu', '设置返回主菜单');
});

group('密度与键盘', () => {
  const A2 = H.boot();
  const V2 = A2.AFP.render.view;
  const before = V2.COLS;
  A2.dispatch('keydown', { code: 'BracketRight', target: { closest: function () { return null; } }, preventDefault: function () { } });
  ok(V2.COLS > before, '] 键应增大实际列数: ' + before + ' → ' + V2.COLS);
  const after = V2.COLS;
  A2.dispatch('keydown', { code: 'BracketLeft', target: { closest: function () { return null; } }, preventDefault: function () { } });
  ok(V2.COLS < after, '[ 键应减小实际列数: ' + after + ' → ' + V2.COLS);
  ok(A2.AFP.ui.settings.get('density') > 0, '键盘调节也应存进设置');
  /* 网格变化后画面仍能正常渲染 */
  A2.AFP.game.fsm.go('menu');
  A2.hook.render();
  ok(A2.hook.dump().replace(/\s/g, '').length > 200, '改密度后画面仍应正常');
});

/* =====================================================================
   7.2 密度下限（可玩性保护）
   ===================================================================== */
group('密度下限', () => {
  const A = H.boot();
  const V = A.AFP.render.view;
  eq(V.MIN_COLS, 84, '最小列数下限应为 84');
  eq(V.MIN_ROWS, 25, '最小行数下限应为 25');
  ok(V.minGrid && V.minGrid.COLS >= 84 && V.minGrid.ROWS >= 25,
    '当前窗口的最小网格应满足下限，实际 ' + V.minGrid.COLS + '×' + V.minGrid.ROWS);

  /* 一路按 - 到底，实际网格不得低于下限 */
  A.AFP.game.fsm.go('menu');
  A.AFP.ui.screens.dispatch('settings');
  for (let i = 0; i < 30; i++) A.AFP.ui.screens.dispatch('density:-16');
  ok(V.COLS >= V.MIN_COLS, '连续降低密度不得少于 ' + V.MIN_COLS + ' 列，实际 ' + V.COLS);
  ok(V.ROWS >= V.MIN_ROWS, '连续降低密度不得少于 ' + V.MIN_ROWS + ' 行，实际 ' + V.ROWS);
  eq(V.COLS, V.minGrid.COLS, '到底时应停在最小网格');
  const panelNow = A.doc.getElementById('ui').innerHTML;
  ok(new RegExp('data-act="density:-16" disabled').test(panelNow), '到底后「-」按钮应禁用');
  ok(panelNow.indexOf('下限 ' + V.minGrid.COLS + ' × ' + V.minGrid.ROWS) >= 0, '面板应说明下限');
  /* 键盘同样到不了下限以下 */
  const atFloor = V.COLS;
  A.dispatch('keydown', { code: 'BracketLeft', target: { closest: function () { return null; } }, preventDefault: function () { } });
  eq(V.COLS, atFloor, '[ 键也不得突破下限');
  /* 直接请求更低的列数同样被挡住 */
  const got = A.AFP.render.grid.setColumns(10);
  ok(got >= V.MIN_COLS, 'setColumns(10) 应被抬到下限，实际 ' + got);
  /* 画面在最小密度下仍然可用 */
  A.AFP.ui.screens.dispatch('free');
  A.hook.render();
  const rows = A.hook.dump().split('\n');
  eq(rows.length, V.ROWS, '行数应与网格一致');
  ok(A.hook.dump().replace(/\s/g, '').length > 200, '最小密度下画面仍应有内容');

  /* 极宽 / 极扁的窗口：行数下限同样生效（此时会自动加密列数） */
  const wide = H.boot({ width: 1280, height: 360, dpr: 2 });
  const WV = wide.AFP.render.view;
  wide.AFP.game.fsm.go('menu');
  wide.AFP.ui.screens.dispatch('settings');
  for (let i = 0; i < 30; i++) wide.AFP.ui.screens.dispatch('density:-16');
  ok(WV.COLS >= WV.MIN_COLS && WV.ROWS >= WV.MIN_ROWS,
    '扁窗口最小网格应满足 84×25，实际 ' + WV.COLS + '×' + WV.ROWS);
});

group('设置持久化', () => {
  /* 模拟上一次会话保存过的设置，重新启动应完整恢复 */
  const app2 = H.boot({
    storage: {
      'asciifpv.settings': JSON.stringify({
        lang: 'en', controlMode: 'gyro', hud: false, collide: false, density: 200, touchLayout: 'single'
      })
    }
  });
  const A3 = app2.AFP;
  eq(A3.i18n.lang, 'en', '重启后应恢复语言');
  eq(A3.ui.settings.get('controlMode'), 'gyro', '重启后应恢复操控方式');
  eq(A3.S.hudOn, false, '重启后应恢复 HUD 开关');
  eq(A3.S.collideOn, false, '重启后应恢复碰撞开关');
  eq(A3.render.view.targetCols, 200, '重启后应恢复字符密度');
  eq(A3.ui.settings.get('touchLayout'), 'single', '重启后应恢复触屏布局');
  ok(/City Run/.test(app2.doc.getElementById('ui').textContent), '重启后界面应为英文');
});

/* =====================================================================
   7.5 陀螺仪
   ===================================================================== */
group('陀螺仪', () => {
  const a = H.boot({ gyro: true });
  const A = a.AFP;
  const G = A.input.gyro;
  ok(!!G, '应有陀螺仪模块');
  ok(G.supported === true, '沙箱声明了 DeviceOrientationEvent，应识别为支持');
  eq(A.ui.settings.get('controlMode'), 'stick', '默认仍是摇杆');

  /* 切到陀螺仪：会走授权流程并挂上监听 */
  A.ui.screens.dispatch('controlMode:gyro');
  eq(G.permission, 'granted', '应取得传感器授权');
  eq(G.enabled, true, '应挂上 deviceorientation 监听');

  /* 第一帧数据即零位 */
  G.feed({ beta: 12, gamma: -6 });
  A.input.update();
  near(A.S.axes.pitch, 0, 1e-6, '第一帧姿态应作为零位');
  near(A.S.axes.roll, 0, 1e-6, '第一帧姿态应作为零位');

  /* 前倾 → 抬头（pitch 正），右倾 → 右滚（roll 正） */
  G.feed({ beta: 12 + 16, gamma: -6 + 16 });
  A.input.update();
  ok(A.S.axes.pitch > 0.3, '设备前倾应产生抬头，实际 ' + A.S.axes.pitch.toFixed(2));
  ok(A.S.axes.roll > 0.3, '设备右倾应产生右滚，实际 ' + A.S.axes.roll.toFixed(2));
  ok(G.active(), '陀螺仪应处于激活状态');

  /* 满舵限幅 */
  G.feed({ beta: 12 + 120, gamma: -6 - 120 });
  A.input.update();
  eq(A.S.axes.pitch, 1, '大角度应限幅到 1');
  eq(A.S.axes.roll, -1, '大角度应限幅到 -1');

  /* 反向设置 */
  A.ui.settings.set('gyroInvertPitch', true);
  A.ui.settings.set('gyroInvertRoll', true);
  G.feed({ beta: 12 + 16, gamma: -6 + 16 });
  A.input.update();
  ok(A.S.axes.pitch < -0.3, '俯仰反向应生效');
  ok(A.S.axes.roll < -0.3, '滚转反向应生效');
  A.ui.settings.set('gyroInvertPitch', false);
  A.ui.settings.set('gyroInvertRoll', false);

  /* 灵敏度：同样的倾角，高灵敏度输出更大 */
  G.feed({ beta: 12 + 8, gamma: -6 });
  A.input.update();
  const lowSens = A.S.axes.pitch;
  A.ui.settings.set('gyroSens', 2.5);
  A.input.update();
  const highSens = A.S.axes.pitch;
  ok(highSens > lowSens, '提高灵敏度应放大输出: ' + lowSens.toFixed(2) + ' → ' + highSens.toFixed(2));
  A.ui.settings.set('gyroSens', 1);

  /* 校准：把当前姿势设为零位 */
  G.feed({ beta: 40, gamma: 20 });
  G.calibrate();
  A.input.update();
  near(A.S.axes.pitch, 0, 1e-6, '校准后当前姿态应为零位');
  near(A.S.axes.roll, 0, 1e-6, '校准后当前姿态应为零位');

  /* 摇杆 + 陀螺仪混合模式 */
  A.ui.screens.dispatch('controlMode:both');
  G.feed({ beta: 40 + 16, gamma: 20 });
  A.input.src.stick.pitch = 0.5; A.input.src.stick.roll = -0.5;
  A.input.update();
  ok(A.S.axes.pitch > 0.5, '混合模式应叠加摇杆与陀螺仪');
  ok(A.S.axes.roll < 0, '混合模式应叠加摇杆与陀螺仪');
  A.input.src.stick.pitch = 0; A.input.src.stick.roll = 0;
  A.ui.screens.dispatch('controlMode:stick');
  eq(G.active(), false, '回到摇杆模式应停用陀螺仪');

  /* 不支持陀螺仪的设备：切到陀螺仪时摇杆仍可用 */
  const b = H.boot({});
  const B = b.AFP;
  eq(B.input.gyro.supported, false, '无 DeviceOrientationEvent 应视为不支持');
  B.ui.screens.dispatch('controlMode:gyro');
  B.input.src.stick.pitch = 0.8;
  B.input.update();
  ok(B.S.axes.pitch > 0.5, '陀螺仪不可用时应自动回退摇杆');
});

/* =====================================================================
   7.8 触屏：左右分屏
   ===================================================================== */
group('触屏分屏', () => {
  const t = H.boot({ touch: true, width: 720, height: 1280, dpr: 2 });
  const A = t.AFP, T = A.input.touch;
  const V = A.render.view;
  eq(V.isTouch, true, '应识别为触屏设备');
  eq(V.targetCols, 96, '小屏触屏应自动降低字符密度');
  A.input.refreshHint();
  eq(A.input.hintKey, 'hud.hint.touch.split', '默认左右分屏提示');
  A.ui.screens.dispatch('free');
  eq(A.game.fsm.cur, 'play', '触屏也能开始飞行');

  const noUi = { closest: function () { return null; } };
  function fire(type, list, ts) {
    t.dispatch(type, { changedTouches: list, timeStamp: ts || 0, target: noUi, cancelable: true });
  }
  function pt(id, x, y) { return { identifier: id, clientX: x, clientY: y }; }

  /* 左半屏：姿态摇杆（相对起手点） */
  fire('touchstart', [pt(1, 120, 640)], 0);
  eq(T.st.stickId, 1, '左半屏触点应成为姿态摇杆');
  eq(T.st.thrId, null, '左半屏触点不应成为油门');
  fire('touchmove', [pt(1, 126, 646)], 20);
  A.input.update();
  eq(A.S.axes.roll, 0, '死区内不应有舵量');
  eq(A.S.axes.pitch, 0, '死区内不应有舵量');
  fire('touchmove', [pt(1, 200, 720)], 60);
  A.input.update();
  ok(A.S.axes.roll > 0.3, '左半屏右滑 → 右滚，实际 ' + A.S.axes.roll.toFixed(2));
  ok(A.S.axes.pitch > 0.3, '左半屏下滑 → 抬头，实际 ' + A.S.axes.pitch.toFixed(2));
  fire('touchend', [pt(1, 200, 720)], 90);
  A.input.update();
  eq(A.S.axes.roll, 0, '松手摇杆回中');
  eq(T.st.active, false, '摇杆应释放');

  /* 右半屏：油门（上滑加速，松手回中） */
  fire('touchstart', [pt(2, 600, 900)], 100);
  eq(T.st.thrId, 2, '右半屏触点应成为油门');
  eq(T.st.stickId, null, '右半屏触点不应成为姿态摇杆');
  fire('touchmove', [pt(2, 600, 900 - 120)], 140);
  A.input.update();
  ok(A.S.axes.thr > 0.9, '右半屏上滑应给满油门，实际 ' + A.S.axes.thr.toFixed(2));
  eq(A.S.axes.roll, 0, '油门不应影响姿态');
  fire('touchmove', [pt(2, 600, 900 + 120)], 180);
  A.input.update();
  ok(A.S.axes.thr < -0.9, '右半屏下滑应减速');
  fire('touchend', [pt(2, 600, 900)], 200);
  A.input.update();
  eq(A.S.axes.thr, 0, '油门松手应回中');

  /* 双指：左半屏姿态 + 右半屏油门可同时生效 */
  fire('touchstart', [pt(3, 120, 640)], 300);
  fire('touchstart', [pt(4, 600, 900)], 310);
  fire('touchmove', [pt(3, 180, 640), pt(4, 600, 780)], 340);
  A.input.update();
  ok(A.S.axes.roll > 0.3 && A.S.axes.thr > 0.5, '左右半屏应能同时操控');
  fire('touchend', [pt(3, 660, 640), pt(4, 120, 780)], 360);
  A.input.update();

  /* 轻点 = 暂停 / 继续（两半屏都可以） */
  eq(A.game.fsm.cur, 'play', '轻点前在飞行中');
  fire('touchstart', [pt(5, 620, 700)], 400);
  fire('touchend', [pt(5, 620, 700)], 480);
  eq(A.game.fsm.cur, 'pause', '轻点右半屏（油门侧）应暂停');
  fire('touchstart', [pt(6, 100, 700)], 600);
  fire('touchend', [pt(6, 100, 700)], 660);
  eq(A.game.fsm.cur, 'play', '轻点左半屏（姿态侧）应继续');

  /* 拖动后抬起不应被当成轻点 */
  fire('touchstart', [pt(7, 620, 700)], 700);
  fire('touchmove', [pt(7, 700, 760)], 730);
  fire('touchend', [pt(7, 700, 760)], 760);
  eq(A.game.fsm.cur, 'play', '拖动后松手不应触发暂停');

  /* 单摇杆布局：第一指姿态、第二指油门 */
  A.ui.settings.set('touchLayout', 'single');
  A.input.refreshHint();
  eq(A.input.hintKey, 'hud.hint.touch.single', '单摇杆提示应更新');
  fire('touchstart', [pt(8, 120, 300)], 800);
  eq(T.st.stickId, 8, '单摇杆布局：任意处第一指为姿态摇杆');
  fire('touchstart', [pt(9, 500, 900)], 810);
  fire('touchmove', [pt(8, 300, 300), pt(9, 500, 800)], 840);
  A.input.update();
  ok(A.S.axes.roll > 0.3, '单摇杆布局仍可操控姿态');
  ok(A.S.axes.thr > 0.5, '单摇杆布局第二指为油门');
  fire('touchend', [pt(8, 300, 300), pt(9, 500, 800)], 860);
  A.input.update();
  A.ui.settings.set('touchLayout', 'split');

  /* 面板上的触摸不应被当成飞行输入 */
  const panelTarget = { closest: function (s) { return s === '#ui .screen.on' ? {} : null; } };
  t.dispatch('touchstart', { changedTouches: [pt(10, 600, 640)], timeStamp: 900, target: panelTarget, cancelable: true });
  eq(T.st.stickId, null, '落在菜单面板上的触摸应交给浏览器');

  /* HUD 分屏可视化不应抛异常：左半屏摇杆框 + 右半屏油门刻度条都要画到 */
  fire('touchstart', [pt(11, 120, 640)], 1000);
  fire('touchmove', [pt(11, 180, 690)], 1030);
  fire('touchstart', [pt(12, 600, 900)], 1040);
  fire('touchmove', [pt(12, 600, 800)], 1050);
  A.game.loop.render();
  const hudRows = t.hook.dump().split('\n');
  const midRow = hudRows[Math.round(V.ROWS / 2)];
  ok(midRow.charAt(V.COLS - 2) !== ' ', '右侧应画出油门刻度条');
  fire('touchend', [pt(11, 180, 690), pt(12, 600, 800)], 1060);
  ok(true, '分屏 HUD 绘制正常');
});

/* =====================================================================
   7.4 坠机提示（不得重复）
   ===================================================================== */
group('坠机提示', () => {
  const A = H.boot();
  const AF = A.AFP, Sc = AF.ui.screens;
  const ui = A.doc.getElementById('ui');
  function crashWith(reason) {
    AF.game.fsm.go('menu');
    Sc.dispatch('free');
    AF.S.crashed = reason; AF.S.crashReason = reason;
    AF.S.flown = 1234; AF.S.best = 5678;
    AF.game.fsm.go('crash');
    A.hook.render();
    return ui.querySelector('[data-scr="crash"]');
  }

  /* 标题只出现一次（曾经 h1 一次 + 数据行标签又一次） */
  const zh = crashWith(2);
  const zhTxt = zh.textContent.replace(/\s+/g, ' ');
  eq((zhTxt.match(/坠机/g) || []).length, 1, '中文面板里「坠机」只应出现一次');
  eq((zhTxt.match(/本次航程/g) || []).length, 1, '航程数据只应出现一次');
  ok(/撞上楼房/.test(zhTxt), '面板应给出坠机原因');
  ok(!/<div class="stat"[^>]*><span>坠机<\/span>/.test(zh.innerHTML), '不应再有「坠机 → 原因」这种重复行');

  /* 四种坠机原因都要能显示出来 */
  const reasons = [[1, /撞上地面/], [2, /撞上楼房/], [3, /撞上空中障碍物/], [4, /超时/]];
  reasons.forEach(function (r) {
    const el = crashWith(r[0]);
    const txt = el.textContent.replace(/\s+/g, ' ');
    ok(r[1].test(txt), '原因 ' + r[0] + ' 应显示为 ' + r[1]);
    eq((txt.match(/坠机/g) || []).length, 1, '原因 ' + r[0] + ' 时标题也只应出现一次');
  });

  /* 英文界面同样只出现一次 */
  Sc.dispatch('lang:en');
  const en = crashWith(2);
  const enTxt = en.textContent.replace(/\s+/g, ' ');
  eq((enTxt.match(/Crashed/g) || []).length, 1, '英文面板里 Crashed 只应出现一次');
  ok(/Hit a building/.test(enTxt), '英文面板应给出坠机原因');
  Sc.dispatch('lang:zh');

  /* 面板在场时，画面上不应再画一套 ASCII 坠机提示 */
  crashWith(2);
  let boxCalls = 0;
  const origDrawCrash = AF.render.hud.drawCrash;
  AF.render.hud.drawCrash = function () { boxCalls++; return origDrawCrash.apply(this, arguments); };
  A.hook.render();
  eq(boxCalls, 0, 'DOM 面板显示时不应再画 canvas 坠机提示框');
  const dump = A.hook.dump();
  eq(dump.indexOf('坠'), -1, 'DOM 面板显示时画面里不应重复坠机提示');
  ok(Sc.isShowing('crash'), '此时坠机面板确实在显示');

  /* 没有 DOM 面板时（离线自检 / 无界面环境）仍要有 ASCII 提示框兜底 */
  const savedRoot = Sc.root;
  Sc.root = null;
  A.hook.render();
  eq(boxCalls, 1, '没有 DOM 面板时应由 canvas 兜底画一次坠机提示框');
  const dump2 = A.hook.dump();
  ok(/坠/.test(dump2), '兜底提示应显示坠机标题');
  ok(dump2.indexOf('KM') >= 0, '兜底提示应含航程数据');
  AF.render.hud.drawCrash = origDrawCrash;
  Sc.root = savedRoot;
  Sc.show('crash');
});

/* =====================================================================
   8. 主循环
   ===================================================================== */
group('主循环', () => {
  const before = app.hook.info().camZ;
  app.hook.axes({ thr: 1 });
  for (let i = 0; i < 30; i++) app.tick(16.7);
  app.hook.axes({ thr: 0 });
  ok(app.hook.info().camZ !== before, '主循环应推进物理并重绘');
  ok(app.ctxCalls.fillRect > 0, '主循环应刷新画布');
});

/* =====================================================================
   9. 全流程验收（像玩家一样从头走一遍）
   ===================================================================== */
group('全流程验收', () => {
  const A = H.boot();
  const AF = A.AFP;
  eq(AF.game.fsm.cur, 'menu', '1. 启动进入开始界面');

  AF.ui.screens.dispatch('lang');
  eq(AF.i18n.lang, 'en', '2. 开始界面可切英文');
  AF.ui.screens.dispatch('lang');
  eq(AF.i18n.lang, 'zh', '3. 可切回中文');

  AF.ui.screens.dispatch('campaign');
  eq(AF.game.fsm.cur, 'play', '4. 主菜单可进入闯关');
  eq(AF.S.mode, 'level', '5. 模式为闯关');
  ok(AF.S.countdown > 0, '6. 起飞前有倒计时');
  A.hook.render();
  ok(A.hook.dump().replace(/\s/g, '').length > 100, '7. 闯关画面有内容');

  AF.S.countdown = 0;
  const c = AF.game.levels.current();
  c.gates.forEach(g => { A.hook.setCam({ x: g.x, y: g.y, z: g.z }); AF.game.fsm.update(1 / 120); });
  eq(AF.game.fsm.cur, 'result', '8. 穿过全部光环进入结算');
  ok(AF.game.levels.bestTime(0) !== null, '9. 记录本关最佳用时');

  AF.ui.screens.dispatch('next');
  eq(AF.S.level, 1, '10. 结算可进入下一关');
  AF.game.onInputAction('pause');
  eq(AF.game.fsm.cur, 'pause', '11. 空格暂停');
  AF.ui.screens.dispatch('settings');
  eq(AF.game.fsm.cur, 'settings', '12. 暂停里可进设置');
  AF.ui.settings.set('hud', false);
  eq(AF.S.hudOn, false, '13. 设置立即生效');
  AF.ui.settings.set('hud', true);
  AF.ui.screens.dispatch('back');
  eq(AF.game.fsm.cur, 'pause', '14. 设置返回暂停');
  AF.ui.screens.dispatch('resume');
  eq(AF.game.fsm.cur, 'play', '15. 继续飞行');

  /* 撞楼 → 坠机 → 重来 */
  const blk = AF.world.blocks.find(b => b.buildings.length);
  const b = blk.buildings[0];
  AF.S.countdown = 0;
  A.hook.setCam({ x: blk.bx * 64 + b.x + b.w / 2, y: b.h * 0.5, z: blk.bz * 64 + b.z + b.d / 2 });
  AF.game.fsm.update(1 / 120);
  eq(AF.game.fsm.cur, 'crash', '16. 撞楼进入坠机界面');
  A.hook.render();
  const crashTxt = A.doc.getElementById('ui').textContent;
  ok(/坠机/.test(crashTxt), '17. 坠机面板应显示提示');
  ok(/撞上楼房/.test(crashTxt), '17b. 面板应说明坠机原因');
  AF.ui.screens.dispatch('retry');
  eq(AF.game.fsm.cur, 'play', '18. 重来一次');

  AF.ui.screens.dispatch('quit');
  eq(AF.game.fsm.cur, 'menu', '19. 回到开始界面');
  AF.ui.screens.dispatch('free');
  eq(AF.S.mode, 'free', '20. 自由飞行');
  eq(AF.S.gates.length, 0, '21. 自由飞行没有目标点');
  A.hook.axes({ thr: 1 });
  for (let i = 0; i < 600; i++) AF.game.fsm.update(1 / 120);
  A.hook.axes({ thr: 0 });
  ok(AF.S.flown > 50, '22. 自由飞行累计距离，实际 ' + AF.S.flown.toFixed(1) + ' m');
  ok(AF.S.best >= AF.S.flown, '23. 最远距离记录应被刷新');
});

/* =====================================================================
   汇总
   ===================================================================== */
console.log('');
console.log('  通过 ' + passed + ' / 失败 ' + failed);
if (failures.length) {
  console.log('');
  failures.forEach(f => console.log('  ✗ ' + f));
}
console.log('');
process.exit(failed ? 1 : 0);
