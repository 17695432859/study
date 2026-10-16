/** 打印数据清单： node scripts/list-data.mjs [physics|chemistry] */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const which = process.argv[2] || 'all';
const files = which === 'chemistry' ? ['chemistry'] : which === 'physics' ? ['physics'] : ['physics', 'chemistry'];

for (const f of files) {
  const key = f.toUpperCase();
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'data', f + '.js'), 'utf8'), sandbox, { filename: f });
  const list = sandbox.window[key];
  console.log(`\n=== ${f} (${list.length}) ===`);
  let lastGrade = '';
  for (const e of list) {
    if (e.grade !== lastGrade) { console.log(`\n[${e.grade}]`); lastGrade = e.grade; }
    console.log(`  ${e.id.padEnd(9)} ${(e.lesson || '').padEnd(24)} ${e.title}`);
  }
}
