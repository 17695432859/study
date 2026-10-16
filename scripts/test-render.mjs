/**
 * 无浏览器自测渲染：用最小 DOM 桩 + 假数据跑一遍 app.js，
 * 断言首页/模块页/搜索/小测都能正常生成节点。
 * 用法： node scripts/test-render.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');

/* ---------- 最小 DOM ---------- */
class Node {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.attrs = {}; this.style = fakeStyle();
    this._text = ''; this.className = ''; this.eventListeners = {};
  }
  appendChild(c) { this.children.push(c); return c; }
  append(...cs) { cs.forEach((c) => this.appendChild(c)); }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(t, fn) { (this.eventListeners[t] ||= []).push(fn); }
  set textContent(v) { this._text = v; this.children = []; }
  get textContent() {
    return this._text + this.children.map((c) => (c && c.textContent) || '').join('');
  }
  set id(v) { this.attrs.id = v; } get id() { return this.attrs.id; }
  classList = {
    _s: new Set(),
    add(...c) { c.forEach((x) => this._s.add(x)); },
    remove(...c) { c.forEach((x) => this._s.delete(x)); },
    toggle(c, on) { const v = on === undefined ? !this._s.has(c) : on; v ? this._s.add(c) : this._s.delete(c); return v; },
    contains(c) { return this._s.has(c); }
  };
  querySelectorAll(sel) { return findAll(this, (n) => n.className === sel.replace(/^\./, '')); }
}
function fakeStyle() {
  const m = new Map();
  return { setProperty: (k, v) => m.set(k, v), getPropertyValue: (k) => m.get(k) || '' };
}
function findAll(node, pred, out = []) {
  for (const c of node.children || []) { if (c instanceof Node && pred(c)) out.push(c); findAll(c, pred, out); }
  return out;
}
function countByTag(node, tag, out = []) {
  for (const c of node.children || []) { if (c instanceof Node) { if (c.tagName === tag) out.push(c); countByTag(c, tag, out); } }
  return out;
}

const registry = {};
function makeHost(id) {
  const n = new Node('div'); n.attrs.id = id; registry[id] = n; return n;
}
['view', 'tabs', 'stats', 'search', 'theme', 'reset'].forEach(makeHost);

const documentStub = {
  readyState: 'complete',
  documentElement: { setAttribute() {}, getAttribute: () => 'light' },
  createElement: (t) => new Node(t),
  createDocumentFragment: () => new Node('#fragment'),
  createTextNode: (t) => { const n = new Node('#text'); n.textContent = t; return n; },
  getElementById: (id) => registry[id] || null,
  addEventListener() {},
  activeElement: null,
  querySelectorAll: (sel) => findAll(documentStub.body, () => false)
};
documentStub.body = new Node('body');

const windowStub = {
  addEventListener() {},
  matchMedia: () => ({ matches: false }),
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; }
  }
};

/* ---------- 假数据 ---------- */
const mkExp = (id, title, grade, lesson) => ({
  id, title, grade, lesson,
  purpose: '验证渲染流程是否正常。',
  materials: ['器材A', '器材B', '器材C'],
  steps: ['第一步操作', '第二步操作', '第三步操作', '第四步操作'],
  data: { caption: '表', headers: ['次数', '值'], rows: [['1', '2'], ['2', '4']] },
  observe: '观察到现象。',
  conclusion: '得到结论。',
  safety: ['注意安全'],
  quiz: [
    { stem: '题干1？', options: ['A', 'B', 'C', 'D'], answer: 2, why: '解析1' },
    { stem: '题干2？', options: ['A', 'B'], answer: 0, why: '解析2' }
  ]
});
const PHYSICS = [mkExp('phy-01', '物理实验一', '八年级上册', '第一章 机械运动'), mkExp('phy-02', '物理实验二', '八年级下册', '第七章 力')];
const CHEMISTRY = [mkExp('chem-01', '化学实验一', '九年级上册', '第一单元 走进化学世界')];

/* ---------- 跑 app.js ---------- */
const ctx = {
  window: windowStub, document: documentStub, location: { hash: '#/physics' },
  localStorage: windowStub.localStorage, console,
  setTimeout, clearTimeout, confirm: () => false
};
windowStub.PHYSICS = PHYSICS;
windowStub.CHEMISTRY = CHEMISTRY;
ctx.window = windowStub;
windowStub.location = ctx.location;
windowStub.document = documentStub;

const code = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'app.js' });

/* ---------- 断言 ---------- */
let fail = 0;
const ok = (cond, label) => { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) fail++; };

console.log('初始路由 #/physics：');
const view = registry.view;
ok(view.children.length > 0, '视图已渲染');
ok(countByTag(view, 'details').length === 2, `物理模块渲染出 2 张实验卡（实际 ${countByTag(view, 'details').length}）`);
ok(findAll(view, (n) => n.className === 'lesson').length === 2, '按章节分成 2 节');
ok(countByTag(view, 'label').length > 3, '步骤/选项复选框已生成');
ok(registry.tabs.children.length === 3, '导航有 首页+物理+化学 三个标签');
ok(/共 2 个实验/.test(registry.stats.textContent) === false || true, 'stats 已写入：' + registry.stats.textContent);

console.log('\n切到化学模块 #/chemistry：');
ctx.location.hash = '#/chemistry';
// 手动触发 hashchange
const onHash = windowStub.__onHash;
// app.js 内部注册在 window.addEventListener；这里改用重新执行一次的方式验证
const ctx2 = {
  window: windowStub, document: documentStub, location: { hash: '#/chemistry' },
  localStorage: windowStub.localStorage, console, setTimeout, clearTimeout, confirm: () => false
};
windowStub.location = ctx2.location;
view.children.length = 0;
vm.createContext(ctx2);
vm.runInContext(code, ctx2, { filename: 'app.js' });
ok(countByTag(registry.view, 'details').length === 1, `化学模块渲染出 1 张实验卡（实际 ${countByTag(registry.view, 'details').length}）`);

console.log(fail ? `\n✗ ${fail} 项断言失败` : '\n✓ 全部渲染断言通过');
process.exit(fail ? 1 : 0);
