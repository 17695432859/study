# 初中物理 · 化学实验库

一个**零依赖、纯静态**的交互式复习网页：把初中物理和初中化学的必做实验整理成可搜索、可勾选、可自测的卡片。

物理、化学是**两个独立模块**，各自有独立路由，可分别打开、分别分享。

## 功能

- **两个独立模块**：`#/physics` 物理实验、`#/chemistry` 化学实验，互不混杂
- **按章节分组**：按教材"年级 · 章节"自动分节（八上 / 八下 / 九上 / 九下）
- **每张实验卡**：实验目的 · 器材清单（可点选划掉清点）· 操作步骤（逐步打勾）· 数据记录表 · 实验现象 · 结论 · 安全提示
- **随堂小测**：每个实验内置单选题，选错会同时标出正确答案并给解析
- **搜索**：顶部搜索框，可搜实验名 / 器材 / 现象 / 结论；按 `/` 快速聚焦，`Esc` 清空
- **进度记忆**：勾选"已掌握"与自测状态存在浏览器 `localStorage`，刷新不丢
- **深色模式**：跟随系统，也可用右上角按钮手动切换
- **可打印**：打印时自动隐藏导航与测验，只留内容

## 目录结构

```
physics-chem-lab/
├── index.html          页面骨架
├── styles.css          全部样式（含深色模式与打印样式）
├── app.js              交互逻辑：路由 / 搜索 / 进度 / 渲染 / 自测
├── data/
│   ├── physics.js      物理实验数据    window.PHYSICS = [...]     36 个
│   └── chemistry.js    化学实验数据    window.CHEMISTRY = [...]   56 个
└── scripts/
    ├── serve.mjs         本地预览服务器（零依赖）
    ├── check-data.mjs    数据体检：字段 / 唯一性 / 答案下标 / 表格列数
    ├── preflight.mjs     部署链路预检：用公开仓库验证 GitHub API 路径
    ├── test-browser.mjs  真实浏览器（Edge/Chrome 无头）渲染断言
    ├── test-render.mjs   无浏览器 DOM 桩渲染断言
    ├── dns-fix.mjs       DNS 修正（DoH + 可达性探测 + 失败换 IP 重试）
    ├── list-data.mjs     打印实验清单
    ├── merge-chemistry.mjs  化学数据合并去重（含语义去重表）
    └── deploy.mjs        一键部署到 GitHub Pages（走 REST API，不需要装 git）
```

合计 **92 个实验**：每个都有实验目的、器材清单、操作步骤、现象、结论、安全提示，外加 2 道单选题。

## 本地预览

```sh
node scripts/serve.mjs          # 默认 http://127.0.0.1:8791/
node scripts/serve.mjs 3000     # 换端口
```

> 直接双击 `index.html` 也能看，但推荐用上面的方式（`file://` 下部分浏览器会限制本地脚本读取）。

## 数据体检

```sh
node scripts/check-data.mjs
```

会检查：`id` 唯一性与格式、必填字段、器材/步骤数量、**每道题的 `answer` 下标是否越界**、数据表格列数与表头是否一致，并打印按年级分组的统计。

## 单文件离线版（推荐给手机/发给同学）

```sh
node scripts/build-standalone.mjs     # 生成 standalone.html
```

`standalone.html` 把样式、数据、脚本**全部内联进一个文件**（约 370 KB），

- **双击即可打开**，不需要服务器、不需要网络（`file://` 下实测可用）
- 可以直接发微信/QQ 给别人，或拷到手机上用浏览器打开
- 功能与在线版完全一致（路由、搜索、勾选、自测、深色模式都在）

自测：`node scripts/test-standalone.mjs`（用真实浏览器以 `file://` 打开并断言）

## 部署到 GitHub Pages

> 本脚本用 GitHub REST API 上传，**不需要安装 git**。

1. 建一个 Personal Access Token（细粒度：`Contents: Read and write`；若要顺带建仓库再加 `Administration: Read and write`）
2. 设置环境变量：

   ```powershell
   $env:GITHUB_TOKEN="ghp_xxxxxxxx"
   ```

3. 执行：

   ```sh
   node scripts/deploy.mjs --repo physics-chem-lab
   node scripts/deploy.mjs --repo my-lab --org your-org   # 建在组织下
   ```

脚本会：创建仓库（若不存在）→ 上传全部文件 → 建提交 → 更新分支 → 尝试开启 Pages，最后打印仓库地址与站点地址。

### 如果 `github.com` 连不上（DNS 被解析成 127.0.0.1）

有些网络环境会把 `github.com` / `api.github.com` 解析到 `127.0.0.1`（hosts 劫持或 DNS 污染），表现为浏览器打不开、脚本报 `ECONNREFUSED`。但 GitHub 的**真实 IP 通常是可直连的**，所以本项目内置了一层 DNS 修正：

- `scripts/dns-fix.mjs`：覆盖 Node 的 `dns.lookup`，把 GitHub 相关域名解析到真实 IP
- `scripts/github-ips.json`：IP 表，取自 `https://api.github.com/meta`

自查与刷新：

```sh
node scripts/test-github.mjs     # 验证 Node 能否访问 GitHub
```

IP 表过期时（GitHub 会换 IP），用下面这条重新抓取（它用已知 IP 直连 API，不依赖本机 DNS）：

```powershell
curl.exe -sS --resolve api.github.com:443:140.82.112.6 https://api.github.com/meta |
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=JSON.parse(s);require('fs').writeFileSync('scripts/github-ips.json',JSON.stringify({api:m.git,web:m.web,pages:m.pages,fetched:new Date().toISOString()},null,2));console.log('ok')})"
```

配套的 `.github/workflows/pages.yml` 会在每次推送后自动发布，所以第一次部署完，之后你直接改文件再推就会有更新。

## 内容说明

- 物理按人教版八上 / 八下 / 九年级全一册编排；化学按人教版九年级上 / 下册编排。
- 现象与结论均按教材口径书写，化学方程式已配平。
- 内容供复习参考，**实际实验操作以教材与任课老师的要求为准**；涉及明火、强酸强碱、有毒气体的实验务必在老师指导下进行。
