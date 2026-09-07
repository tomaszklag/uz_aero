#!/usr/bin/env node
/**
 * Renderuje `docs/CHANGELOG.md` do strony `site/dist/wydania/index.html`.
 *
 *   node site/tools/render-changelog.mjs   (same wydania)
 *   node site/tools/build.mjs              (cała strona - tak buduje ją obraz)
 *
 * Źródłem prawdy o wydaniach jest Markdown w repozytorium aplikacji (edytowany razem
 * z kodem); ta strona jest tylko jego widokiem. Obsługiwany, świadomie wąski format:
 *   # Tytuł                      (pomijany - strona ma własny nagłówek)
 *   <!-- … -->                   (notatki dla piszących - pomijane)
 *   akapity przed pierwszym `##` (wstęp)
 *   ## 1.0.0 (build 1) · 26 sierpnia 2026    → jedno wydanie; „## W przygotowaniu" = następne
 *   > jedno zdanie o wydaniu                  (opcjonalnie, tuż pod nagłówkiem)
 *   ### Nowości / ### Poprawki / ### Dla testerów / ### Co zawiera   → grupy
 *   - punkt (z **pogrubieniem**, `kodem` i [linkiem](url))
 *   ## Plan wydań                             → moduł „Co dalej" (nie jest wydaniem)
 *   ### 1.1.0 · planowane na wrzesień 2026    → kamień milowy (bez numeru wersji = koszyk „Dalej")
 *   - [x] gotowe · [~] w toku · [ ] w planach → punkty planu
 *
 * Układ strony: tablica stanu (aktualne wydanie + następne z terminem z planu + dokumentacja),
 * plan wydań i oś wydań z indeksem. Rozwinięte są tylko wydanie aktualne i nadchodzące;
 * starsze zwijają się do jednej linii z licznikami zmian. Style: releases.css z site/src/.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const repo = resolve(here, '../..');
const src = resolve(opt('src') ?? resolve(repo, 'docs/CHANGELOG.md'));
const out = resolve(resolve(opt('out') ?? resolve(repo, 'site/dist')), 'wydania/index.html');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+|[^)]+)\)/g, '<a href="$2">$1</a>');

// ── parsowanie do bloków ───────────────────────────────────────────────────
// blok: { type:'p', text } | { type:'ul', items:[{ text, state }] } | { type:'group', title, lead, blocks }
const lines = readFileSync(src, 'utf8').split(/\r?\n/);
const intro = [];
const sections = [];
let sec = null, grp = null, list = null, para = [];
const blocks = () => (grp ?? sec)?.blocks ?? intro;
const flushPara = () => { if (para.length) { blocks().push({ type: 'p', text: para.join(' ') }); para = []; } };
const flushList = () => { if (list) { blocks().push({ type: 'ul', items: list }); list = null; } };
const taskOf = (s) => { const m = /^\[( |x|~)\]\s+/.exec(s); return m ? { text: s.slice(m[0].length), state: m[1] === 'x' ? 'done' : m[1] === '~' ? 'wip' : 'todo' } : { text: s, state: null }; };

let inComment = false;
for (const raw of lines) {
  const line = raw.trimEnd();
  if (inComment) { if (line.includes('-->')) inComment = false; continue; }
  if (line.startsWith('<!--')) { if (!line.includes('-->')) inComment = true; continue; }
  if (/^# /.test(line)) continue;
  if (/^## /.test(line)) { flushPara(); flushList(); grp = null; sec = { title: line.slice(3).trim(), lead: null, blocks: [] }; sections.push(sec); continue; }
  if (/^### /.test(line)) { flushPara(); flushList(); grp = { type: 'group', title: line.slice(4).trim(), lead: null, blocks: [] }; sec.blocks.push(grp); continue; }
  if (/^> /.test(line)) { const host = grp ?? sec; if (host && host.lead == null && host.blocks.length === 0) { host.lead = line.slice(2).trim(); continue; } }
  if (/^- /.test(line)) { flushPara(); (list ??= []).push(taskOf(line.slice(2).trim())); continue; }
  if (line === '') { flushPara(); flushList(); continue; }
  para.push(line.trim());
}
flushPara(); flushList();

// ── model ──────────────────────────────────────────────────────────────────
const isPlan = (s) => /^plan/i.test(s.title);
const plan = sections.find(isPlan) ?? null;
const releases = sections.filter((s) => !isPlan(s));
const kindOf = (title) => /nowo|zawiera/i.test(title) ? 'new' : /popraw|napraw/i.test(title) ? 'fix' : /tester|uwag/i.test(title) ? 'test' : 'other';
const splitTitle = (t) => { const m = /^(\S+)\s*\(build\s*(\d+)\)\s*·\s*(.+)$/.exec(t); return m ? { version: m[1], build: m[2], date: m[3] } : { version: t, build: null, date: null }; };
const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many}`;
const itemsOf = (g) => g.blocks.filter((b) => b.type === 'ul').reduce((n, b) => n + b.items.length, 0);
const countsOf = (r) => r.groups.map((g) => {
  const k = kindOf(g.title), n = itemsOf(g);
  const label = k === 'new' ? plural(n, 'nowość', 'nowości', 'nowości') : k === 'fix' ? plural(n, 'poprawka', 'poprawki', 'poprawek') : k === 'test' ? plural(n, 'uwaga dla testerów', 'uwagi dla testerów', 'uwag dla testerów') : `${n} · ${g.title.toLowerCase()}`;
  return `<span class="cnt ${k}">${label}</span>`;
}).join('');

for (const r of releases) {
  r.upcoming = /przygotowaniu|unreleased/i.test(r.title);
  r.groups = r.blocks.filter((b) => b.type === 'group');
  r.t = splitTitle(r.title);
  r.id = r.upcoming ? 'w-przygotowaniu' : 'v' + r.t.version.replace(/[^0-9a-z.]/gi, '-');
}
const current = releases.find((r) => !r.upcoming);
const upcoming = releases.find((r) => r.upcoming);

const milestones = plan ? plan.blocks.filter((b) => b.type === 'group').map((g) => {
  const m = /^(\d[\w.-]*)\s*·\s*(.+)$/.exec(g.title);
  const tasks = g.blocks.filter((b) => b.type === 'ul').flatMap((b) => b.items).map((t) => ({ ...t, state: t.state ?? 'todo' }));
  return { title: g.title, version: m ? m[1] : null, when: m ? m[2] : null, lead: g.lead, tasks,
    done: tasks.filter((t) => t.state === 'done').length, wip: tasks.filter((t) => t.state === 'wip').length };
}) : [];
const next = milestones[0]?.version ? milestones[0] : null;
const pctOf = (m) => m.tasks.length ? Math.round((m.done / m.tasks.length) * 100) : 0;

// ── fragmenty ──────────────────────────────────────────────────────────────
const ANDROID = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85a.63.63 0 0 0-.83.22l-1.88 3.24a11.43 11.43 0 0 0-8.94 0L5.65 5.67a.63.63 0 0 0-.83-.22c-.3.16-.42.54-.26.85L6.4 9.48A10.81 10.81 0 0 0 1 18h22a10.81 10.81 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"/></svg>';
const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></svg>';
const dlButton = (href, title, sub, cls = '') => `<a class="dl ${cls}" href="${href}"><span class="dl-ico">${ANDROID}</span><span class="dl-txt"><b>${title}</b><small>${sub}</small></span><span class="dl-arr">${ARROW}</span></a>`;

const renderBlocks = (bs) => bs.map((b) => b.type === 'p' ? `<p>${inline(b.text)}</p>`
  : b.type === 'ul' ? `<ul>${b.items.map((it) => `<li>${inline(it.text)}</li>`).join('')}</ul>`
  : `<section class="grp ${kindOf(b.title)}"><h3>${esc(b.title)}</h3>${b.lead ? `<p>${inline(b.lead)}</p>` : ''}${renderBlocks(b.blocks)}</section>`).join('');

const article = (r) => {
  const open = r === current || r === upcoming;
  const badge = r.upcoming ? '<span class="badge soon">w przygotowaniu</span>' : r === current ? '<span class="badge now">aktualne</span>' : '';
  const version = r.upcoming ? (next ? esc(next.version) : 'Następne') : esc(r.t.version);
  const meta = r.upcoming ? (next ? `następne wydanie · ${esc(next.when)}` : 'zmiany od ostatniego builda') : `build ${esc(r.t.build ?? '?')} · ${esc(r.t.date ?? '')}`;
  return `<details class="release${r.upcoming ? ' upcoming' : ''}${r === current ? ' current' : ''}" id="${r.id}"${open ? ' open' : ''}>
  <summary>
    <span class="rel-dot" aria-hidden="true"></span>
    <span class="rel-ver">${version}</span>
    <span class="rel-meta">${meta}</span>
    ${badge}
    <span class="rel-counts">${countsOf(r)}</span>
    <span class="rel-chev" aria-hidden="true">⌄</span>
  </summary>
  <div class="rel-body">${r.lead ? `<p class="rel-lead">${inline(r.lead)}</p>` : ''}${renderBlocks(r.blocks)}</div>
</details>`;
};

const indexItem = (r) => `<li><a href="#${r.id}" class="${r.upcoming ? 'soon' : r === current ? 'now' : ''}"><b>${r.upcoming ? (next ? esc(next.version) : 'Następne') : esc(r.t.version)}</b><span>${r.upcoming ? 'w przygotowaniu' : esc(r.t.date ?? '')}</span></a></li>`;

const currentCard = current ? `
    <div class="status-card now">
      <span class="tag">Aktualne wydanie</span>
      <div class="status-ver">${esc(current.t.version)}</div>
      <div class="status-meta">build ${esc(current.t.build ?? '?')} · ${esc(current.t.date ?? '')} · Android</div>
      ${current.lead ? `<p>${inline(current.lead)}</p>` : ''}
      <div class="status-actions col">${dlButton('../pobierz/', 'Pobierz na Androida', `APK · wersja ${esc(current.t.version)} (build ${esc(current.t.build ?? '?')})`, 'wide')}<a class="btn ghost" href="#${current.id}">Co zawiera to wydanie</a></div>
    </div>` : '';

const upcomingCard = upcoming ? `
    <div class="status-card soon">
      <span class="tag">Następne wydanie</span>
      ${next ? `<div class="status-ver amber">${esc(next.version)}</div><div class="status-meta">${esc(next.when)}</div>` : '<div class="status-title">W przygotowaniu</div>'}
      ${upcoming.lead ? `<p>${inline(upcoming.lead)}</p>` : ''}
      <div class="rel-counts">${countsOf(upcoming)}</div>
      ${next && next.tasks.length ? `<div class="status-progress"><div class="ms-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pctOf(next)}" aria-label="Postęp planu"><i style="width:${pctOf(next)}%"></i></div><span>${next.done} z ${next.tasks.length} punktów planu gotowe${next.wip ? ` · ${next.wip} w toku` : ''}</span></div>` : ''}
      <div class="status-actions"><a class="btn ghost" href="#${upcoming.id}">Co już jest <span class="arr">→</span></a>${plan ? '<a class="btn ghost" href="#plan">Plan wydań</a>' : ''}</div>
    </div>` : '';

const docsCard = `
    <div class="status-card docs">
      <span class="tag">Dokumentacja</span>
      <div class="status-title">Podręcznik pilota i klubu</div>
      <p>Od instalacji i pierwszego logowania, przez kokpit i zdanie samolotu, po panel klubu. Ze spisem treści i wyszukiwarką.</p>
      <ul class="status-links"><li><a href="../dokumentacja/pierwsze-logowanie/">Pierwsze logowanie</a></li><li><a href="../dokumentacja/kokpit/">Kokpit</a></li><li><a href="../dokumentacja/zdanie-samolotu/">Zdanie samolotu</a></li><li><a href="../dokumentacja/panel-wprowadzenie/">Panel klubu</a></li></ul>
      <div class="status-actions"><a class="btn ghost" href="../dokumentacja/">Otwórz dokumentację <span class="arr">→</span></a></div>
    </div>`;

const stateLabel = { done: 'gotowe', wip: 'w toku', todo: 'w planach' };
const milestoneCard = (m, i) => `
    <article class="ms${i === 0 && m.version ? ' next' : ''}${m.version ? '' : ' later'}">
      <header class="ms-head">
        <span class="tag">${i === 0 && m.version ? 'Następne wydanie' : m.version ? 'Kolejne wydanie' : 'Bez terminu'}</span>
        <div class="ms-ver">${esc(m.version ?? m.title)}</div>
        ${m.when ? `<div class="ms-when">${esc(m.when)}</div>` : ''}
      </header>
      ${m.lead ? `<p class="ms-lead">${inline(m.lead)}</p>` : ''}
      ${m.version && m.tasks.length ? `<div class="ms-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pctOf(m)}" aria-label="Postęp wydania ${esc(m.version)}"><i style="width:${pctOf(m)}%"></i></div><p class="ms-cap">${m.done} z ${m.tasks.length} gotowe${m.wip ? ` · ${m.wip} w toku` : ''}</p>` : ''}
      <ul class="ms-items">${m.tasks.map((t) => `<li class="${t.state}"><i aria-hidden="true"></i><span>${inline(t.text)}</span><em>${stateLabel[t.state]}</em></li>`).join('')}</ul>
    </article>`;

const planSection = plan ? `
  <section class="plan" id="plan" aria-labelledby="plan-h">
    <div class="plan-head">
      <div><p class="kicker">Plan wydań</p><h2 class="h-display" id="plan-h">Co dalej</h2></div>
      <p class="sub">Nad czym pracujemy i kiedy planujemy kolejne wydania. Terminy są orientacyjne: wydanie wychodzi, gdy przejdzie testy z pilotami.</p>
    </div>
    <div class="plan-grid">${milestones.map(milestoneCard).join('')}
    </div>
    <p class="plan-legend"><span class="done">gotowe - już w kodzie</span><span class="wip">w toku</span><span class="todo">w planach</span></p>
  </section>` : '';

const html = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wydania i zmiany - UZ Aero</title>
<meta name="description" content="Co nowego w kolejnych wydaniach UZ Aero: aktualna wersja, plan kolejnych wydań, nowości, poprawki i uwagi dla testerów.">
<link rel="icon" href="../favicon.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Bebas+Neue&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../site.css">
<link rel="stylesheet" href="../releases.css">
<!-- WYGENEROWANE z docs/CHANGELOG.md repozytorium aplikacji (tools/render-changelog.mjs) - nie edytuj ręcznie. -->
</head>
<body>
<div class="backdrop" aria-hidden="true"></div>
<header class="top"><div class="wrap">
  <a class="brand" href="../" aria-label="UZ Aero - strona główna">
    <span class="mark"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg></span>
    <span class="brand-name">UZ <em>AERO</em></span>
  </a>
  <nav aria-label="Nawigacja"><a href="../">Strona główna</a><a class="on" href="./">Wydania</a><a href="../dokumentacja/">Dokumentacja</a><a class="cta" href="../pobierz/">Pobierz aplikację</a></nav>
</div></header>

<main class="wrap releases">
  <section class="rel-hero">
    <p class="kicker">Wydania i zmiany</p>
    <h1 class="h-display">Co nowego<br>w UZ Aero</h1>
    <p class="sub">Strona dla pilotów, testerów i klubów: aktualna wersja aplikacji, co się zmieniło, co planujemy dalej i na co zwrócić uwagę w testach. Nowe wydanie pojawia się tu razem z buildem.</p>
    ${intro.length ? `<div class="rel-intro">${renderBlocks(intro)}</div>` : ''}
  </section>

  <section class="status-board" aria-label="Stan wydań">${currentCard}${upcomingCard}${docsCard}
  </section>
${planSection}
  <section class="rel-layout">
    <aside class="rel-index" aria-label="Lista wydań">
      <p class="rel-index-title">Wszystkie wydania</p>
      <ul>${releases.map(indexItem).join('')}</ul>
      <button type="button" class="rel-toggle" id="rel-toggle" data-open="0">Rozwiń wszystkie</button>
    </aside>
    <div class="rel-list">
${releases.map(article).join('\n')}
    </div>
  </section>
</main>

<footer class="wrap">
  <span>UZ Aero · 2026</span>
  <nav><a href="../">Strona główna</a><a href="../pobierz/">Pobierz aplikację</a><a href="../dokumentacja/">Dokumentacja</a><a href="../prywatnosc.html">Polityka prywatności</a><a href="../regulamin.html">Regulamin</a></nav>
</footer>

<script>
  (function () {
    var all = Array.prototype.slice.call(document.querySelectorAll('details.release'));
    // Link z kotwicą (także z innej strony) otwiera zwinięte wydanie.
    function openHash() { var el = location.hash && document.getElementById(location.hash.slice(1)); if (el && el.tagName === 'DETAILS') el.open = true; }
    openHash(); window.addEventListener('hashchange', openHash);
    var btn = document.getElementById('rel-toggle');
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('data-open') !== '1';
      all.forEach(function (d) { d.open = open; });
      btn.setAttribute('data-open', open ? '1' : '0');
      btn.textContent = open ? 'Zwiń wszystkie' : 'Rozwiń wszystkie';
    });
  })();
</script>
</body>
</html>
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`OK: ${releases.length} wydań, ${milestones.length} kamieni milowych planu → ${out}`);
