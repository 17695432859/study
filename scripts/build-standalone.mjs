/**
 * 打包成单个自包含 HTML 文件：把 CSS、数据、JS 全部内联进 index.html。
 * 产物：standalone.html —— 可以直接双击打开（file:// 也能用），不需要服务器、不需要网络。
 *
 * 用法： node scripts/build-standalone.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');

/* favicon 换成内联 data URI，避免 file:// 下 404 */
const favicon = read('favicon.svg').replace(/\s+/g, ' ').trim();
html = html.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(favicon)}">`);

/* 内联 CSS */
html = html.replace(/<link rel="stylesheet" href="styles\.css">/, () => {
  const css = read('styles.css');
  return `<style>\n${css}\n</style>`;
});

/* 内联三个脚本（顺序必须与 index.html 一致：数据在前、app 在后） */
const inline = (src) => {
  let js = fs.readFileSync(path.join(root, src), 'utf8');
  // 极少数情况下脚本里出现 </script> 会提前闭合标签，做个保护
  js = js.replace(/<\/script>/gi, '<\\/script>');
  return `<script>\n${js}\n</script>`;
};

const scripts = ['data/physics.js', 'data/chemistry.js', 'app.js'];
for (const src of scripts) {
  const re = new RegExp(`<script src="${src.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"><\\/script>`);
  if (!re.test(html)) throw new Error(`index.html 里找不到 ${src} 的引用`);
  html = html.replace(re, () => inline(src));
}

/* 加一句离线提示（可选） */
html = html.replace('</title>', '</title>\n<!-- 单文件离线版：CSS/数据/JS 全部内联，可直接双击打开 -->');

const out = path.join(root, 'standalone.html');
fs.writeFileSync(out, html, 'utf8');

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`已生成 standalone.html  ${kb(fs.statSync(out).size)}`);
console.log('包含：');
for (const f of ['styles.css', ...scripts]) {
  console.log(`  ${f.padEnd(20)} ${kb(fs.statSync(path.join(root, f)).size)}`);
}
