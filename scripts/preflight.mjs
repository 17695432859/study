/**
 * 部署链路预检：不消耗任何写权限，用公开仓库验证 deploy.mjs 用到的每个 Git Data API 路径，
 * 确认路径、参数、返回结构都对得上，避免真部署时才发现拼错。
 * 用法： node scripts/preflight.mjs
 */
import './dns-fix.mjs';
import { installDnsFix } from './dns-fix.mjs';

installDnsFix();

const API = 'https://api.github.com';
const PUB = 'torvalds/linux';   // 一个确定存在、体积大的公开仓库

let fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) fail++;
};

async function get(url) {
  const res = await fetch(url.startsWith('http') ? url : API + url, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'pcl-preflight' }
  });
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, json, text };
}

console.log('部署链路预检（只读，用公开仓库验证路径）\n');

/* 1. 未认证时 /user 必须返回 401 —— deploy.mjs 依赖这个来判断 token 有效性 */
{
  const r = await get('/user');
  check('GET /user 未认证 → 401', r.status === 401, `实际 ${r.status}`);
}

/* 2. 仓库查询路径 */
{
  const r = await get(`/repos/${PUB}`);
  check(`GET /repos/{owner}/{repo} → 200`, r.status === 200,
    r.json ? `仓库 ${r.json.full_name}，默认分支 ${r.json.default_branch}` : '无 JSON');
}

/* 3. 分支引用路径 */
{
  const r = await get(`/repos/${PUB}/git/ref/heads/master`);
  check('GET /repos/{o}/{r}/git/ref/heads/{branch} → 200',
    r.status === 200 && r.json && r.json.object && /^[0-9a-f]{40}$/.test(r.json.object.sha),
    r.json && r.json.object ? 'commit ' + r.json.object.sha.slice(0, 10) : `实际 ${r.status}`);
}

/* 4. tree 列表路径（deploy.mjs 用 git/trees 建新树） */
{
  const r = await get(`/repos/${PUB}/git/trees/master`);
  check('GET /repos/{o}/{r}/git/trees/{sha} → 200 且含 tree 数组',
    r.status === 200 && Array.isArray(r.json?.tree),
    r.json?.tree ? `${r.json.tree.length} 个条目` : `实际 ${r.status}`);
}

/* 5. 单个 blob 路径（deploy.mjs 用它对每个文件建 blob） */
let sampleSha = null;
{
  const t = await get(`/repos/${PUB}/git/trees/master`);
  sampleSha = t.json?.tree?.[0]?.sha || null;
  if (sampleSha) {
    const r = await get(`/repos/${PUB}/git/blobs/${sampleSha}`);
    check('GET /repos/{o}/{r}/git/blobs/{sha} → 200 且含 base64 content',
      r.status === 200 && typeof r.json?.content === 'string',
      r.json ? `${r.json.encoding}, ${r.json.size} 字节` : `实际 ${r.status}`);
  } else {
    check('GET /repos/{o}/{r}/git/blobs/{sha}', false, '拿不到样本 sha');
  }
}

/* 6. Pages 查询路径（deploy.mjs 用 POST 创建，403/404 都说明路径存在） */
{
  const r = await get(`/repos/${PUB}/pages`);
  check('GET /repos/{o}/{r}/pages 路径有效（403/404 均说明路由存在，非 404 域名错）',
    [200, 403, 404].includes(r.status), `实际 ${r.status}`);
}

/* 7. DNS 修正覆盖情况 */
{
  const hosts = ['api.github.com', 'github.com', 'codeload.github.com', 'objects.githubusercontent.com'];
  const results = await Promise.all(hosts.map(async (h) => {
    try { const r = await fetch('https://' + h + '/', { method: 'HEAD', redirect: 'manual' }); return `${h}=${r.status}`; }
    catch (e) { return `${h}=ERR`; }
  }));
  check('关键域名均可解析并连通', results.every((s) => !s.endsWith('ERR')), results.join(' '));
}

/* 8. 待上传清单统计 */
{
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = path.resolve(import.meta.dirname, '..');
  let n = 0, bytes = 0;
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      if (name === 'node_modules') continue;
      const full = path.join(d, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name !== 'deploy.mjs') { n++; bytes += st.size; }
    }
  };
  walk(root);
  check('待上传文件清单可枚举', n > 10, `${n} 个文件，${(bytes / 1024).toFixed(0)} KB`);
}

console.log(fail ? `\n✗ ${fail} 项预检未通过` : '\n✓ 部署链路预检全部通过：路径与连通性都没问题，拿到 token 即可直接部署');
process.exit(fail ? 1 : 0);
