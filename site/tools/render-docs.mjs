#!/usr/bin/env node
/**
 * Renderuje podręcznik (docs/podrecznik/*.md z repozytorium aplikacji) do modułu
 * „Dokumentacja" strony: site/dist/dokumentacja/{index.html, <slug>/index.html, search.json}.
 *
 *   node site/tools/render-docs.mjs        (sam podręcznik)
 *   node site/tools/build.mjs              (cała strona - tak buduje ją obraz)
 *
 * Wejście i wyjście domyślnie Z TEGO REPOZYTORIUM (docs/podrecznik, design, site/dist) -
 * do 2026-09-07 skrypt mieszkał w osobnym repozytorium strony i ścieżki podawało się
 * z ręki. `--src`, `--design` i `--out` zostają na wypadek renderowania gdzie indziej.
 *
 * Format źródeł opisuje komentarz na górze docs/podrecznik/spis.md. Żywe ekrany (dyrektywa
 * @screen) kopiują makiety z design/ do site/dist/screens/ z nakładką „sama rama telefonu" -
 * tą samą, którą osadza landing - więc zmiana makiety wchodzi na stronę przy następnym
 * renderowaniu. Wyszukiwarka działa w przeglądarce na dokumentacja/search.json
 * (dokumentacja.js); style: dokumentacja.css - oba wchodzą ze źródeł w site/src/.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const repo = resolve(here, '../..');
const src = resolve(opt('src') ?? join(repo, 'docs', 'podrecznik'));
const design = resolve(opt('design') ?? join(repo, 'design'));
const dist = resolve(opt('out') ?? join(repo, 'site', 'dist'));
const outDir = join(dist, 'dokumentacja');
const screensDir = join(dist, 'screens');
const panelsDir = join(dist, 'panels');
const panelSrc = resolve(design, 'panel');
const START = ['instalacja', 'pierwsze-logowanie', 'rozpoczecie-lotu', 'kokpit', 'zdanie-samolotu'];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripComments = (t) => t.replace(/<!--[\s\S]*?-->/g, '');
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const warnings = [];

// ── spis ───────────────────────────────────────────────────────────────────
const manifest = stripComments(readFileSync(join(src, 'spis.md'), 'utf8')).split(/\r?\n/);
let siteLead = '';
const chapters = [];
for (const raw of manifest) {
  const line = raw.trim();
  if (/^> /.test(line)) siteLead = line.slice(2).trim();
  else if (/^## /.test(line)) chapters.push({ title: line.slice(3).trim(), pages: [] });
  else if (/^- /.test(line)) { const slug = line.slice(2).trim(); if (existsSync(join(src, `${slug}.md`))) chapters.at(-1).pages.push({ slug }); else warnings.push(`brak pliku ${slug}.md (wymieniony w spis.md) - strona pominięta`); }
}
for (let i = chapters.length - 1; i >= 0; i--) if (!chapters[i].pages.length) chapters.splice(i, 1);
const pages = chapters.flatMap((c) => c.pages.map((p) => Object.assign(p, { chapter: c })));
const known = new Set(pages.map((p) => p.slug));

// ── markdown ───────────────────────────────────────────────────────────────
const href = (url, ctx) => {
  if (/^(https?:)?\/\//.test(url) || url.startsWith('mailto:') || url.startsWith('#')) return url;
  if (url.startsWith('~/')) return ctx.root + url.slice(2);
  const [slug, anchor] = url.split('#');
  if (known.has(slug)) return `${ctx.docroot}${slug}/${anchor ? `#${anchor}` : ''}`;
  warnings.push(`${ctx.slug}: nieznany link „${url}"`);
  return url;
};
const inline = (s, ctx) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[\s(„])\*([^*\n]+?)\*(?=[\s.,;:)”"]|$)/g, '$1<em>$2</em>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => `<a href="${href(u, ctx)}">${t}</a>`);

const callout = (text, ctx) => {
  const word = (/^\*\*([^*]+)\*\*/.exec(text)?.[1] ?? '').toLowerCase();
  const kind = /uwaga|ważne|ostrożnie/.test(word) ? 'warn' : /wskazówka|podpowiedź|rada|dobra/.test(word) ? 'tip' : /zasięg|offline|sieć|założenie|dlaczego|jak to działa/.test(word) ? 'info' : '';
  return `<aside class="callout ${kind}">${inline(text, ctx)}</aside>`;
};
const table = (rows, ctx) => {
  const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(1).map(cells).filter((r) => !r.every((c) => /^:?-+:?$/.test(c)));
  return `<div class="tbl"><table><thead><tr>${head.map((c) => `<th>${inline(c, ctx)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c, ctx)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
};
const list = (lines, start, ctx) => {
  const items = [];
  let i = start;
  while (i < lines.length) {
    const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
    if (m) { items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] }); i++; continue; }
    if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) { items.at(-1).text += ' ' + lines[i].trim(); i++; continue; }
    break;
  }
  const build = (idx, indent) => {
    const tag = items[idx].ordered ? 'ol' : 'ul';
    let html = `<${tag}>`;
    while (idx < items.length && items[idx].indent >= indent) {
      if (items[idx].indent > indent) { const [sub, n] = build(idx, items[idx].indent); html = html.replace(/<\/li>$/, `${sub}</li>`); idx = n; continue; }
      html += `<li>${inline(items[idx].text, ctx)}</li>`; idx++;
    }
    return [`${html}</${tag}>`, idx];
  };
  return [build(0, items[0].indent)[0], i];
};
const screenFigure = (spec, ctx) => {
  const items = spec.split('|').map((s) => s.trim()).filter(Boolean).map((p) => {
    const m = /^(\S+)\s+"([^"]*)"$/.exec(p);
    if (!m) throw new Error(`${ctx.slug}: zła dyrektywa @screen „${p}" (oczekiwane: nazwa-makiety "Podpis")`);
    ctx.screens.add(m[1]);
    return { name: m[1], cap: m[2] };
  });
  return `<figure class="screens">${items.map((it) => `<div class="screen"><div class="device"><iframe src="${ctx.root}screens/${it.name}.html" title="${esc(it.cap)}" loading="lazy" scrolling="no" tabindex="-1"></iframe></div><figcaption>${esc(it.cap)}</figcaption></div>`).join('')}</figure>`;
};

const panelFigure = (spec, ctx) => {
  const items = spec.split('|').map((s) => s.trim()).filter(Boolean).map((part) => {
    const m = /^(\S+)\s+"([^"]*)"$/.exec(part);
    if (!m) throw new Error(`${ctx.slug}: zła dyrektywa @panel „${part}" (oczekiwane: nazwa-makiety "Podpis")`);
    ctx.panels.add(m[1]);
    return { name: m[1], cap: m[2] };
  });
  return `<figure class="panels">${items.map((it) => `<div class="panel-shot"><div class="panel-frame"><iframe src="${ctx.root}panels/${it.name}.html" title="${esc(it.cap)}" loading="lazy" scrolling="no" tabindex="-1"></iframe></div><figcaption>${esc(it.cap)}</figcaption></div>`).join('')}</figure>`;
};

function render(body, ctx) {
  const lines = body.split(/\r?\n/);
  const out = [], toc = [], ids = new Set();
  let i = 0, para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '), ctx)}</p>`); para = []; } };
  const uniqueId = (base) => { let id = base || 'sekcja', n = 2; while (ids.has(id)) id = `${base}-${n++}`; ids.add(id); return id; };
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { flushPara(); i++; continue; }
    if (/^@screen\s/.test(line)) { flushPara(); out.push(screenFigure(line.slice(8), ctx)); i++; continue; }
    if (/^@panel\s/.test(line)) { flushPara(); out.push(panelFigure(line.slice(7), ctx)); i++; continue; }
    const h = /^(#{2,3})\s+(.+)$/.exec(line);
    if (h) {
      flushPara();
      const lvl = h[1].length, text = h[2].trim(), id = uniqueId(slugify(text));
      if (lvl === 2) toc.push({ id, text });
      out.push(`<h${lvl} id="${id}">${inline(text, ctx)}<a class="anchor" href="#${id}" aria-label="Link do sekcji">#</a></h${lvl}>`);
      i++; continue;
    }
    if (/^---+$/.test(line.trim())) { flushPara(); out.push('<hr>'); i++; continue; }
    if (/^>/.test(line)) { flushPara(); const q = []; while (i < lines.length && /^>/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; } out.push(callout(q.join(' '), ctx)); continue; }
    if (/^\|/.test(line)) { flushPara(); const rows = []; while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; } out.push(table(rows, ctx)); continue; }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) { flushPara(); const [html, n] = list(lines, i, ctx); out.push(html); i = n; continue; }
    para.push(line.trim()); i++;
  }
  flushPara();
  return { html: out.join('\n'), toc };
}
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// ── strony: parsowanie ─────────────────────────────────────────────────────
const allScreens = new Set();
const allPanels = new Set();
for (const p of pages) {
  const file = join(src, `${p.slug}.md`);
  if (!existsSync(file)) throw new Error(`brak pliku ${file} (wymieniony w spis.md)`);
  const lines = stripComments(readFileSync(file, 'utf8')).split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const t = /^# (.+)$/.exec(lines[i] ?? '');
  if (!t) throw new Error(`${p.slug}.md: pierwsza linia musi być tytułem „# …"`);
  p.title = t[1].trim(); i++;
  while (i < lines.length && !lines[i].trim()) i++;
  p.lead = null;
  if (/^> /.test(lines[i] ?? '')) { p.lead = lines[i].slice(2).trim(); i++; }
  const ctx = { slug: p.slug, root: '../../', docroot: '../', screens: allScreens, panels: allPanels };
  const r = render(lines.slice(i).join('\n'), ctx);
  p.html = r.html; p.toc = r.toc; p.ctx = ctx;
  p.text = plain(`${p.lead ?? ''} ${p.html}`);
}

// Ekrany, których podręcznik nie wymienia, a które osadza landing (`--extra`).
// Kopiuje je TEN renderer, bo nakładka „sama rama telefonu" jest zdefiniowana raz
// i osadzenie w landingu ma wyglądać dokładnie tak, jak w podręczniku.
for (const name of (opt('extra') ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
  allScreens.add(name);
}

// ── żywe ekrany ────────────────────────────────────────────────────────────
const OVERRIDE = `<style id="embed-override">
  /* Osadzenie w stronie uzaero: sama rama telefonu, bez etykiet i nawigacji makiety. */
  :root, body { --phone-scale: 1 !important; }
  html, body { height: auto !important; min-height: 0 !important; }
  body { margin: 0 !important; padding: 0 !important; gap: 0 !important; display: block !important;
         background: transparent !important; background-image: none !important; overflow: hidden !important; }
  body > *:not(.phone):not(.phone-wrap) { display: none !important; }
  .phone-wrap { margin: 0 !important; padding: 0 !important; }
  .phone { margin: 0 !important; transform: none !important; box-shadow: none !important; }
</style>`;
mkdirSync(screensDir, { recursive: true });
for (const name of allScreens) {
  const from = join(design, `${name}.html`);
  if (!existsSync(from)) throw new Error(`brak makiety ${from} (dyrektywa @screen albo --extra)`);
  let html = readFileSync(from, 'utf8');
  if (!html.includes('id="embed-override"')) html = html.replace('</head>', `${OVERRIDE}\n</head>`);
  writeFileSync(join(screensDir, `${name}.html`), html);
}

// ── makiety panelu (ramka okna przeglądarki) ───────────────────────────────
const PANEL_OVERRIDE = `<style id="embed-override">
  /* Osadzenie w podręczniku: samo okno przeglądarki, bez etykiety canvasu i nawigacji. */
  :root, body { --app-scale: 1 !important; }
  html, body { height: auto !important; min-height: 0 !important; }
  body { margin: 0 !important; padding: 0 !important; gap: 0 !important; display: block !important;
         background: transparent !important; background-image: none !important; overflow: hidden !important; }
  body > *:not(.browser):not(.browser-wrap) { display: none !important; }
  .browser-wrap { margin: 0 !important; padding: 0 !important; }
  .browser { margin: 0 !important; transform: none !important; box-shadow: none !important; }
</style>`;
if (allPanels.size) {
  mkdirSync(panelsDir, { recursive: true });
  const css = join(panelSrc, 'panel.css');
  if (!existsSync(css)) throw new Error(`brak ${css} - makiety panelu potrzebują wspólnego arkusza`);
  writeFileSync(join(panelsDir, 'panel.css'), readFileSync(css, 'utf8'));
  for (const name of allPanels) {
    const from = join(panelSrc, `${name}.html`);
    if (!existsSync(from)) throw new Error(`brak makiety panelu ${from} (dyrektywa @panel)`);
    let html = readFileSync(from, 'utf8');
    if (!html.includes('id="embed-override"')) html = html.replace('</head>', `${PANEL_OVERRIDE}
</head>`);
    writeFileSync(join(panelsDir, `${name}.html`), html);
  }
}

// ── rama strony ────────────────────────────────────────────────────────────
const LOUPE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>';
const MENU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
const searchBox = (docroot, big = false) => `<div class="doc-search${big ? ' big' : ''}" data-docroot="${docroot}">
      <div class="doc-q-wrap">${LOUPE}<input type="search" placeholder="Szukaj w dokumentacji…" autocomplete="off" spellcheck="false" aria-label="Szukaj w dokumentacji"><kbd aria-hidden="true">/</kbd></div>
      <ul class="doc-results" role="listbox" hidden></ul>
    </div>`;
const tree = (docroot, currentSlug) => chapters.map((c) => `<details open><summary>${esc(c.title)}</summary><ul>${c.pages.map((p) => `<li><a href="${docroot}${p.slug}/"${p.slug === currentSlug ? ' class="on" aria-current="page"' : ''}>${esc(p.title)}</a></li>`).join('')}</ul></details>`).join('\n      ');

const shell = ({ root, docroot, title, desc, bodyClass, current, main, toc }) => `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - Dokumentacja UZ Aero</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" href="${root}favicon.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Bebas+Neue&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${root}site.css">
<link rel="stylesheet" href="${root}dokumentacja.css">
<!-- WYGENEROWANE z docs/podrecznik/ repozytorium aplikacji (tools/render-docs.mjs) - nie edytuj ręcznie. -->
</head>
<body class="${bodyClass}">
<div class="backdrop" aria-hidden="true"></div>
<header class="top"><div class="wrap">
  <a class="brand" href="${root}" aria-label="UZ Aero - strona główna">
    <span class="mark"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg></span>
    <span class="brand-name">UZ <em>AERO</em></span>
  </a>
  <nav aria-label="Nawigacja"><a href="${root}">Strona główna</a><a href="${root}wydania/">Wydania</a><a class="on" href="${docroot}">Dokumentacja</a><a class="cta" href="${root}pobierz/">Pobierz aplikację</a></nav>
</div></header>

<div class="wrap docs">
  <div class="doc-bar">
    <button type="button" class="doc-menu" data-toggle-tree aria-controls="doc-side" aria-expanded="false">${MENU} Spis treści</button>
    <button type="button" class="doc-menu" data-focus-search>${LOUPE} Szukaj</button>
  </div>
  <div class="doc-overlay" data-close-tree aria-hidden="true"></div>
  <aside class="doc-side" id="doc-side">
    ${searchBox(docroot)}
    <nav class="doc-tree" aria-label="Spis treści">
      ${tree(docroot, current)}
    </nav>
    <div class="doc-side-foot"><a href="${root}">Strona główna</a><a href="${root}wydania/">Wydania</a><a href="${root}pobierz/">Pobierz</a></div>
  </aside>
${main}
  <aside class="doc-toc" aria-label="Na tej stronie">${toc}</aside>
</div>

<footer class="wrap">
  <span>UZ Aero · 2026</span>
  <nav><a href="${root}">Strona główna</a><a href="${root}wydania/">Wydania i zmiany</a><a href="${root}pobierz/">Pobierz aplikację</a><a href="${root}prywatnosc.html">Polityka prywatności</a><a href="${root}regulamin.html">Regulamin</a></nav>
</footer>
<script src="${root}dokumentacja.js" defer></script>
</body>
</html>
`;

// ── strony: zapis ──────────────────────────────────────────────────────────
mkdirSync(outDir, { recursive: true });
pages.forEach((p, idx) => {
  const prev = pages[idx - 1], nextP = pages[idx + 1];
  const main = `  <main class="doc-main">
    <p class="doc-crumbs"><a href="../">Dokumentacja</a><span aria-hidden="true">›</span><span>${esc(p.chapter.title)}</span></p>
    <h1>${esc(p.title)}</h1>
    ${p.lead ? `<p class="doc-lead">${inline(p.lead, p.ctx)}</p>` : ''}
    <div class="doc-body">
${p.html}
    </div>
    <nav class="doc-pager" aria-label="Sąsiednie strony">${prev ? `<a class="prev" href="../${prev.slug}/"><span>Poprzednia</span><b>${esc(prev.title)}</b></a>` : '<span></span>'}${nextP ? `<a class="next" href="../${nextP.slug}/"><span>Następna</span><b>${esc(nextP.title)}</b></a>` : ''}</nav>
  </main>`;
  const toc = p.toc.length ? `<p class="doc-toc-title">Na tej stronie</p><ul>${p.toc.map((t) => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ul>` : '';
  mkdirSync(join(outDir, p.slug), { recursive: true });
  writeFileSync(join(outDir, p.slug, 'index.html'), shell({ root: '../../', docroot: '../', title: p.title, desc: p.lead ?? `${p.title} - podręcznik UZ Aero`, bodyClass: 'doc-page', current: p.slug, main, toc }));
});

const homeMain = `  <main class="doc-main doc-home">
    <p class="kicker">Dokumentacja</p>
    <h1 class="h-display">Podręcznik<br>UZ Aero</h1>
    <p class="doc-lead">${esc(siteLead)}</p>
    ${searchBox('./', true)}
    <p class="doc-start"><span>Zacznij tutaj</span>${START.filter((s) => known.has(s)).map((s) => `<a href="${s}/">${esc(pages.find((p) => p.slug === s).title)}</a>`).join('')}</p>
    <div class="doc-chapters">${chapters.map((c) => `
      <section class="doc-chapter"><h2>${esc(c.title)}</h2><ul>${c.pages.map((p) => `<li><a href="${p.slug}/"><b>${esc(p.title)}</b>${p.lead ? `<span>${esc(p.lead)}</span>` : ''}</a></li>`).join('')}</ul></section>`).join('')}
    </div>
  </main>`;
writeFileSync(join(outDir, 'index.html'), shell({ root: '../', docroot: './', title: 'Podręcznik', desc: siteLead, bodyClass: 'doc-page is-home', current: null, main: homeMain, toc: '' }));

const index = pages.map((p) => ({ u: `${p.slug}/`, t: p.title, c: p.chapter.title, l: p.lead ?? '', h: p.toc.map((t) => t.text), b: p.text.slice(0, 9000) }));
writeFileSync(join(outDir, 'search.json'), JSON.stringify(index));

for (const w of warnings) console.warn(`UWAGA: ${w}`);
console.log(`OK: ${pages.length} stron w ${chapters.length} rozdziałach, ${allScreens.size} ekranów, ${allPanels.size} makiet panelu → ${outDir}`);
