/**
 * DNS 修正（动态版）
 *
 * 背景：部分网络环境（hosts 劫持 / DNS 污染）会把 github.com、api.github.com
 * 解析成 127.0.0.1，但 GitHub 的真实 IP 其实可以直连。
 *
 * 做法：只对本文件声明的「受影响域名」接管 Node 的 dns.lookup，
 * 用国内可达的 DNS-over-HTTPS 端点（阿里 223.5.5.5 / 腾讯 doh.pub）动态解析真实 IP，
 * 结果缓存 10 分钟；解析失败再退回内置兜底 IP。其他域名一律走系统解析，不做任何改动。
 *
 * 这样 GitHub 换 IP 也不会失效（不再依赖写死的 IP 表）。
 */
import dns from 'node:dns';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

/* 需要接管的域名后缀 */
const SUFFIXES = ['github.com', 'githubusercontent.com', 'github.io', 'githubassets.com', 'githubapp.com'];

/* DNS-over-HTTPS 解析端点（按可达性排序；1.1.1.1 在部分网络不可达，故不用） */
const DOH = [
  'https://223.5.5.5/resolve?name=%s&type=A',
  'https://doh.pub/dns-query?name=%s&type=A'
];

/* 兜底 IP：DoH 也失败、或 DoH 给的 IP 在本网络不可达时使用。
   github.com 这几个网段来自实测（DoH 常返回 20.205.243.166，那个在本网络连不上）。 */
const FALLBACK = {
  'api.github.com': ['20.205.243.168', '140.82.112.6', '140.82.113.6'],
  'github.com': ['140.82.112.4', '140.82.113.4', '140.82.114.4', '20.205.243.166'],
  'codeload.github.com': ['140.82.112.9', '140.82.113.9', '20.205.243.165'],
  'objects.githubusercontent.com': ['185.199.108.133', '185.199.109.133', '185.199.110.133', '185.199.111.133'],
  'raw.githubusercontent.com': ['185.199.108.133', '185.199.109.133', '185.199.110.133', '185.199.111.133'],
  'gist.githubusercontent.com': ['185.199.108.133', '185.199.109.133'],
  'pages.github.com': ['192.30.252.153', '192.30.252.154']
};

const TTL_MS = 10 * 60 * 1000;
const cache = new Map();     // host -> { ips, at }
const inflight = new Map();  // host -> Promise

function affected(hostname) {
  return SUFFIXES.some((s) => hostname === s || hostname.endsWith('.' + s));
}

function localIpTable() {
  // scripts/github-ips.json（由 api.github.com/meta 生成）作为额外兜底
  const file = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'github-ips.json');
  const table = {};
  try {
    const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
    const v4 = (arr) => (arr || []).filter((x) => net.isIPv4(x));
    for (const ip of v4(meta.api)) (table['api.github.com'] ||= []).push(ip);
    for (const ip of v4(meta.web)) {
      (table['github.com'] ||= []).push(ip);
      (table['codeload.github.com'] ||= []).push(ip);
      (table['objects.githubusercontent.com'] ||= []).push(ip);
    }
    for (const ip of v4(meta.pages)) (table['pages.github.com'] ||= []).push(ip);
  } catch { /* 忽略 */ }
  return table;
}

const EXTRA = localIpTable();

async function dohResolve(hostname) {
  for (const tpl of DOH) {
    try {
      const ctl = AbortSignal.timeout(8000);
      const res = await fetch(tpl.replace('%s', encodeURIComponent(hostname)), {
        headers: { accept: 'application/dns-json' },
        signal: ctl
      });
      if (!res.ok) continue;
      const json = await res.json();
      const ips = (json.Answer || [])
        .filter((a) => a.type === 1 && net.isIPv4(a.data))
        // 过滤掉被污染的结果
        .map((a) => a.data)
        .filter((ip) => !ip.startsWith('127.') && !ip.startsWith('0.'));
      if (ips.length) return [...new Set(ips)];
    } catch { /* 换下一个端点 */ }
  }
  return [];
}

function fallbackFor(hostname) {
  if (FALLBACK[hostname]) return FALLBACK[hostname];
  for (const [host, ips] of Object.entries(FALLBACK)) {
    if (hostname.endsWith('.' + host.split('.').slice(-2).join('.'))) return ips;
  }
  for (const [host, ips] of Object.entries(EXTRA)) {
    if (hostname === host || hostname.endsWith('.' + host)) return ips;
  }
  // 最后兜底：任意 *.github.com / *.github.io 用已知 IP
  if (hostname.endsWith('.github.com') || hostname === 'github.com') return FALLBACK['github.com'];
  if (hostname.endsWith('.github.io')) return ['185.199.108.153', '185.199.109.153'];
  if (hostname.endsWith('.githubusercontent.com')) return FALLBACK['objects.githubusercontent.com'];
  return [];
}

async function resolveIps(hostname) {
  const hit = cache.get(hostname);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ips;
  if (inflight.has(hostname)) return inflight.get(hostname);

  const task = (async () => {
    let ips = await dohResolve(hostname);
    let source = 'DoH';
    if (!ips.length) { ips = fallbackFor(hostname); source = '兜底IP表'; }

    // DoH 只说明「DNS 记录是多少」，不代表这个 IP 在**本网络**能连上
    // （GitHub 的多地 IP 里经常有一部分被墙）。逐个探测 443 端口，把能连的排前面。
    const probe = await probeReachable(ips);
    if (probe.reachable.length) {
      ips = [...probe.reachable, ...probe.unreachable];
      source += `，实测可达 ${probe.reachable.length}/${probe.reachable.length + probe.unreachable.length}`;
    } else if (ips.length > 1) {
      // 全都探不通（可能只是 443 探测被拦），保留原顺序
      source += '，探测全失败';
    }

    cache.set(hostname, { ips, at: Date.now() });
    inflight.delete(hostname);
    if (process.env.PCL_DNS_DEBUG) console.log(`[dns-fix] ${hostname} → ${ips.join(', ')}  (${source})`);
    return ips;
  })();

  inflight.set(hostname, task);
  return task;
}

/* 并发探测 TCP 443 是否可连，避免拿到被墙的 IP 后要等 10 秒超时 */
function probeReachable(ips, timeoutMs = 2500) {
  const one = (ip) => new Promise((resolve) => {
    const sock = net.connect({ host: ip, port: 443 });
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve({ ip, ok });
    };
    sock.setTimeout(timeoutMs, () => finish(false));
    sock.on('connect', () => finish(true));
    sock.on('error', () => finish(false));
  });

  return Promise.all(ips.map(one)).then((rows) => ({
    reachable: rows.filter((r) => r.ok).map((r) => r.ip),
    unreachable: rows.filter((r) => !r.ok).map((r) => r.ip)
  }));
}

const stats = { hits: 0, miss: 0, failed: 0 };

export function installDnsFix({ quiet = false } = {}) {
  if (dns.__pclPatched) {
    if (!quiet) console.log('DNS 修正已处于启用状态。');
    return { patched: true, suffixes: SUFFIXES };
  }

  const realLookup = dns.lookup;

  dns.lookup = function patched(hostname, options, callback) {
    let opts = options;
    let cb = callback;
    if (typeof options === 'function') { cb = options; opts = {}; }
    opts = opts || {};

    if (typeof cb !== 'function') cb = () => {};
    if (opts.hints || opts.verbatim === false) { /* 仍然接管，只是记下来 */ }

    if (typeof hostname !== 'string' || !affected(hostname)) {
      stats.miss++;
      return realLookup(hostname, options, callback);
    }

    stats.hits++;
    resolveIps(hostname)
      .then((ips) => {
        if (!ips.length) { stats.failed++; return realLookup(hostname, options, callback); }
        if (opts && opts.all) {
          return cb(null, ips.map((address) => ({ address, family: 4 })));
        }
        return cb(null, ips[0], 4);
      })
      .catch(() => { stats.failed++; realLookup(hostname, options, callback); });
  };

  dns.__pclPatched = true;

  // 自检：把关键域名先解析一遍
  const hosts = ['api.github.com', 'github.com'];
  return Promise.all(hosts.map((h) => resolveIps(h))).then((rows) => {
    if (!quiet) {
      rows.forEach((ips, i) => console.log(`[dns-fix] ${hosts[i]} → ${ips.join(', ') || '(解析失败)'}`));
    }
    return { patched: true, suffixes: SUFFIXES };
  });
}

export async function dnsFixStats() {
  return { ...stats, cacheSize: cache.size };
}

/**
 * 把 hostname 的候选 IP 提到列表最前（用于「上次这个 IP 连不上」后的重试）。
 * 同时返回下一个候选，便于多次重试逐个换 IP。
 */
export function rotateIp(hostname) {
  const entry = cache.get(hostname);
  if (!entry || entry.ips.length < 2) return null;
  entry.ips.push(entry.ips.shift());   // 轮转：把当前的挪到末尾
  return entry.ips[0];
}

/** 强制丢弃某个域名的缓存，下次重新解析 */
export function invalidate(hostname) {
  cache.delete(hostname);
  inflight.delete(hostname);
}

/**
 * 带 DNS 修正的 fetch：对受影响的域名，若首次请求因「连接类」错误失败，
 * 会自动换一个候选 IP 重试（最多 attempts 次）。
 */
export async function fixedFetch(url, init = {}, { attempts = 3 } = {}) {
  const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
  let lastErr = null;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastErr = err;
      const code = err?.cause?.code || err?.code || '';
      const retryable = /TIMEOUT|ECONNRESET|ECONNREFUSED|ENETUNREACH|EAI_AGAIN|UND_ERR_SOCKET|EPIPE/.test(String(code))
        || /fetch failed/i.test(err?.message || '');
      if (!host || !affected(host) || !retryable || i === attempts - 1) break;
      // 让下一次 dns.lookup 拿到另一个候选 IP
      const next = rotateIp(host) || (invalidate(host), null);
      if (process.env.PCL_DNS_DEBUG) console.log(`[dns-fix] ${host} 第 ${i + 1} 次失败(${code})，改用 ${next || '重新解析'}`);
    }
  }
  throw lastErr;
}

export { resolveIps, affected };
