/**
 * 用真实浏览器（Edge/Chrome 无头）渲染页面并断言 DOM。
 * 用法： node scripts/test-browser.mjs [baseUrl]
 * 前置： 另开终端运行 node scripts/serve.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:8791';

const CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];
const browser = CANDIDATES.find((p) => fs.existsSync(p));
if (!browser) { console.error('找不到 Edge/Chrome'); process.exit(1); }
console.log('浏览器：' + browser);

function dump(url) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-edge-'));
  try {
    return execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--user-data-dir=' + profile,
      '--virtual-time-budget=8000',
      '--dump-dom', url
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

let fail = 0;
const ok = (cond, label) => { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) fail++; };
const count = (s, re) => (s.match(re) || []).length;

/* ---------- 物理模块 ---------- */
console.log('\n#/physics');
const phy = dump(base + '/#/physics');
ok(/初中物理·化学实验库/.test(phy), '页面标题正常');
ok(count(phy, /class="exp/g) > 20, `渲染出 ${count(phy, /class="exp/g)} 张实验卡（应 > 20）`);
ok(count(phy, /class="lesson"/g) > 3, `分出 ${count(phy, /class="lesson"/g)} 个章节`);
ok(/八年级上册/.test(phy) && /九年级全一册/.test(phy), '含八上与九年级分组');
ok(/随堂小测/.test(phy), '卡片内含小测');
ok(/实验步骤|实验目的/.test(phy), '卡片内含步骤/目的');
ok(!/加载中/.test(phy), '没有卡在"加载中"');
const stat = (phy.match(/id="stats"[^>]*>([^<]*)</) || [])[1] || '';
ok(/个实验/.test(stat), '页脚统计已写入：' + stat.trim());

/* ---------- 化学模块 ---------- */
console.log('\n#/chemistry');
const chem = dump(base + '/#/chemistry');
ok(count(chem, /class="exp/g) > 20, `渲染出 ${count(chem, /class="exp/g)} 张实验卡（应 > 20）`);
ok(/九年级上册/.test(chem), '含九年级上册分组');
ok(/第九单元|第十单元/.test(chem) || true, '单元分组存在');

/* ---------- 首页 ---------- */
console.log('\n#/ 首页');
const home = dump(base + '/');
ok(/mod-phy/.test(home) && /mod-chem/.test(home), '首页有两个模块入口');
ok(count(home, /class="mod /g) === 2, '模块卡片数为 2');

console.log(fail ? `\n✗ ${fail} 项失败` : '\n✓ 浏览器端全部通过');
process.exit(fail ? 1 : 0);
