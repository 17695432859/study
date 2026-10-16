/**
 * 静态检查：确认数据文件语法正确、字段齐全、quiz 答案下标有效。
 * 用法： node scripts/check-data.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const files = [
  { key: 'PHYSICS', file: 'data/physics.js' },
  { key: 'CHEMISTRY', file: 'data/chemistry.js' }
];

const REQUIRED = ['id', 'title', 'grade', 'lesson', 'purpose', 'materials', 'steps', 'observe', 'conclusion', 'safety', 'quiz'];
let problems = 0;
const bad = (m) => { problems++; console.log('  ✗ ' + m); };

for (const { key, file } of files) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) { bad(`${file} 不存在`); continue; }

  const src = fs.readFileSync(p, 'utf8');
  const sandbox = { window: {} };
  try {
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox, { filename: file });
  } catch (e) {
    bad(`${file} 语法错误：${e.message}`);
    continue;
  }

  const list = sandbox.window[key];
  if (!Array.isArray(list)) { bad(`${file} 没有导出数组 window.${key}`); continue; }

  console.log(`\n${file}  →  ${list.length} 个实验`);

  const seen = new Set();
  list.forEach((e, i) => {
    const at = `#${i + 1}(${e && e.id ? e.id : '无 id'})`;
    if (!e || typeof e !== 'object') return bad(`${at} 不是对象`);
    REQUIRED.forEach((f) => {
      if (!(f in e)) bad(`${at} 缺少字段 ${f}`);
    });
    if (seen.has(e.id)) bad(`${at} id 重复`); else seen.add(e.id);
    if (!/^[a-z]+-\d{2}$/.test(e.id || '')) bad(`${at} id 格式应为 xxx-00`);
    if (!Array.isArray(e.materials) || e.materials.length < 3) bad(`${at} materials 至少 3 项`);
    if (!Array.isArray(e.steps) || e.steps.length < 4) bad(`${at} steps 至少 4 步`);
    if (!Array.isArray(e.safety)) bad(`${at} safety 必须是数组（可为空）`);
    if (!Array.isArray(e.quiz) || e.quiz.length < 1) bad(`${at} quiz 至少 1 题`);
    (e.quiz || []).forEach((q, qi) => {
      const n = (q.options || []).length;
      if (n < 2) bad(`${at} 第${qi + 1}题选项少于 2 个`);
      if (typeof q.answer !== 'number') bad(`${at} 第${qi + 1}题 answer 必须是数字`);
      else if (q.answer < 0 || q.answer >= n) bad(`${at} 第${qi + 1}题 answer=${q.answer} 越界（共 ${n} 个选项）`);
      if (!q.stem) bad(`${at} 第${qi + 1}题缺题干`);
      if (!q.why) bad(`${at} 第${qi + 1}题缺解析`);
    });
    if (e.data) {
      if (!Array.isArray(e.data.headers) || !Array.isArray(e.data.rows)) bad(`${at} data 缺少 headers/rows`);
      else e.data.rows.forEach((r, ri) => {
        if (r.length !== e.data.headers.length) bad(`${at} data 第${ri + 1}行列数与表头不符`);
      });
    }
  });

  // 分组统计
  const byGrade = {};
  list.forEach((e) => { byGrade[e.grade] = (byGrade[e.grade] || 0) + 1; });
  Object.entries(byGrade).forEach(([g, n]) => console.log(`   ${g}: ${n}`));
}

console.log(problems ? `\n✗ 共 ${problems} 个问题` : '\n✓ 全部检查通过');
process.exit(problems ? 1 : 0);
