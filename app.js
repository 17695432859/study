/* 初中物理·化学实验库 —— 交互逻辑（无依赖，纯前端） */
(function () {
  'use strict';

  var MODULES = [
    { key: 'physics',   name: '物理实验',  sub: '初中物理全部必做实验与重点探究', emoji: '🧲' },
    { key: 'chemistry', name: '化学实验',  sub: '初中化学基础操作、气体制备与性质探究', emoji: '⚗️' }
  ];

  var STORE_KEY = 'pcl.progress.v1';
  var THEME_KEY = 'pcl.theme';

  var state = {
    route: 'home',
    q: '',
    done: loadDone()
  };

  /* ---------- storage ---------- */
  function loadDone() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveDone() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state.done)); } catch (e) {}
  }
  function isDone(id) { return !!state.done[id]; }
  function toggleDone(id) {
    if (state.done[id]) delete state.done[id]; else state.done[id] = 1;
    saveDone();
  }

  /* ---------- data access ---------- */
  function list(key) {
    var raw = key === 'physics' ? window.PHYSICS : window.CHEMISTRY;
    return Array.isArray(raw) ? raw : [];
  }
  function modMeta(key) {
    for (var i = 0; i < MODULES.length; i++) if (MODULES[i].key === key) return MODULES[i];
    return null;
  }
  function totalDone() {
    var n = 0;
    MODULES.forEach(function (m) {
      list(m.key).forEach(function (e) { if (isDone(e.id)) n++; });
    });
    return n;
  }
  function totalCount() {
    return MODULES.reduce(function (n, m) { return n + list(m.key).length; }, 0);
  }

  /* ---------- tiny DOM helpers (text-safe) ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null && text !== '') n.textContent = text;
    return n;
  }
  function frag() { return document.createDocumentFragment(); }
  function appendAll(parent, kids) {
    (kids || []).forEach(function (k) { if (k) parent.appendChild(k); });
    return parent;
  }

  /* ---------- text search ---------- */
  function matches(exp, q) {
    if (!q) return true;
    var hay = [
      exp.title, exp.grade, exp.lesson, exp.purpose, exp.conclusion, exp.observe,
      (exp.materials || []).join(' '),
      (exp.steps || []).join(' '),
      (exp.safety || []).join(' ')
    ].join(' ').toLowerCase();
    var needles = q.toLowerCase().split(/\s+/).filter(Boolean);
    for (var i = 0; i < needles.length; i++) {
      if (hay.indexOf(needles[i]) === -1) return false;
    }
    return true;
  }

  /* ---------- render: home ---------- */
  function renderHome() {
    var view = el('div');
    var intro = el('p', 'hint', '两个模块各自独立。点进任意实验可展开器材清单、操作步骤、现象与结论，' +
      '并带随堂小测；勾选和自测进度会保存在本机浏览器里。');
    view.appendChild(intro);

    var grid = el('div', 'mods');
    appendAll(grid, MODULES.map(function (m) {
      var a = el('a', 'mod ' + (m.key === 'physics' ? 'mod-phy' : 'mod-chem'));
      a.href = '#/' + m.key;
      a.appendChild(el('span', 'badge', m.emoji + ' ' + m.name));
      a.appendChild(el('h2', null, m.name));
      a.appendChild(el('p', null, m.sub));
      var items = list(m.key);
      var done = items.filter(function (e) { return isDone(e.id); }).length;
      a.appendChild(el('p', 'hint', '共 ' + items.length + ' 个实验' +
        (done ? ' · 已完成 ' + done + ' 个' : '')));
      return a;
    }));
    view.appendChild(grid);
    return view;
  }

  /* ---------- render: experiment card ---------- */
  function card(exp, modKey) {
    var d = el('details', 'exp' + (isDone(exp.id) ? ' done' : ''));
    d.id = 'exp-' + exp.id;

    var sum = el('summary');
    var cb = el('input');
    cb.type = 'checkbox';
    cb.checked = isDone(exp.id);
    cb.title = '标记为已掌握';
    cb.style.accentColor = 'var(--ok)';
    cb.addEventListener('click', function (ev) {
      ev.stopPropagation();
      toggleDone(exp.id);
      d.classList.toggle('done', isDone(exp.id));
      updateStats();
    });
    sum.appendChild(cb);
    sum.appendChild(el('span', 'title', exp.title));
    sum.appendChild(el('span', 'tag', [exp.grade, exp.lesson].filter(Boolean).join(' · ')));
    d.appendChild(sum);

    var body = el('div', 'body');

    if (exp.purpose) {
      body.appendChild(section('实验目的', [el('p', 'purpose', exp.purpose)]));
    }

    if (exp.materials && exp.materials.length) {
      var ul = el('ul', 'mats');
      exp.materials.forEach(function (m) {
        var li = el('li', null, m);
        li.style.cursor = 'pointer';
        li.title = '点击划掉 / 恢复';
        li.addEventListener('click', function () { li.classList.toggle('on'); });
        ul.appendChild(li);
      });
      body.appendChild(section('实验器材', [ul, el('p', 'hint', '（点器材可划掉，方便清点）')]));
    }

    if (exp.steps && exp.steps.length) {
      var ol = el('ol', 'steps');
      exp.steps.forEach(function (s) {
        var li = el('li');
        var lab = el('label', 'check');
        var c = el('input');
        c.type = 'checkbox';
        c.addEventListener('change', function () { lab.classList.toggle('on', c.checked); });
        lab.appendChild(c);
        lab.appendChild(el('span', null, s));
        li.appendChild(lab);
        ol.appendChild(li);
      });
      body.appendChild(section('操作步骤', [ol]));
    }

    if (exp.data && exp.data.headers && exp.data.rows) {
      var t = el('table', 'tbl');
      var thead = el('thead'), tr = el('tr');
      exp.data.headers.forEach(function (h) { tr.appendChild(el('th', null, h)); });
      thead.appendChild(tr); t.appendChild(thead);
      var tb = el('tbody');
      exp.data.rows.forEach(function (row) {
        var r = el('tr');
        row.forEach(function (c) { r.appendChild(el('td', null, c)); });
        tb.appendChild(r);
      });
      t.appendChild(tb);
      body.appendChild(section(exp.data.caption || '数据记录', [t]));
    }

    if (exp.observe) {
      body.appendChild(section('实验现象', [el('p', null, exp.observe)]));
    }
    if (exp.conclusion) {
      var p = el('p', null, exp.conclusion);
      var box = el('div', 'callout ok');
      box.appendChild(p);
      body.appendChild(section('结论', [box]));
    }
    if (exp.safety && exp.safety.length) {
      var box2 = el('div', 'callout danger');
      var ul2 = el('ul', 'clean');
      exp.safety.forEach(function (s) { ul2.appendChild(el('li', null, s)); });
      box2.appendChild(ul2);
      body.appendChild(section('安全提示', [box2]));
    }
    if (exp.quiz && exp.quiz.length) {
      body.appendChild(quizBlock(exp));
    }

    d.appendChild(body);
    return d;
  }

  function section(title, kids) {
    var s = el('section', 'sec');
    s.appendChild(el('h4', null, title));
    appendAll(s, kids);
    return s;
  }

  /* ---------- quiz ---------- */
  function quizBlock(exp) {
    var wrap = el('div', 'quiz');
    wrap.appendChild(el('h4', null, '随堂小测'));

    exp.quiz.forEach(function (q, qi) {
      var qd = el('div', 'q');
      qd.appendChild(el('div', 'stem', (qi + 1) + '. ' + (q.stem || q.q || '')));
      var opts = q.options || q.opts || [];
      var answered = false;
      opts.forEach(function (text, oi) {
        var lab = el('label', 'opt');
        var r = el('input');
        r.type = 'radio';
        r.name = 'q-' + exp.id + '-' + qi;
        lab.appendChild(r);
        lab.appendChild(document.createTextNode(text));
        r.addEventListener('change', function () {
          if (answered) { r.checked = false; return; }
          answered = true;
          qd.classList.add('answered');
          var right = (q.answer != null ? q.answer : q.a);
          lab.classList.add(oi === right ? 'right' : 'wrong');
          if (oi !== right) {
            var correct = qd.querySelectorAll('.opt')[right];
            if (correct) correct.classList.add('right');
          }
        });
        qd.appendChild(lab);
      });
      if (q.why || q.explain) qd.appendChild(el('div', 'why', '解析：' + (q.why || q.explain)));
      wrap.appendChild(qd);
    });
    return wrap;
  }

  /* ---------- render: module ---------- */
  function renderModule(key) {
    var meta = modMeta(key);
    var items = list(key);
    var view = el('div');

    if (!items.length) {
      view.appendChild(el('div', 'empty', '这个模块的数据还没加载出来。'));
      return view;
    }

    var filtered = items.filter(function (e) { return matches(e, state.q); });
    var head = el('p', 'hint',
      meta.name + '共 ' + items.length + ' 个实验' +
      (state.q ? '，匹配「' + state.q + '」的 ' + filtered.length + ' 个' : '') +
      '。展开＝看内容，左侧方框＝标记已掌握。');
    view.appendChild(head);

    if (!filtered.length) {
      view.appendChild(el('div', 'empty', '没有匹配的实验，换个关键词试试。'));
      return view;
    }

    // group by 年级 then 课题, preserving source order
    var groups = [];
    var index = {};
    filtered.forEach(function (e) {
      var g = (e.grade || '') + '|' + (e.lesson || '');
      if (!(g in index)) { index[g] = groups.length; groups.push({ label: [e.grade, e.lesson].filter(Boolean).join(' · ') || '其他', items: [] }); }
      groups[index[g]].items.push(e);
    });

    groups.forEach(function (g) {
      view.appendChild(el('div', 'lesson', g.label));
      g.items.forEach(function (e) { view.appendChild(card(e, key)); });
    });
    return view;
  }

  /* ---------- stats / chrome ---------- */
  function updateStats() {
    var t = totalCount(), d = totalDone();
    document.getElementById('stats').textContent =
      t ? ('共 ' + t + ' 个实验，已掌握 ' + d + ' 个' + (t ? '（' + Math.round(d / t * 100) + '%）' : ''))
        : '数据加载中…';
  }

  function renderTabs() {
    var tabs = document.getElementById('tabs');
    tabs.textContent = '';
    var home = el('a', 'tab', '首页');
    home.href = '#/';
    if (state.route === 'home') home.setAttribute('aria-current', 'true');
    tabs.appendChild(home);

    MODULES.forEach(function (m) {
      var a = el('a', 'tab');
      a.href = '#/' + m.key;
      a.textContent = m.name;
      var n = el('span', 'n', String(list(m.key).length));
      a.appendChild(n);
      if (state.route === m.key) {
        a.setAttribute('aria-current', 'true');
        a.style.setProperty('--tab-ink', m.key === 'physics' ? 'var(--phy)' : 'var(--chem)');
        a.style.setProperty('--tab-soft', m.key === 'physics' ? 'var(--phy-soft)' : 'var(--chem-soft)');
      }
      tabs.appendChild(a);
    });
  }

  function paint() {
    renderTabs();
    var view = document.getElementById('view');
    view.textContent = '';
    view.appendChild(state.route === 'home' ? renderHome() : renderModule(state.route));
    updateStats();
  }

  /* ---------- routing ---------- */
  function parseHash() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    if (!h) return 'home';
    return modMeta(h) ? h : 'home';
  }
  function onHash() {
    var next = parseHash();
    if (next !== state.route) { state.route = next; paint(); }
  }

  /* ---------- init ---------- */
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (!saved) {
      saved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', saved);
  }
  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  }

  function boot() {
    initTheme();
    state.route = parseHash();
    paint();

    window.addEventListener('hashchange', onHash);

    var s = document.getElementById('search');
    var timer = null;
    s.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        state.q = s.value.trim();
        if (state.route === 'home' && state.q) {
          // searching from home jumps to the first module that has matches
          for (var i = 0; i < MODULES.length; i++) {
            if (list(MODULES[i].key).some(function (e) { return matches(e, state.q); })) {
              location.hash = '#/' + MODULES[i].key;
              return;
            }
          }
        }
        paint();
      }, 140);
    });
    // "/" focuses the search box
    document.addEventListener('keydown', function (ev) {
      if (ev.key === '/' && document.activeElement !== s) { ev.preventDefault(); s.focus(); }
      if (ev.key === 'Escape' && document.activeElement === s) { s.value = ''; state.q = ''; s.blur(); paint(); }
    });

    document.getElementById('theme').addEventListener('click', toggleTheme);
    document.getElementById('reset').addEventListener('click', function () {
      if (!confirm('清空所有"已掌握"标记？')) return;
      state.done = {}; saveDone(); paint();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
