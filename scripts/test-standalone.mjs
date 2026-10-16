/**
 * 验证单文件离线版：用真实浏览器以 file:// 打开 standalone.html，
 * 断言两个模块、实验卡数量、统计数字都正常（证明双击可用、无需服务器）。
 * 用法： node scripts/test-standalone.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(root, 'standalone.html');
if (!fs.existsSync(file)) { console.error('standalone.html 不存在，请先跑 build-standalone.mjs'); process.exit(1); }

const CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const browser = CANDIDATES.find((p) => fs.existsSync(p));
if (!browser) { console.error('找不到 Edge/Chrome'); process.exit(1); }

const base = pathToFileURL(file).href;

function dump(url) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-standalone-'));
  try {
    return execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--allow-file-access-from-files',
      '--user-data-dir=' + profile,
      '--virtual-time-budget=9000',
      '--dump-dom', url
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

let fail = 0;
const ok = (cond, label) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) fail++; };
const count = (s, re) => (s.match(re) || []).length;

const home = dump(base);
ok(/初中物理·化学实验库/.test(home), 'file:// 下页面正常加载');
ok(/mod-phy/.test(home) && /mod-chem/.test(home), '首页两个模块入口都在');
/* 只在「视图容器」里检查是否残留占位文本 ——
   整个文档里搜会命中内联 JS 源码中的同一句字符串（假阳性） */
const view = (home.match(/<main id="view"[^>]*>([\s\S]*?)<\/main>/) || [])[1] || '';
ok(view.length > 200, `视图容器已渲染内容（${view.length} 字符）`);
ok(!/class="empty"/.test(view), '视图容器里没有残留的"加载中"占位块');
const stat = (home.match(/id="stats"[^>]*>([^<]*)</) || [])[1] || '';
ok(/92 个实验/.test(stat), '统计显示 92 个实验：' + stat.trim());

const phy = dump(base + '#/physics');
ok(count(phy, /class="exp/g) === 36, `物理渲染 ${count(phy, /class="exp/g)} 张卡（应 36）`);
ok(/八年级上册/.test(phy) && /九年级全一册/.test(phy), '物理含八上/九全分组');

const chem = dump(base + '#/chemistry');
ok(count(chem, /class="exp/g) === 56, `化学渲染 ${count(chem, /class="exp/g)} 张卡（应 56）`);
ok(/第十单元 酸和碱/.test(chem) && /第十二单元 化学与生活/.test(chem), '化学含第十/十二单元');

console.log(fail ? `\n${fail} 项失败` : '\n单文件离线版全部通过：双击即可用');
process.exit(fail ? 1 : 0);
