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
  ok(fsm.is('menu'), '当前在主菜单');
  AFP.ui.screens.action('free');
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
  AFP.ui.screens.action('quit');
  eq(fsm.cur, 'menu', '返回主菜单');
});

/* =====================================================================
   6. 飞行力学与碰撞
   ===================================================================== */
group('飞行力学', () => {
  AFP.ui.screens.action('free');
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
  AFP.ui.screens.action('free');
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
  AFP.ui.screens.action('settings');
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
  AFP.ui.screens.action('back');
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
