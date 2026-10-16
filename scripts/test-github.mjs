/**
 * 验证 DNS 修正是否生效：Node 能否访问 GitHub 全链路域名。
 * 用法： node scripts/test-github.mjs
 */
import './dns-fix.mjs';
import { installDnsFix, resolveIps, fixedFetch } from './dns-fix.mjs';

await installDnsFix();

const HOSTS = [
  'api.github.com',
  'github.com',
  'codeload.github.com',
  'objects.githubusercontent.com',
  'raw.githubusercontent.com'
];

let fail = 0;
const ok = (cond, label) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) fail++; };

console.log('\n(1) 解析 + 实测可达性（DNS-over-HTTPS + TCP 探测）');
for (const h of HOSTS) {
  const ips = await resolveIps(h);
  ok(ips.length > 0, `${h} -> ${ips.join(', ') || '解析失败'}`);
}

console.log('\n(2) 域名连通性（fixedFetch：失败自动换 IP 重试）');
/* 部署只依赖 api.github.com，其余是加分项：
   有些网络对 github.com / raw.githubusercontent.com 的**根路径**不稳定，
   而实际用到的具体路径可能正常，所以非关键域名失败只警告、不判失败。 */
const CRITICAL = new Set(['api.github.com']);
for (const h of HOSTS) {
  try {
    const res = await fixedFetch('https://' + h + '/', {
      redirect: 'manual',
      headers: { 'user-agent': 'pcl-check' },
      signal: AbortSignal.timeout(20000)
    });
    ok(true, `${h} -> HTTP ${res.status}`);
  } catch (e) {
    const msg = `${h} -> ${e.cause?.code || e.name || e.message}`;
    if (CRITICAL.has(h)) ok(false, msg);
    else console.log(`  WARN  ${msg}（非关键，部署不需要此域名）`);
  }
}

console.log('\n(2b) 部署实际用到的具体路径');
try {
  const res = await fixedFetch('https://api.github.com/user', {
    headers: { 'user-agent': 'pcl-check' },
    signal: AbortSignal.timeout(20000)
  });
  ok(res.status === 401, `GET api.github.com/user -> ${res.status}（未带 token 应为 401）`);
} catch (e) {
  ok(false, 'GET api.github.com/user -> ' + (e.cause?.code || e.message));
}

console.log('\n(3) GitHub API 实际可用性');
try {
  const res = await fixedFetch('https://api.github.com/', {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'pcl-check' },
    signal: AbortSignal.timeout(20000)
  });
  const j = await res.json();
  ok(res.status === 200 && j.current_user_url === 'https://api.github.com/user',
    `GET / -> ${res.status}（current_user_url 正确）`);
} catch (e) {
  ok(false, 'GET / -> ' + (e.cause?.code || e.message));
}

try {
  const res = await fixedFetch('https://api.github.com/meta', {
    headers: { 'user-agent': 'pcl-check' },
    signal: AbortSignal.timeout(20000)
  });
  const j = await res.json();
  ok(res.ok && Array.isArray(j.git), `GET /meta -> ${res.status}, git 网段 ${j.git?.length} 条`);
} catch (e) {
  ok(false, 'GET /meta -> ' + (e.cause?.code || e.message));
}

console.log('\n(4) 未认证鉴权行为（部署脚本靠它识别无效 token）');
try {
  const res = await fixedFetch('https://api.github.com/user', {
    headers: { 'user-agent': 'pcl-check' },
    signal: AbortSignal.timeout(20000)
  });
  ok(res.status === 401, `GET /user -> ${res.status}（应为 401）`);
} catch (e) {
  ok(false, 'GET /user -> ' + (e.cause?.code || e.message));
}

console.log(fail ? `\n${fail} 项失败` : '\n全部通过：GitHub 全链路可用（DNS 修正生效）');
process.exit(fail ? 1 : 0);
