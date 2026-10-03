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

  /* 字符密度 */
  AFP.ui.screens.dispatch('density:16');
  eq(AFP.render.view.targetCols, 168, '密度 +16 应生效');
  AFP.ui.screens.dispatch('density:-16');
  eq(AFP.render.view.targetCols, 152, '密度 -16 应还原');

  /* 返回 */
  AFP.ui.screens.dispatch('back');
  eq(AFP.game.fsm.cur, 'menu', '设置返回主菜单');
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

  /* 右半屏：姿态摇杆（相对起手点） */
  fire('touchstart', [pt(1, 600, 640)], 0);
  eq(T.st.stickId, 1, '右半屏触点应成为姿态摇杆');
  fire('touchmove', [pt(1, 606, 646)], 20);
  A.input.update();
  eq(A.S.axes.roll, 0, '死区内不应有舵量');
  eq(A.S.axes.pitch, 0, '死区内不应有舵量');
  fire('touchmove', [pt(1, 680, 720)], 60);
  A.input.update();
  ok(A.S.axes.roll > 0.3, '右半屏右滑 → 右滚，实际 ' + A.S.axes.roll.toFixed(2));
  ok(A.S.axes.pitch > 0.3, '右半屏下滑 → 抬头，实际 ' + A.S.axes.pitch.toFixed(2));
  fire('touchend', [pt(1, 680, 720)], 90);
  A.input.update();
  eq(A.S.axes.roll, 0, '松手摇杆回中');
  eq(T.st.active, false, '摇杆应释放');

  /* 左半屏：油门（上滑加速，松手回中） */
  fire('touchstart', [pt(2, 100, 900)], 100);
  eq(T.st.thrId, 2, '左半屏触点应成为油门');
  fire('touchmove', [pt(2, 100, 900 - 120)], 140);
  A.input.update();
  ok(A.S.axes.thr > 0.9, '左半屏上滑应给满油门，实际 ' + A.S.axes.thr.toFixed(2));
  fire('touchmove', [pt(2, 100, 900 + 120)], 180);
  A.input.update();
  ok(A.S.axes.thr < -0.9, '左半屏下滑应减速');
  fire('touchend', [pt(2, 100, 900)], 200);
  A.input.update();
  eq(A.S.axes.thr, 0, '油门松手应回中');

  /* 双指：右半屏姿态 + 左半屏油门可同时生效 */
  fire('touchstart', [pt(3, 600, 640)], 300);
  fire('touchstart', [pt(4, 120, 900)], 310);
  fire('touchmove', [pt(3, 660, 640), pt(4, 120, 780)], 340);
  A.input.update();
  ok(A.S.axes.roll > 0.3 && A.S.axes.thr > 0.5, '左右半屏应能同时操控');
  fire('touchend', [pt(3, 660, 640), pt(4, 120, 780)], 360);
  A.input.update();

  /* 轻点 = 暂停 / 继续 */
  eq(A.game.fsm.cur, 'play', '轻点前在飞行中');
  fire('touchstart', [pt(5, 620, 700)], 400);
  fire('touchend', [pt(5, 620, 700)], 480);
  eq(A.game.fsm.cur, 'pause', '轻点右半屏应暂停');
  fire('touchstart', [pt(6, 100, 700)], 600);
  fire('touchend', [pt(6, 100, 700)], 660);
  eq(A.game.fsm.cur, 'play', '轻点左半屏应继续');

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

  /* HUD 分屏可视化不应抛异常 */
  fire('touchstart', [pt(11, 600, 640)], 1000);
  fire('touchmove', [pt(11, 660, 690)], 1030);
  A.game.loop.render();
  fire('touchend', [pt(11, 660, 690)], 1060);
  ok(true, '分屏 HUD 绘制正常');
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
