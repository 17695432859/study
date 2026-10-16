/**
 * 精确诊断：对每个候选 IP 逐个用 GET 测试，找出哪些 IP 真正可用。
 * 用法： node scripts/diag-github.mjs
 */
import './dns-fix.mjs';
import { installDnsFix, resolveIps } from './dns-fix.mjs';

await installDnsFix({ quiet: true });

const HOSTS = ['github.com', 'api.github.com', 'raw.githubusercontent.com', 'objects.githubusercontent.com', 'codeload.github.com'];

for (const host of HOSTS) {
  const ips = await resolveIps(host);
  const results = [];
  for (const ip of ips) {
    const url = `https://${ip}/`;
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        headers: { host, 'user-agent': 'pcl-diag' },
        signal: AbortSignal.timeout(12000)
      });
      results.push(`${ip} → ${res.status} (${Date.now() - t0}ms)`);
    } catch (e) {
      results.push(`${ip} → ERR ${e.cause?.code || e.name || e.message} (${Date.now() - t0}ms)`);
    }
  }
  console.log(`\n${host}`);
  results.forEach((r) => console.log('  ' + r));
}
