/**
 * 合并并规整化学数据
 *   data/chemistry.js     主数据 A（50 条）
 *   data/chemistry-2.js   补充数据 B（21 条，第九~十二单元）
 *
 * 处理四件事：
 *   1. 语义去重：A 里被 B 更细条目覆盖的，丢弃（见 ALIAS 表）；
 *      B 里字面重复的也丢弃。**只有真正重复的才丢**，两边独有的实验一律保留。
 *   2. 单元名统一（去掉 2024 版特有叫法）
 *   3. 按 学段 → 单元 → 原顺序 重排
 *   4. id 重新连续编号 chem-01…chem-NN
 *
 * 用法： node scripts/merge-chemistry.mjs [--dry]
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const mainFile = path.join(root, 'data', 'chemistry.js');
const extraFile = path.join(root, 'data', 'chemistry-2.js');
const dry = process.argv.includes('--dry');

function load(file, key) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  const list = sandbox.window[key];
  if (!Array.isArray(list)) throw new Error(`${file} 里没有 window.${key}`);
  return list;
}

const main = load(mainFile, 'CHEMISTRY');
const extra = fs.existsSync(extraFile) ? load(extraFile, 'CHEMISTRY_2') : [];
console.log(`主数据 A ${main.length} 条，补充数据 B ${extra.length} 条`);

/* ---------- 单元名归一化 ---------- */
const UNIT_ALIAS = new Map([
  ['第十单元 常见的酸、碱、盐', '第十单元 酸和碱'],
  ['第十一单元 化学与社会', '第十二单元 化学与生活']
]);
const normalizeLesson = (s) => UNIT_ALIAS.get(s) || s;

/* 单元顺序（人教版九年级化学上下册） */
const UNITS = [
  '第一单元 走进化学世界',
  '第二单元 我们周围的空气',
  '第三单元 物质构成的奥秘',
  '第四单元 自然界的水',
  '第五单元 化学反应的定量关系',
  '第六单元 碳和碳的氧化物',
  '第七单元 能源的合理利用与开发',
  '第八单元 金属和金属材料',
  '第九单元 溶液',
  '第十单元 酸和碱',
  '第十一单元 盐 化肥',
  '第十二单元 化学与生活'
];
const unitRank = (u) => { const i = UNITS.indexOf(u); return i === -1 ? 99 : i; };

/* ---------- 语义去重表：A 标题 -> 被 B 的哪个标题覆盖 ---------- */
const ALIAS = new Map([
  // 第九单元
  ['物质的溶解性与影响溶解性的因素', '探究影响物质溶解性的因素'],
  ['饱和溶液与不饱和溶液的转化', '饱和溶液与不饱和溶液的相互转化'],
  ['溶解时的吸热与放热现象', '溶解时的吸热和放热现象'],
  // 第十单元：A 的两条粗粒度整条被 B 的细粒度覆盖
  ['酸碱指示剂的变色与常见酸的性质', '稀盐酸和稀硫酸的化学性质'],
  ['常见碱的性质（氢氧化钠与氢氧化钙）', '氢氧化钠和氢氧化钙的化学性质'],
  ['中和反应的探究（酸碱中和实验）', '中和反应的探究'],
  ['溶液的酸碱性与pH的测定', '用pH试纸测定溶液的酸碱度'],
  ['浓硫酸的稀释', '浓硫酸的稀释与腐蚀性'],
  // 盐 / 化肥：A 的粗条目被 B 覆盖（A 的碳酸钠、复分解 B 没有细条目，保留）
  ['盐的性质（碳酸钠与稀盐酸、氯化钠的检验）', '盐的化学性质'],
  ['粗盐中难溶性杂质的去除（溶解、过滤、蒸发）', '粗盐中难溶性杂质的去除'],
  ['化学肥料的简易鉴别（铵态氮肥与碱反应）', '常见化肥的简易鉴别'],
  // 化学与生活
  ['人体重要的营养物质（葡萄糖的检验与淀粉的水解）', '食物中重要营养物质的检验'],
  ['有机合成材料的鉴别（聚乙烯与聚氯乙烯）', '常见材料的鉴别']
]);

const canon = (t) => String(t || '').replace(/[\s·、，,（）()：:—\-]/g, '');
const aliasTargets = new Set([...ALIAS.values()].map(canon));

/* ---------- 合并 ---------- */
const kept = [];
const dropped = [];
const seenTitles = new Set();

/* A：扔掉被 B 覆盖的，以及和已保留项标题重复的 */
for (const e of main) {
  const title = e.title;
  const c = canon(title);
  if (ALIAS.has(title)) {
    if (aliasTargets.has(canon(ALIAS.get(title)))) {
      dropped.push(`A 被 B 覆盖：${title}`);
      continue;
    }
  }
  if (seenTitles.has(c)) { dropped.push(`A 标题重复：${title}`); continue; }
  seenTitles.add(c);
  kept.push({ ...e, lesson: normalizeLesson(e.lesson), _src: 'A' });
}

/* B：补进来，标题重复的丢弃 */
for (const e of extra) {
  const c = canon(e.title);
  if (seenTitles.has(c)) { dropped.push(`B 标题重复：${e.title}`); continue; }
  seenTitles.add(c);
  kept.push({ ...e, lesson: normalizeLesson(e.lesson), _src: 'B' });
}

/* ---------- 排序 + 重新编号 ---------- */
kept.sort((a, b) => unitRank(a.lesson) - unitRank(b.lesson));
kept.forEach((e, i) => {
  e.id = 'chem-' + String(i + 1).padStart(2, '0');
  delete e._src;
});

/* ---------- 报告 ---------- */
console.log(`\n丢弃 ${dropped.length} 条（都是重复项）：`);
dropped.forEach((d) => console.log('  - ' + d));

const byUnit = {};
kept.forEach((e) => { (byUnit[e.lesson] ||= []).push(e.id); });
console.log('\n合并结果：');
Object.entries(byUnit).forEach(([u, ids]) =>
  console.log(`  ${u.padEnd(30)} ${String(ids.length).padStart(2)}  ${ids[0]}..${ids[ids.length - 1]}`));
const byGrade = {};
kept.forEach((e) => { byGrade[e.grade] = (byGrade[e.grade] || 0) + 1; });
console.log('  合计 ' + kept.length + ' 条');
Object.entries(byGrade).forEach(([g, n]) => console.log(`    ${g}: ${n}`));

/* ---------- 写出 ---------- */
if (dry) {
  console.log('\n(--dry 模式，未写入文件)');
} else {
  const body = kept.map((e) => '  ' + JSON.stringify(e, null, 2).split('\n').join('\n  ')).join(',\n');
  fs.writeFileSync(mainFile, `window.CHEMISTRY = [\n${body}\n];\n`, 'utf8');
  if (fs.existsSync(extraFile)) fs.rmSync(extraFile);
  console.log('\n已写入 data/chemistry.js，并删除 chemistry-2.js');
}
